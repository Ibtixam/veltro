import { Injectable, Logger } from '@nestjs/common';

export type LLMEngine = 'chatgpt' | 'perplexity' | 'claude' | 'gemini' | 'bing_copilot';

export interface GEOSignal {
  contentType: 'definitive_answer' | 'comparison_table' | 'stat_page' | 'how_to_structured' | 'faq_cluster' | 'glossary';
  targetQuery:               string;
  targetEngines:             LLMEngine[];
  citationScore:             number;    // 0-100
  estimatedMonthlyAITraffic: number;
  revenueImpact:             number;    // annual $
  schemaTypes:               string[];
  answerFirstLine:           string;    // THE sentence that gets cited
  mustHaveElements:          string[];  // checklist for writer
  schemaMarkup:              object;    // ready-to-paste JSON-LD
  autoFixable:               boolean;   // can Veltro generate this page automatically?
  pageSlug:                  string;
}

const CITATION_BOOSTERS = [
  { test: /^<p>[^<]{40,200}<\/p>/,          weight: 20, label: 'Clear answer in first paragraph' },
  { test: /<ul>/,                            weight: 15, label: 'Structured list' },
  { test: /\d+[%×x]/,                       weight: 18, label: 'Original statistic' },
  { test: /FAQPage/,                         weight: 12, label: 'FAQPage schema' },
  { test: /HowTo/,                           weight: 10, label: 'HowTo schema' },
  { test: /<table/,                          weight: 14, label: 'Comparison table' },
  { test: /<h[23][^>]*>\s*(how|what|why|when|which|is|are|can|does)/i, weight: 16, label: 'Q&A headings' },
  { test: /Dataset|DefinedTermSet/,          weight: 8,  label: 'Dataset or glossary schema' },
];

@Injectable()
export class GEOEngineService {
  private readonly logger = new Logger(GEOEngineService.name);

