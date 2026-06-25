import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueSignal } from '../revenue-engine/revenue-engine.service';

// ─── AUTOPILOT: the "I already did it for you" layer ─────────────────────
//
// Level 1 (now):   Generate ZIP — customer deploys manually
// Level 2 (Q3):    Auto-publish via CMS API (WordPress REST, Webflow CMS, Contentful)
// Level 3 (Q4):    Monitor performance → auto-rollback if traffic drops > 20% in 7 days
//
// This service implements Level 2 + 3 interfaces.
// Level 1 (ZIP generation) is handled by CodeGeneratorService.

export type AutopilotMode = 'off' | 'suggest' | 'autopilot';

export interface AutopilotConfig {
  mode:              AutopilotMode;
  // CMS credentials (stored encrypted, never logged)
  cmsType:           'wordpress' | 'webflow' | 'contentful' | 'sanity' | 'ghost';
  cmsApiUrl:         string;
  cmsApiKey:         string;      // encrypted at rest
  cmsApiSecret?:     string;      // encrypted at rest
  // Safety rails
  maxActionsPerDay:  number;      // default 3
  requireApproval:   boolean;     // if true: queue actions, send email for approval
  rollbackThreshold: number;      // 0.20 = roll back if traffic drops >20% in 7 days
  // Notification
  notifyEmail:       string;
  notifyOnEvery:     boolean;     // false = only notify on errors / rollbacks
}

export interface AutopilotAction {
  id:           string;
  signal:       RevenueSignal;
  status:       'queued' | 'pending_approval' | 'executing' | 'done' | 'failed' | 'rolled_back';
  createdAt:    Date;
  executedAt?:  Date;
  rolledBackAt?: Date;
  cmsPostId?:   string;       // ID of created/updated post in CMS
  snapshotBefore?: string;    // previous content (for rollback)
  performanceAfter?: {
    clicksDelta:  number;
    positionDelta: number;
    measuredAt:   Date;
  };
}

export interface CMSPublishResult {
  success:   boolean;
  postId?:   string;
  url?:      string;
  error?:    string;
}

// ─── SERVICE ─────────────────────────────────────────────────────────────

