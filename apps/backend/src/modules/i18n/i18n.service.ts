import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from 'redis';

// ─── English ground truth (all keys) ─────────────────────────────────────────
const EN_STRINGS: Record<string, string> = {
  nav_pricing:'Pricing',nav_login:'Log in',nav_signup:'Start free',nav_dashboard:'Dashboard',
  hero_headline:'What should you do today to generate the most revenue from search?',
  hero_sub:'Veltro answers that question every week — with working code, not reports.',
  hero_cta:'Start free — 7 days',hero_demo:'See how it works',
  how_title:'How it works',
  how_s1:'1. Enter your URL',how_s1d:'Veltro auto-detects your technology — Next.js, WordPress, Webflow, and 7 more.',
  how_s2:'2. Connect your data',how_s2d:'Link GSC + GA4 to replace estimates with your real revenue numbers.',
  how_s3:'3. Choose your plan',how_s3d:'Your first SEO analysis runs immediately. Delivered by WhatsApp + email.',
  how_s4:'4. Every week, automatically',how_s4d:'Veltro finds opportunities, generates pages, delivers. You deploy in 30 minutes.',
  stacks_title:'Works with any technology',
  pricing_title:'Simple, growth-focused pricing',
  pricing_sub:'7-day free trial on all plans. No credit card required.',
  pricing_monthly:'Monthly',pricing_annual:'Annual (save 17%)',pricing_lifetime:'Lifetime',
  pricing_mo:'/mo',pricing_yr:'/yr',pricing_cta:'Start free',pricing_popular:'Most popular',
  pay_title:'All payment methods accepted',
  onboard_title:'Set up Veltro',
  onboard_steps:'Account|Website|Your business|Search Console|Analytics|Plan|Ready',
  account_title:'Create your account',name_label:'Your name',email_label:'Email',
  password_label:'Password',phone_label:'Phone (for WhatsApp delivery)',
  phone_hint:'Include country code: +237600000000',country_label:'Country',lang_label:'Language',
  domain_title:'What is your website URL?',domain_label:'Website URL',domain_hint:'e.g. whisperience.com',
  detecting:'Detecting your technology…',
  stack_detected:'{{stack}} detected ({{confidence}}% confidence)',
  stack_low:'Technology not detected — universal HTML format will be used',
  stack_title:'Tell us about your business',biz_type_label:'Business type',
  biz_type_hint:'e.g. B2B SaaS, E-commerce, Agency',revenue_goal:'Monthly revenue goal ($)',
  aov_label:'Average order value ($)',keywords_label:'Seed keywords (1–20)',
  keywords_hint:'Type a keyword, press Enter.',
  gsc_title:'Connect Google Search Console',
  gsc_desc:'Unlocks real click and ranking data — turning revenue estimates from approximate to exact.',
  gsc_cta:'Connect with Google',gsc_skip:'Skip for now (estimates will be approximate)',
  ga4_title:'Select your GA4 property',
  ga4_desc:'Veltro uses GA4 to measure actual conversion rates and revenue per page.',
  ga4_property:'GA4 Property ID',ga4_hint:'GA4 → Admin → Property Settings → Property ID',
  ga4_skip:'Skip (use industry benchmarks)',plan_title:'Choose your plan',pay_method:'Payment method',
  done_title:"You're all set",
  done_desc:'Your first SEO analysis is running. Results by email{{wa}} within 10 minutes.',
  done_wa:' and WhatsApp',done_cta:'Go to dashboard',
  dash_title:'Revenue Dashboard',dash_upside:'Total Annual Upside',dash_quickwin:'Quick Win (Top 3)',
  dash_found:'Actions Found',dash_auto:'Auto-Deployable',dash_all:'All',dash_autotab:'Auto-deploy',
  dash_manual:'Manual',dash_annual:'Annual Gain',dash_monthly:'Monthly',dash_effort:'Effort',
  dash_evidence:'Data Points',dash_implement:'Implementation',
  dash_deploy:'⚡ Auto-Deploy Now',dash_download:'Download Fix ZIP',
  footer_copy:'© 2026 Veltro · Jiogue LLC',next:'Next',back:'Back',skip:'Skip',
};

// ─── Locale metadata for context-aware translation ────────────────────────────
const LOCALE_CONTEXT: Record<string, string> = {
  pt: 'Brazilian Portuguese (B2B SaaS market, casual business register)',
  es: 'Latin American Spanish (LatAm B2B context, use "vos/usted" register)',
  de: 'German (DACH business register, formal Sie)',
  ru: 'Russian (CIS business market, professional register)',
  ja: 'Japanese (polite business register, keigo where appropriate)',
  ko: 'Korean (professional B2B register)',
  tr: 'Turkish (business register)',
  vi: 'Vietnamese (professional B2B register)',
  nl: 'Dutch (Netherlands/Belgium business register)',
  it: 'Italian (professional B2B register)',
  hi: 'Hindi (Indian B2B market, mix Hindi and keep technical terms in English)',
  ha: 'Hausa (Northern Nigeria/Sahel business context)',
  yo: 'Yorùbá (Southwest Nigeria/Benin business context, include tone marks)',
  ig: 'Igbo (Southeast Nigeria business context)',
  am: 'Amharic (Ethiopian business market, use Ethiopic script)',
  rw: 'Kinyarwanda (Rwanda business market)',
  mg: 'Malagasy (Madagascar market)',
};