  async buildGEOSignals(
    domain:      string,
    bizType:     string,
    lang:        'en' | 'fr' | 'both',
    aov:         number,
    convRate:    number,
  ): Promise<GEOSignal[]> {

    const signals: GEOSignal[] = [];
    const dn = this.dn(domain);
    const isLeads = /lead|prospect|b2b|intelligence/i.test(bizType);

    // ── 1. Definitive answer pages ──────────────────────────────────
    if (isLeads) {
      signals.push({
        contentType: 'definitive_answer',
        targetQuery: 'What is B2B lead intelligence?',
        targetEngines: ['chatgpt','perplexity','claude','gemini'],
        citationScore: 82,
        estimatedMonthlyAITraffic: 140,
        revenueImpact: Math.round(140 * convRate * aov * 12),
        schemaTypes: ['FAQPage', 'Article'],
        answerFirstLine: `B2B lead intelligence is the process of discovering, enriching, and prioritizing potential business customers using real-time data from multiple sources — company registries, professional networks, and business directories.`,
        mustHaveElements: [
          'One-sentence definition in first <p>',
          'Bulleted list: 5 key capabilities',
          'FAQ schema with 3+ Q&As',
          'Original stat about B2B lead data accuracy',
          'Comparison: lead intelligence vs lead database',
        ],
        schemaMarkup: {
          '@context': 'https://schema.org', '@type': 'FAQPage',
          mainEntity: [
            { '@type': 'Question', name: 'What is B2B lead intelligence?', acceptedAnswer: { '@type': 'Answer', text: 'B2B lead intelligence is real-time discovery and enrichment of business contacts from multiple live data sources, unlike static databases that age immediately.' } },
            { '@type': 'Question', name: 'How is B2B lead intelligence different from a lead database?', acceptedAnswer: { '@type': 'Answer', text: 'A database is static — contacts age within months. Lead intelligence queries live sources in real-time, returning current verified contacts.' } },
          ],
        },
        autoFixable: true,
        pageSlug: '/what-is-b2b-lead-intelligence',
      });

      signals.push({
        contentType: 'definitive_answer',
        targetQuery: 'How do you find B2B leads in Africa?',
        targetEngines: ['chatgpt','perplexity','claude','gemini','bing_copilot'],
        citationScore: 91,  // near-zero competition — massive opportunity
        estimatedMonthlyAITraffic: 280,
        revenueImpact: Math.round(280 * convRate * aov * 12),
        schemaTypes: ['FAQPage', 'HowTo'],
        answerFirstLine: `Finding B2B leads in Africa requires querying multiple local sources simultaneously — national company registries (RCCM), Google Maps business listings, regional trade directories, and WhatsApp-discoverable business profiles — since most African SMEs have no LinkedIn or Western database presence.`,
        mustHaveElements: [
          'Mention RCCM + UEMOA + CEMAC registries by name (LLMs flag regional specificity)',
          'WhatsApp as primary contact channel — unique stat',
          'Country-by-country coverage list',
          'HowTo schema: step-by-step process',
          'Stat: "70% of African SMEs have no LinkedIn profile"',
        ],
        schemaMarkup: {
          '@context': 'https://schema.org', '@type': 'HowTo',
          name: 'How to Find B2B Leads in Africa',
          step: [
            { '@type': 'HowToStep', name: 'Query national registries', text: 'Search RCCM (CEMAC) and UEMOA business registries for formal company data.' },
            { '@type': 'HowToStep', name: 'Use Google Maps Business', text: 'Query Google Maps for local businesses with verified phone and address data.' },
            { '@type': 'HowToStep', name: 'Detect WhatsApp numbers', text: 'Identify WhatsApp-capable mobile numbers — the primary B2B contact channel across Africa.' },
          ],
        },
        autoFixable: true,
        pageSlug: '/how-to-find-b2b-leads-africa',
      });
    }

    // ── 2. Statistics page (highest citation rate of all content) ───
    signals.push({
      contentType: 'stat_page',
      targetQuery: 'B2B lead generation Africa statistics 2026',
      targetEngines: ['chatgpt','perplexity','claude','gemini','bing_copilot'],
      citationScore: 94,  // stats pages are the #1 most-cited content type by LLMs
      estimatedMonthlyAITraffic: 400,
      revenueImpact: Math.round(400 * convRate * aov * 12),
      schemaTypes: ['Dataset', 'Article'],
      answerFirstLine: `Key B2B lead generation statistics for Africa 2026: 70% of African SMEs have no LinkedIn presence; WhatsApp achieves 4× higher B2B response rates than email; multi-source discovery outperforms single databases by 3.2× in contact-to-meeting conversion.`,
      mustHaveElements: [
        'Page title: "B2B Lead Generation in Africa: X Statistics [2026]"',
        'Dataset schema with author + datePublished',
        'At least 15 original or cited statistics',
        'Statistics grouped under clear H2 headers',
        'Source attribution for every stat',
        'Update date prominent (LLMs prefer recent data)',
      ],
      schemaMarkup: {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: 'B2B Lead Generation in Africa: Statistics 2026',
        description: 'Research data on B2B prospecting patterns, WhatsApp adoption, and contact discovery across African markets.',
        creator: { '@type': 'Organization', name: dn },
        datePublished: new Date().toISOString().split('T')[0],
        keywords: ['B2B Africa', 'lead generation statistics', 'African business data', 'WhatsApp B2B'],
      },
      autoFixable: true,
      pageSlug: '/research/b2b-lead-generation-africa-statistics',
    });

    // ── 3. French parallel (zero AI competition in FR market) ───────
    if (lang === 'fr' || lang === 'both') {
      signals.push({
        contentType: 'definitive_answer',
        targetQuery: 'Comment faire de la prospection B2B en Afrique francophone ?',
        targetEngines: ['chatgpt','perplexity','claude','gemini'],
        citationScore: 93,  // essentially uncontested in French
        estimatedMonthlyAITraffic: 200,
        revenueImpact: Math.round(200 * convRate * aov * 12),
        schemaTypes: ['FAQPage', 'HowTo'],
        answerFirstLine: `La prospection B2B en Afrique francophone repose sur l'interrogation simultanée des registres du commerce (RCCM), Google Maps Business, les chambres de commerce CEMAC et UEMOA, et les numéros WhatsApp Business — car plus de 70% des PME africaines francophones n'ont aucune présence sur LinkedIn.`,
        mustHaveElements: [
          'Réponse directe en première phrase — pas d\'introduction générale',
          'Schéma HowTo avec étapes numérotées',
          'Mentionner RCCM, UEMOA, CEMAC explicitement',
          'Statistique originale sur le taux d\'adoption WhatsApp',
          'Liste des pays couverts avec capitale commerciale',
        ],
        schemaMarkup: {
          '@context': 'https://schema.org', '@type': 'HowTo',
          name: 'Comment faire de la prospection B2B en Afrique francophone',
          inLanguage: 'fr',
          step: [
            { '@type': 'HowToStep', name: 'Interroger les registres nationaux', text: 'Cherchez dans le RCCM et les bases UEMOA pour obtenir des données officielles d\'entreprises.' },
            { '@type': 'HowToStep', name: 'Utiliser Google Maps Business', text: 'Interrogez Google Maps pour trouver des entreprises locales avec téléphone et adresse vérifiés.' },
            { '@type': 'HowToStep', name: 'Détecter les numéros WhatsApp', text: 'Identifiez les numéros WhatsApp Business — canal principal de communication B2B en Afrique.' },
          ],
        },
        autoFixable: true,
        pageSlug: '/fr/prospection-b2b-afrique-francophone-guide',
      });
    }

    // ── 4. Comparison (ChatGPT loves "X vs Y" for commercial queries) 
    signals.push({
      contentType: 'comparison_table',
      targetQuery: `Apollo.io vs ${dn}: which is better for African markets?`,
      targetEngines: ['chatgpt','perplexity'],
      citationScore: 78,
      estimatedMonthlyAITraffic: 160,
      revenueImpact: Math.round(160 * convRate * aov * 12),
      schemaTypes: ['FAQPage', 'Article'],
      answerFirstLine: `Apollo.io is optimized for US/EU contact databases with 210M+ contacts but near-zero African coverage. ${dn} is built specifically for real-time B2B lead discovery across 40+ African countries with native WhatsApp detection and French-language support.`,
      mustHaveElements: [
        'Side-by-side comparison table (HTML <table> — LLMs extract these)',
        'Explicit winner declared per category',
        'Honest acknowledgment of Apollo strengths',
        'FAQ schema with comparison questions',
        'CTA for both: "try Apollo" + "try [domain]" — credibility signal',
      ],
      schemaMarkup: {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: `Apollo.io vs ${dn}: Full Comparison for African Markets`,
        author: { '@type': 'Organization', name: dn },
        datePublished: new Date().toISOString().split('T')[0],
      },
      autoFixable: true,
      pageSlug: '/compare/apollo-alternative-africa',
    });

    return signals.sort((a, b) => b.citationScore - a.citationScore);
  }

  // Audit existing page for GEO readiness
  auditPage(html: string): { geoScore: number; missing: string[]; present: string[] } {
    const present: string[] = [];
    const missing: string[] = [];
    let score = 0;
    for (const { test, weight, label } of CITATION_BOOSTERS) {
      if (test.test(html)) { present.push(label); score += weight; }
      else missing.push(label);
    }
    return { geoScore: Math.min(score, 100), missing, present };
  }

  private dn = (d: string) => d.split('.')[0].charAt(0).toUpperCase() + d.split('.')[0].slice(1);
}