@Injectable()
export class AutopilotService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger(AutopilotService.name);

  // ─── LEVEL 2: AUTO-PUBLISH via CMS API ───────────────────────────────

  async executeAction(signal: RevenueSignal, cfg: AutopilotConfig, generatedContent: string): Promise<AutopilotAction> {
    const action: AutopilotAction = {
      id:        `action-${Date.now()}`,
      signal,
      status:    cfg.requireApproval ? 'pending_approval' : 'queued',
      createdAt: new Date(),
    };

    if (cfg.requireApproval) {
      this.logger.log(`Action queued for approval: ${signal.actionType} on ${signal.pageUrl}`);
      // Email approval link — implementor wires this to DeliveryService
      return action;
    }

    action.status = 'executing';
    action.executedAt = new Date();

    try {
      const result = await this.publishToCMS(cfg, signal, generatedContent);
      if (result.success) {
        action.status   = 'done';
        action.cmsPostId = result.postId;
        this.logger.log(`Auto-published: ${result.url}`);
      } else {
        action.status = 'failed';
        this.logger.error(`Publish failed: ${result.error}`);
      }
    } catch (err) {
      action.status = 'failed';
      this.logger.error(`Autopilot error: ${err}`);
    }

    return action;
  }

  // ─── LEVEL 3: PERFORMANCE MONITOR + AUTO-ROLLBACK ────────────────────

  async checkAndRollback(action: AutopilotAction, cfg: AutopilotConfig, currentClicksDelta: number): Promise<boolean> {
    if (action.status !== 'done' || !action.cmsPostId) return false;

    const daysSincePublish = (Date.now() - (action.executedAt?.getTime() ?? 0)) / 86_400_000;
    if (daysSincePublish < 7) return false;   // give it 7 days before judging

    if (currentClicksDelta < -cfg.rollbackThreshold) {
      this.logger.warn(`Rolling back ${action.id}: traffic dropped ${(currentClicksDelta*100).toFixed(1)}%`);
      await this.rollbackCMS(cfg, action);
      action.status      = 'rolled_back';
      action.rolledBackAt = new Date();
      action.performanceAfter = {
        clicksDelta:   currentClicksDelta,
        positionDelta: 0,
        measuredAt:    new Date(),
      };
      return true;
    }

    return false;
  }

  // ─── CMS PUBLISHERS ──────────────────────────────────────────────────

  private async publishToCMS(cfg: AutopilotConfig, signal: RevenueSignal, content: string): Promise<CMSPublishResult> {
    switch (cfg.cmsType) {
      case 'wordpress':  return this.publishWordPress(cfg, signal, content);
      case 'webflow':    return this.publishWebflow(cfg, signal, content);
      case 'contentful': return this.publishContentful(cfg, signal, content);
      case 'ghost':      return this.publishGhost(cfg, signal, content);
      default:           return { success: false, error: `CMS type "${cfg.cmsType}" not yet supported` };
    }
  }

  private async publishWordPress(cfg: AutopilotConfig, signal: RevenueSignal, content: string): Promise<CMSPublishResult> {
    const slug  = signal.pageUrl.split('/').pop() ?? 'veltro-page';
    const title = signal.keyword.replace(/\b\w/g, c => c.toUpperCase());

    try {
      const res = await fetch(`${cfg.cmsApiUrl}/wp-json/wp/v2/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${cfg.cmsApiKey}:${cfg.cmsApiSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          title,
          content,
          slug,
          status: 'publish',
          meta: {
            _yoast_wpseo_focuskw:   signal.keyword,
            _yoast_wpseo_metadesc:  `${title} — real-time B2B intelligence. Free trial.`,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `WordPress API ${res.status}: ${err.slice(0, 200)}` };
      }

      const data = await res.json() as any;
      return { success: true, postId: String(data.id), url: data.link };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private async publishWebflow(cfg: AutopilotConfig, signal: RevenueSignal, content: string): Promise<CMSPublishResult> {
    const slug  = signal.pageUrl.split('/').pop() ?? 'veltro-page';
    const title = signal.keyword.replace(/\b\w/g, c => c.toUpperCase());

    try {
      // Webflow CMS API v2
      const res = await fetch(`${cfg.cmsApiUrl}/collections/${cfg.cmsApiSecret}/items`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${cfg.cmsApiKey}`,
          'accept-version': '1.0.0',
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft:    false,
          fieldData: {
            name:               title,
            slug,
            'body-content':     content,
            'meta-title':       `${title} | Veltro`,
            'meta-description': `${title} — real-time discovery. Free trial.`,
          },
        }),
      });

      if (!res.ok) return { success: false, error: `Webflow API ${res.status}` };
      const data = await res.json() as any;
      return { success: true, postId: data._id, url: `https://${signal.pageUrl}` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private async publishContentful(cfg: AutopilotConfig, signal: RevenueSignal, content: string): Promise<CMSPublishResult> {
    const spaceId = cfg.cmsApiSecret ?? '';
    try {
      // Create entry
      const createRes = await fetch(
        `https://api.contentful.com/spaces/${spaceId}/environments/master/entries`,
        {
          method: 'POST',
          headers: {
            'Content-Type':          'application/vnd.contentful.management.v1+json',
            'Authorization':         `Bearer ${cfg.cmsApiKey}`,
            'X-Contentful-Content-Type': 'seoPage',
          },
          body: JSON.stringify({
            fields: {
              title:   { 'en-US': signal.keyword.replace(/\b\w/g, c => c.toUpperCase()) },
              slug:    { 'en-US': signal.pageUrl.split('/').pop() },
              body:    { 'en-US': content },
              keyword: { 'en-US': signal.keyword },
            },
          }),
        }
      );

      if (!createRes.ok) return { success: false, error: `Contentful create ${createRes.status}` };
      const entry = await createRes.json() as any;

      // Publish entry
      await fetch(
        `https://api.contentful.com/spaces/${spaceId}/environments/master/entries/${entry.sys.id}/published`,
        { method: 'PUT', headers: { Authorization: `Bearer ${cfg.cmsApiKey}`, 'X-Contentful-Version': '1' } }
      );

      return { success: true, postId: entry.sys.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private async publishGhost(cfg: AutopilotConfig, signal: RevenueSignal, content: string): Promise<CMSPublishResult> {
    const slug  = signal.pageUrl.split('/').pop() ?? 'veltro-page';
    const title = signal.keyword.replace(/\b\w/g, c => c.toUpperCase());

    try {
      const res = await fetch(`${cfg.cmsApiUrl}/ghost/api/admin/pages/`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Ghost ${cfg.cmsApiKey}`,
        },
        body: JSON.stringify({
          pages: [{
            title, slug,
            html:   content,
            status: 'published',
            meta_title:       `${title} | Veltro`,
            meta_description: `${title} — real-time discovery.`,
          }],
        }),
      });

      if (!res.ok) return { success: false, error: `Ghost API ${res.status}` };
      const data = await res.json() as any;
      return { success: true, postId: data.pages[0].id, url: data.pages[0].url };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private async rollbackCMS(cfg: AutopilotConfig, action: AutopilotAction): Promise<void> {
    if (!action.cmsPostId) return;
    switch (cfg.cmsType) {
      case 'wordpress':
        await fetch(`${cfg.cmsApiUrl}/wp-json/wp/v2/pages/${action.cmsPostId}`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${Buffer.from(`${cfg.cmsApiKey}:${cfg.cmsApiSecret}`).toString('base64')}` },
        });
        break;
      case 'webflow':
        await fetch(`${cfg.cmsApiUrl}/collections/${cfg.cmsApiSecret}/items/${action.cmsPostId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cfg.cmsApiKey}` },
        });
        break;
      default:
        this.logger.warn(`Rollback not implemented for ${cfg.cmsType}`);
    }
  }
}
