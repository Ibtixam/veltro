import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CentralEngineClient — the ONLY bridge to the sovereign discovery+scoring
 * engine (PROVENA/Veltro core). This platform NEVER reimplements scoring.
 * All scores, rankings and prospect data originate here. Engine internals
 * (weights, model cascade, prompts) are never returned to callers.
 */
export interface DiscoverRequest {
  ownerId: string;
  cohortId: string;
  profile: {
    industries: string[]; countries: string[];
    keywords: string[]; exclusions: string[];
    minRevenue?: number | null; maxRevenue?: number | null;
    signalWeights?: unknown;     // sovereign — passed through, never logged client-side
  };
  targetCount: number;
  tokenBudgetCents: number;      // circuit-breaker budget for this call
}

export interface DiscoveredProspect {
  company: string; domain?: string; contactName?: string; contactEmail?: string; country?: string;
  score: number;                 // sovereign score — computed by the engine
  scoreBand: string;             // display-only band
  engineData: unknown;           // sovereign payload — caller must NOT expose
}

export interface DiscoverResult {
  prospects: DiscoveredProspect[];
  tokensSpentCents: number;
  engineRef: string;
  capped: boolean;               // true if the engine stopped on budget
}

@Injectable()
export class CentralEngineClient {
  private readonly logger = new Logger(CentralEngineClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('CENTRAL_ENGINE_URL', '');
    this.apiKey = this.config.get<string>('CENTRAL_ENGINE_KEY', '');
  }

  /** Discover + score prospects via the central engine, bounded by token budget. */
  async discover(req: DiscoverRequest): Promise<DiscoverResult> {
    if (!this.baseUrl || !this.apiKey) {
      // Fail safe: no engine configured → return empty, do NOT fabricate scores.
      this.logger.warn('Central engine not configured — discovery returns empty (no local scoring).');
      return { prospects: [], tokensSpentCents: 0, engineRef: 'unconfigured', capped: false };
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        this.logger.error(`Central engine ${res.status}`);
        return { prospects: [], tokensSpentCents: 0, engineRef: `error-${res.status}`, capped: false };
      }
      const data = await res.json() as any;
      return {
        prospects: data.prospects ?? [],
        tokensSpentCents: data.tokensSpentCents ?? 0,
        engineRef: data.engineRef ?? 'unknown',
        capped: Boolean(data.capped),
      };
    } catch (e: any) {
      this.logger.error(`Central engine call failed: ${e.message}`);
      return { prospects: [], tokensSpentCents: 0, engineRef: 'exception', capped: false };
    }
  }
}
