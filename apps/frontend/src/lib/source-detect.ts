// ════════════════════════════════════════════════════════════════════════
// VELTRO — Source Detection  (Veltro)
// Autodetects inbound traffic from AI platforms and search engines via
// User-Agent, Referer, and query parameters. Used by middleware to serve
// AI/SEO-optimized responses (GEO answer-first content, canonical SEO meta).
// ════════════════════════════════════════════════════════════════════════

export type AIPlatform =
  | 'chatgpt' | 'claude' | 'perplexity' | 'gemini' | 'copilot'
  | 'deepseek' | 'grok' | 'mistral' | 'you' | 'phind';

export type SearchEngine =
  | 'google' | 'bing' | 'duckduckgo' | 'brave' | 'yandex'
  | 'baidu' | 'ecosia' | 'startpage' | 'qwant' | 'naver';

export interface SourceSignal {
  kind: 'ai' | 'search' | 'direct';
  platform?: AIPlatform;
  engine?: SearchEngine;
  isBot: boolean;        // crawler/fetcher (vs human arriving via referral)
  confidence: number;    // 0..1
  raw: { ua: string; referer: string };
}

// ── AI crawler / fetcher User-Agent signatures ──────────────────────────
const AI_BOT_UA: Record<AIPlatform, RegExp> = {
  chatgpt:    /GPTBot|ChatGPT-User|OAI-SearchBot/i,
  claude:     /ClaudeBot|Claude-Web|anthropic-ai/i,
  perplexity: /PerplexityBot|Perplexity-User/i,
  gemini:     /Google-Extended|GoogleOther|Gemini/i,
  copilot:    /BingBot.*copilot|CopilotBot/i,
  deepseek:   /DeepSeekBot/i,
  grok:       /xAI|GrokBot/i,
  mistral:    /MistralAI-User|MistralBot/i,
  you:        /YouBot/i,
  phind:      /PhindBot/i,
};

// ── AI platform referrer hosts (human clicked a citation) ───────────────
const AI_REFERER: Record<AIPlatform, RegExp> = {
  chatgpt:    /chat\.openai\.com|chatgpt\.com/i,
  claude:     /claude\.ai/i,
  perplexity: /perplexity\.ai/i,
  gemini:     /gemini\.google\.com|bard\.google\.com/i,
  copilot:    /copilot\.microsoft\.com|bing\.com\/chat/i,
  deepseek:   /deepseek\.com/i,
  grok:       /grok\.com|x\.ai/i,
  mistral:    /chat\.mistral\.ai|lechat/i,
  you:        /you\.com/i,
  phind:      /phind\.com/i,
};

// ── Search engine referrer hosts ────────────────────────────────────────
const SEARCH_REFERER: Record<SearchEngine, RegExp> = {
  google:     /google\.[a-z.]+/i,
  bing:       /bing\.com/i,
  duckduckgo: /duckduckgo\.com/i,
  brave:      /search\.brave\.com/i,
  yandex:     /yandex\.[a-z]+/i,
  baidu:      /baidu\.com/i,
  ecosia:     /ecosia\.org/i,
  startpage:  /startpage\.com/i,
  qwant:      /qwant\.com/i,
  naver:      /naver\.com/i,
};

// ── Search engine crawler User-Agents ───────────────────────────────────
const SEARCH_BOT_UA: Record<SearchEngine, RegExp> = {
  google:     /Googlebot|Google-InspectionTool|Storebot-Google/i,
  bing:       /Bingbot|msnbot|BingPreview/i,
  duckduckgo: /DuckDuckBot|DuckDuckGo/i,
  brave:      /BraveBot/i,
  yandex:     /YandexBot/i,
  baidu:      /Baiduspider/i,
  ecosia:     /EcosiaBot/i,
  startpage:  /StartpageBot/i,
  qwant:      /Qwantify/i,
  naver:      /Yeti|NaverBot/i,
};

function matchMap<T extends string>(text: string, map: Record<T, RegExp>): T | undefined {
  for (const key in map) {
    if (map[key as T].test(text)) return key as T;
  }
  return undefined;
}

/**
 * Detect the inbound traffic source from request signals.
 * Priority: AI bot UA → search bot UA → AI referer → search referer → direct.
 */
export function detectSource(ua: string, referer: string, url?: string): SourceSignal {
  const raw = { ua: ua || '', referer: referer || '' };

  // 1. AI crawler/fetcher (highest value — this is the GEO surface)
  const aiBot = matchMap(ua, AI_BOT_UA);
  if (aiBot) return { kind: 'ai', platform: aiBot, isBot: true, confidence: 0.98, raw };

  // 2. Search engine crawler
  const searchBot = matchMap(ua, SEARCH_BOT_UA);
  if (searchBot) return { kind: 'search', engine: searchBot, isBot: true, confidence: 0.98, raw };

  // 3. Human arriving from an AI platform citation
  const aiRef = matchMap(referer, AI_REFERER);
  if (aiRef) return { kind: 'ai', platform: aiRef, isBot: false, confidence: 0.9, raw };

  // 4. Human arriving from a search engine
  const searchRef = matchMap(referer, SEARCH_REFERER);
  if (searchRef) return { kind: 'search', engine: searchRef, isBot: false, confidence: 0.9, raw };

  // 5. Query-param hints (e.g. ?utm_source=chatgpt, ?ref=perplexity)
  if (url) {
    try {
      const q = new URL(url).searchParams;
      const src = (q.get('utm_source') || q.get('ref') || q.get('source') || '').toLowerCase();
      if (src) {
        const aiQ = matchMap(src, Object.fromEntries(
          Object.keys(AI_REFERER).map(k => [k, new RegExp(k, 'i')]),
        ) as Record<AIPlatform, RegExp>);
        if (aiQ) return { kind: 'ai', platform: aiQ, isBot: false, confidence: 0.7, raw };
        const seQ = matchMap(src, Object.fromEntries(
          Object.keys(SEARCH_REFERER).map(k => [k, new RegExp(k, 'i')]),
        ) as Record<SearchEngine, RegExp>);
        if (seQ) return { kind: 'search', engine: seQ, isBot: false, confidence: 0.7, raw };
      }
    } catch { /* ignore malformed url */ }
  }

  return { kind: 'direct', isBot: false, confidence: 1, raw };
}

export const ALL_AI_PLATFORMS = Object.keys(AI_BOT_UA) as AIPlatform[];
export const ALL_SEARCH_ENGINES = Object.keys(SEARCH_REFERER) as SearchEngine[];