@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);
  private claude: Anthropic;
  private redis: ReturnType<typeof createClient> | null = null;
  private memCache = new Map<string, Record<string, string>>();

  // TTL: 7 days — translations are stable
  private readonly CACHE_TTL = 60 * 60 * 24 * 7;
  private readonly CACHE_PREFIX = 'veltro:i18n:v1:';

  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.initRedis();
  }

  private async initRedis() {
    try {
      this.redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
      this.redis.on('error', (err: any) => this.logger.warn(`Redis i18n error: ${err.message}`));
      await this.redis.connect();
      this.logger.log('i18n Redis cache connected');
    } catch (e: any) {
      this.logger.warn('Redis unavailable — using in-memory cache only');
      this.redis = null;
    }
  }

  async getTranslation(locale: string): Promise<Record<string, string>> {
    // 1. Memory cache (fastest)
    if (this.memCache.has(locale)) {
      return this.memCache.get(locale)!;
    }

    // 2. Redis cache
    if (this.redis) {
      try {
        const cached = await this.redis.get(`${this.CACHE_PREFIX}${locale}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.memCache.set(locale, parsed);
          return parsed;
        }
      } catch (e: any) {
        this.logger.warn(`Redis read error for ${locale}: ${e.message}`);
      }
    }

    // 3. Generate via Claude
    const translations = await this.generateTranslation(locale);

    // 4. Cache
    this.memCache.set(locale, translations);
    if (this.redis) {
      try {
        await this.redis.setEx(`${this.CACHE_PREFIX}${locale}`, this.CACHE_TTL, JSON.stringify(translations));
      } catch (e: any) {
        this.logger.warn(`Redis write error for ${locale}: ${e.message}`);
      }
    }

    return translations;
  }

  private async generateTranslation(locale: string): Promise<Record<string, string>> {
    this.logger.log(`Generating translations for locale: ${locale}`);

    const localeContext = LOCALE_CONTEXT[locale] || `${locale} language (professional B2B register)`;
    const enJson = JSON.stringify(EN_STRINGS, null, 2);

    const prompt = `You are a professional B2B SaaS localization specialist.

Translate the following UI strings from English to ${localeContext}.

PRODUCT CONTEXT:
- Veltro is an AI SEO revenue platform — it finds keyword opportunities and auto-generates SEO pages
- Primary audience: business owners, marketers, agencies, and African entrepreneurs
- Tone: confident, direct, revenue-focused — not generic SaaS fluff
- "Veltro" is a brand name — never translate it
- Keep technical terms in English: SEO, GSC, GA4, WhatsApp, PayBridge Africa, MTN MoMo, Orange Money, Wave, Stripe, URL, HTML, API
- Keep "{{wa}}" and "{{stack}}" and "{{confidence}}" placeholders exactly as-is
- Keep "|" separators in onboard_steps exactly as-is (they delimit wizard step labels)
- Keep "⚡" emoji as-is
- Keep "© 2026" as-is
- Preserve currency symbols: $

TRANSLATION REQUIREMENTS:
1. Adapt culturally for ${localeContext} — not literal word-for-word translation
2. Use natural phrasing a native speaker would use in a B2B software product
3. For African languages (Hausa, Yorùbá, Igbo, Amharic, Kinyarwanda, Malagasy): lean into local business vocabulary
4. Marketing strings (hero_headline, hero_sub, hero_cta) should sound punchy and compelling in the target language
5. Form labels should be concise
6. Error/help strings (phone_hint, detecting, stack_detected) should be clear and reassuring

Return ONLY a valid JSON object with the same keys as the input. No markdown, no explanation, no extra text — just the JSON.

English strings to translate:
${enJson}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Strip any markdown fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      
      const parsed = JSON.parse(cleaned) as Record<string, string>;

      // Validate: merge with EN fallback for any missing keys
      const result: Record<string, string> = { ...EN_STRINGS };
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.length > 0) {
          result[k] = v;
        }
      }

      this.logger.log(`Translation complete for ${locale}: ${Object.keys(parsed).length} keys`);
      return result;
    } catch (e: any) {
      this.logger.error(`Translation failed for ${locale}: ${e.message}`);
      // Fallback to English
      return { ...EN_STRINGS };
    }
  }

  /**
   * Invalidate cache for a specific locale (e.g. after prompt update)
   */
  async invalidate(locale: string): Promise<void> {
    this.memCache.delete(locale);
    if (this.redis) {
      await this.redis.del(`${this.CACHE_PREFIX}${locale}`);
    }
  }

  /**
   * Warm up all supported Tier 2 locales in the background
   * Call this at app bootstrap to pre-cache before first user request
   */
  async warmup(locales: string[]): Promise<void> {
    this.logger.log(`Warming up ${locales.length} locale(s) in background...`);
    // Stagger requests to avoid hammering the API
    for (const locale of locales) {
      await this.getTranslation(locale);
      await new Promise(r => setTimeout(r, 500)); // 500ms between requests
    }
    this.logger.log('i18n warmup complete');
  }
}
