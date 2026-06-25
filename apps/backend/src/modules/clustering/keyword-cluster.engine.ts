/**
 * VELTRO — Keyword Cluster Engine
 * ─────────────────────────────────────────────────────────────────
 * Core logic: find low-KD keyword clusters that together outperform
 * single high-volume keywords in traffic AND conversion.
 *
 * Strategy: 40 x KD15 @ 300vol > 1 x KD60 @ 8000vol
 *   → faster indexation, higher intent match, better conversion
 *
 * Scoring formula:
 *   ClusterScore = (Σ volume_i) / (avg_KD ^ 1.4) × intent_multiplier × freshness
 */

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface RawKeyword {
  keyword: string;
  volume: number;          // monthly searches
  kd: number;              // keyword difficulty 0–100
  cpc?: number;            // cost per click USD
  trend?: number[];        // 12-month volume trend
  serp_features?: string[]; // ['featured_snippet','people_also_ask',...]
  lang?: string;
  country?: string;
}

export interface ClusteredKeyword extends RawKeyword {
  intent: SearchIntent;
  intentScore: number;     // conversion probability 0–1
  semanticGroup: string;
  entityTags: string[];
  opportunityScore: number; // final Veltro score
  isLongTail: boolean;
  wordCount: number;
}

export interface KeywordCluster {
  id: string;
  name: string;
  pillarKeyword: ClusteredKeyword;
  satellites: ClusteredKeyword[];
  totalVolume: number;
  avgKD: number;
  clusterScore: number;           // Veltro composite score
  estimatedMonthlyTraffic: number; // realistic CTR-adjusted
  estimatedConversions: number;
  conversionMultiplier: number;   // vs single keyword approach
  recommendedPageType: PageType;
  contentBrief: ContentBrief;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export type PageType =
  | 'pillar'          // 2000+ words, covers full cluster
  | 'comparison'      // X vs Y format
  | 'how_to'          // step-by-step guide
  | 'landing'         // conversion-focused
  | 'geo_targeted'    // city/country/industry
  | 'faq_hub'         // Q&A format for GEO/AI
  | 'listicle';       // best X for Y

export interface ContentBrief {
  suggestedTitle: string;
  suggestedSlug: string;
  targetWordCount: number;
  mustIncludePhrases: string[];
  h2Structure: string[];
  schemaTypes: string[];
  internalLinkTargets: string[];
  geoAnswerFormats: ('short' | 'medium' | 'long')[];
}

// ─── INTENT DETECTION ──────────────────────────────────────────────────────

const INTENT_SIGNALS: Record<SearchIntent, { triggers: string[]; conversionRate: number }> = {
  transactional: {
    triggers: ['buy','purchase','order','price','cost','cheap','best price','deal',
               'subscribe','get','download','sign up','acheter','prix','abonnement'],
    conversionRate: 0.08,
  },
  commercial: {
    triggers: ['best','top','vs','compare','review','alternative','tool','software',
               'platform','service','agency','meilleur','comparatif','outil'],
    conversionRate: 0.045,
  },
  informational: {
    triggers: ['how','what','why','when','guide','tutorial','example','tips',
               'learn','understand','comment','qu est ce que','pourquoi','guide'],
    conversionRate: 0.012,
  },
  navigational: {
    triggers: ['login','sign in','dashboard','account','official','website','connexion'],
    conversionRate: 0.02,
  },
};

function detectIntent(keyword: string): { intent: SearchIntent; score: number } {
  const kw = keyword.toLowerCase();
  let bestIntent: SearchIntent = 'informational';
  let bestScore = 0;

  for (const [intent, config] of Object.entries(INTENT_SIGNALS) as [SearchIntent, typeof INTENT_SIGNALS[SearchIntent]][]) {
    const matches = config.triggers.filter(t => kw.includes(t)).length;
    const score = matches / config.triggers.length;
    if (score > bestScore) { bestScore = score; bestIntent = intent; }
  }

  // Boost transactional if CPC signals present (long-tail commercial patterns)
  if (kw.split(' ').length >= 4 && bestIntent === 'informational') {
    bestIntent = 'commercial';
  }

  return { intent: bestIntent, score: Math.max(bestScore, 0.1) };
}

// ─── ENTITY / SEMANTIC TAGGING ─────────────────────────────────────────────

const ENTITY_PATTERNS: Record<string, RegExp> = {
  geo:         /\b(france|paris|canada|toronto|cameroun|gabon|afrique|africa|europe|usa|london|berlin)\b/i,
  industry:    /\b(saas|b2b|real estate|legal|finance|fintech|agri|e-commerce|startup|agency)\b/i,
  role:        /\b(ceo|cto|founder|manager|marketer|recruiter|developer|freelance)\b/i,
  action:      /\b(generate|find|build|create|automate|optimize|scale|grow|convert)\b/i,
  product:     /\b(leads|database|list|tool|platform|software|api|dashboard|report)\b/i,
  modifier:    /\b(free|paid|best|top|cheap|fast|easy|advanced|professional|verified)\b/i,
};

function extractEntityTags(keyword: string): string[] {
  const tags: string[] = [];
  for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
    if (pattern.test(keyword)) tags.push(entity);
  }
  return tags;
}

// ─── SEMANTIC GROUPING ─────────────────────────────────────────────────────

function extractSemanticCore(keyword: string): string {
  const stopWords = new Set([
    'the','a','an','of','for','in','on','at','to','with','and','or','is','are',
    'how','what','why','best','top','free','get','find','buy','use',
    'le','la','les','de','du','en','pour','avec','un','une'
  ]);
  const words = keyword.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 3).join('_');
}

// ─── OPPORTUNITY SCORE ─────────────────────────────────────────────────────

function calcOpportunityScore(kw: RawKeyword, intent: SearchIntent, intentScore: number): number {
  const kdPenalty = Math.pow(Math.max(kw.kd, 1), 1.4);
  const volumeValue = Math.log10(Math.max(kw.volume, 1) + 1) * 1000;
  const intentMultiplier = INTENT_SIGNALS[intent].conversionRate * 100;
  const longTailBonus = kw.keyword.split(' ').length >= 4 ? 1.35 : 1;
  const cpcBonus = kw.cpc ? Math.min(kw.cpc * 0.5, 2) : 1;
  const serpBonus = kw.serp_features?.includes('featured_snippet') ? 1.4 : 1;

  const score = (volumeValue / kdPenalty) * intentMultiplier * longTailBonus * cpcBonus * serpBonus;
  return Math.round(score * 10) / 10;
}

// ─── CLUSTER SCORE ────────────────────────────────────────────────────────

function calcClusterScore(keywords: ClusteredKeyword[]): number {
  const totalVol = keywords.reduce((s, k) => s + k.volume, 0);
  const avgKD = keywords.reduce((s, k) => s + k.kd, 0) / keywords.length;
  const avgIntent = keywords.reduce((s, k) => s + k.intentScore, 0) / keywords.length;
  const clusterSizeBonus = Math.log2(keywords.length + 1);
  const longTailRatio = keywords.filter(k => k.isLongTail).length / keywords.length;

  return Math.round(
    (totalVol / Math.pow(avgKD, 1.4)) * avgIntent * clusterSizeBonus * (1 + longTailRatio * 0.5) * 10
  ) / 10;
}

// ─── TRAFFIC + CONVERSION ESTIMATION ─────────────────────────────────────

const CTR_BY_POSITION: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.017,
};

function estimateTraffic(keywords: ClusteredKeyword[]): { traffic: number; conversions: number } {
  let traffic = 0;
  let conversions = 0;

  for (const kw of keywords) {
    // Estimate achievable position based on KD
    const position = kw.kd < 20 ? 3 : kw.kd < 40 ? 6 : kw.kd < 60 ? 10 : 15;
    const ctr = CTR_BY_POSITION[position] ?? 0.01;
    const visits = Math.round(kw.volume * ctr);
    const convRate = INTENT_SIGNALS[kw.intent].conversionRate;
    traffic += visits;
    conversions += Math.round(visits * convRate);
  }

  return { traffic, conversions };
}

// ─── CONTENT BRIEF GENERATOR ─────────────────────────────────────────────

function generateContentBrief(cluster: {
  name: string;
  pillar: ClusteredKeyword;
  satellites: ClusteredKeyword[];
  pageType: PageType;
}): ContentBrief {
  const { pillar, satellites, pageType } = cluster;
  const allKeywords = [pillar, ...satellites];

  const slug = pillar.keyword.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  const wordCountMap: Record<PageType, number> = {
    pillar: 2500, comparison: 1800, how_to: 1500, landing: 1200,
    geo_targeted: 1000, faq_hub: 1400, listicle: 1600,
  };

  const mustInclude = [
    pillar.keyword,
    ...satellites.slice(0, 5).map(k => k.keyword),
    ...allKeywords.flatMap(k => k.entityTags).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4),
  ];

  const h2Map: Record<PageType, string[]> = {
    pillar: [
      `What is ${pillar.keyword}?`,
      `Why ${pillar.keyword} matters in ${new Date().getFullYear()}`,
      `How to choose the best solution`,
      `Top platforms compared`,
      `Step-by-step guide`,
      `Common mistakes to avoid`,
      `FAQs about ${pillar.keyword}`,
    ],
    comparison: [
      `Quick comparison table`,
      `Feature breakdown`,
      `Pricing comparison`,
      `Which one is right for you?`,
      `User reviews summary`,
    ],
    how_to: [
      `What you need before starting`,
      `Step-by-step process`,
      `Pro tips and shortcuts`,
      `Troubleshooting common issues`,
      `Next steps`,
    ],
    landing: [
      `The problem with current solutions`,
      `How ${pillar.keyword} works`,
      `Key benefits`,
      `Pricing`,
      `FAQs`,
    ],
    geo_targeted: [
      `${pillar.keyword} overview`,
      `Local market specifics`,
      `Top providers in this region`,
      `How to get started`,
    ],
    faq_hub: [
      `What is ${pillar.keyword}?`,
      `How does it work?`,
      `Who needs it?`,
      `What are the alternatives?`,
      `How much does it cost?`,
    ],
    listicle: [
      `How we ranked these options`,
      `Top 10 ${pillar.keyword}`,
      `Comparison table`,
      `How to choose`,
      `Final verdict`,
    ],
  };

  return {
    suggestedTitle: generateTitle(pillar, pageType),
    suggestedSlug: slug,
    targetWordCount: wordCountMap[pageType],
    mustIncludePhrases: mustInclude,
    h2Structure: h2Map[pageType] ?? h2Map.pillar,
    schemaTypes: inferSchemaTypes(pageType, pillar.intent),
    internalLinkTargets: satellites.slice(0, 3).map(k =>
      '/' + k.keyword.toLowerCase().replace(/\s+/g, '-').slice(0, 50)
    ),
    geoAnswerFormats: pillar.intent === 'informational'
      ? ['short', 'medium', 'long']
      : ['short', 'medium'],
  };
}

function generateTitle(kw: ClusteredKeyword, pageType: PageType): string {
  const year = new Date().getFullYear();
  const titleTemplates: Record<PageType, string> = {
    pillar:       `${capitalize(kw.keyword)}: The Complete Guide (${year})`,
    comparison:   `Best ${capitalize(kw.keyword)}: Compared & Ranked for ${year}`,
    how_to:       `How to ${capitalize(kw.keyword)} in ${year} (Step-by-Step)`,
    landing:      `${capitalize(kw.keyword)} — Get Started Today`,
    geo_targeted: `${capitalize(kw.keyword)} — Local Guide ${year}`,
    faq_hub:      `${capitalize(kw.keyword)}: All Your Questions Answered`,
    listicle:     `Top 10 ${capitalize(kw.keyword)} Tools in ${year}`,
  };
  return titleTemplates[pageType];
}

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function inferSchemaTypes(pageType: PageType, intent: SearchIntent): string[] {
  const base = ['BreadcrumbList', 'WebPage'];
  if (pageType === 'faq_hub') return [...base, 'FAQPage'];
  if (pageType === 'how_to') return [...base, 'HowTo'];
  if (pageType === 'comparison' || pageType === 'listicle') return [...base, 'ItemList', 'Review'];
  if (pageType === 'landing') return [...base, 'Product', 'Offer', 'Review'];
  if (intent === 'informational') return [...base, 'Article', 'FAQPage'];
  return [...base, 'Article'];
}

function inferPageType(pillar: ClusteredKeyword, satellites: ClusteredKeyword[]): PageType {
  const kw = pillar.keyword.toLowerCase();
  if (kw.includes(' vs ') || kw.includes('vs ') || kw.includes('compare')) return 'comparison';
  if (kw.includes('how to') || kw.includes('comment ')) return 'how_to';
  if (kw.includes('best ') || kw.includes('top ') || kw.includes('meilleur')) return 'listicle';
  if (pillar.entityTags.includes('geo')) return 'geo_targeted';
  if (pillar.intent === 'transactional') return 'landing';
  if (pillar.intent === 'informational' && satellites.some(s => s.keyword.includes('?'))) return 'faq_hub';
  return 'pillar';
}

// ─── MAIN CLUSTERING FUNCTION ─────────────────────────────────────────────

export function clusterKeywords(rawKeywords: RawKeyword[]): KeywordCluster[] {
  // 1. Enrich all keywords
  const enriched: ClusteredKeyword[] = rawKeywords.map(kw => {
    const { intent, score: intentScore } = detectIntent(kw.keyword);
    const entityTags = extractEntityTags(kw.keyword);
    const wordCount = kw.keyword.split(/\s+/).length;
    return {
      ...kw,
      intent,
      intentScore: INTENT_SIGNALS[intent].conversionRate,
      semanticGroup: extractSemanticCore(kw.keyword),
      entityTags,
      opportunityScore: calcOpportunityScore(kw, intent, intentScore),
      isLongTail: wordCount >= 4,
      wordCount,
    };
  });

  // 2. Group by semantic core
  const groups = new Map<string, ClusteredKeyword[]>();
  for (const kw of enriched) {
    const existing = groups.get(kw.semanticGroup) ?? [];
    existing.push(kw);
    groups.set(kw.semanticGroup, existing);
  }

  // 3. Build clusters
  const clusters: KeywordCluster[] = [];

  for (const [groupKey, keywords] of groups.entries()) {
    if (keywords.length === 0) continue;

    // Sort: pillar = highest volume + lowest KD compromise
    const sorted = [...keywords].sort((a, b) =>
      (b.volume / Math.pow(b.kd + 1, 0.8)) - (a.volume / Math.pow(a.kd + 1, 0.8))
    );

    const pillar = sorted[0];
    const satellites = sorted.slice(1);
    const allInCluster = [pillar, ...satellites];

    const totalVolume = allInCluster.reduce((s, k) => s + k.volume, 0);
    const avgKD = allInCluster.reduce((s, k) => s + k.kd, 0) / allInCluster.length;
    const clusterScore = calcClusterScore(allInCluster);
    const { traffic, conversions } = estimateTraffic(allInCluster);

    // Conversion multiplier vs single high-volume keyword approach
    const singleKwTraffic = estimateTraffic([pillar]).traffic;
    const conversionMultiplier = singleKwTraffic > 0
      ? Math.round((traffic / singleKwTraffic) * 10) / 10
      : 1;

    const pageType = inferPageType(pillar, satellites);

    const priority: KeywordCluster['priority'] =
      clusterScore > 500 ? 'critical' :
      clusterScore > 200 ? 'high' :
      clusterScore > 80  ? 'medium' : 'low';

    clusters.push({
      id: `cluster_${groupKey}_${Date.now()}`,
      name: capitalize(pillar.keyword),
      pillarKeyword: pillar,
      satellites,
      totalVolume,
      avgKD: Math.round(avgKD * 10) / 10,
      clusterScore,
      estimatedMonthlyTraffic: traffic,
      estimatedConversions: conversions,
      conversionMultiplier,
      recommendedPageType: pageType,
      contentBrief: generateContentBrief({ name: groupKey, pillar, satellites, pageType }),
      priority,
    });
  }

  // 4. Sort by cluster score descending
  return clusters.sort((a, b) => b.clusterScore - a.clusterScore);
}

// ─── PORTFOLIO ANALYSIS ──────────────────────────────────────────────────

export interface ClusterPortfolio {
  clusters: KeywordCluster[];
  totalEstimatedTraffic: number;
  totalEstimatedConversions: number;
  avgConversionMultiplier: number;
  quickWins: KeywordCluster[];       // High score + low KD
  longTermBets: KeywordCluster[];    // High score + high KD
  contentRoadmap: ContentRoadmapItem[];
}

export interface ContentRoadmapItem {
  week: number;
  cluster: KeywordCluster;
  action: string;
  expectedTrafficGain: number;
}

export function buildPortfolio(clusters: KeywordCluster[]): ClusterPortfolio {
  const totalTraffic = clusters.reduce((s, c) => s + c.estimatedMonthlyTraffic, 0);
  const totalConv = clusters.reduce((s, c) => s + c.estimatedConversions, 0);
  const avgMult = clusters.length > 0
    ? clusters.reduce((s, c) => s + c.conversionMultiplier, 0) / clusters.length
    : 1;

  const quickWins = clusters
    .filter(c => c.avgKD < 30 && c.clusterScore > 100)
    .slice(0, 5);

  const longTermBets = clusters
    .filter(c => c.avgKD >= 50 && c.clusterScore > 300)
    .slice(0, 5);

  // Build 12-week content roadmap
  const contentRoadmap: ContentRoadmapItem[] = [];
  const prioritized = [
    ...clusters.filter(c => c.priority === 'critical'),
    ...clusters.filter(c => c.priority === 'high'),
    ...clusters.filter(c => c.priority === 'medium'),
  ].slice(0, 12);

  prioritized.forEach((cluster, i) => {
    contentRoadmap.push({
      week: i + 1,
      cluster,
      action: `Publish ${cluster.recommendedPageType} page: "${cluster.contentBrief.suggestedTitle}"`,
      expectedTrafficGain: cluster.estimatedMonthlyTraffic,
    });
  });

  return {
    clusters,
    totalEstimatedTraffic: totalTraffic,
    totalEstimatedConversions: totalConv,
    avgConversionMultiplier: Math.round(avgMult * 10) / 10,
    quickWins,
    longTermBets,
    contentRoadmap,
  };
}
