import { Injectable, Logger } from '@nestjs/common';

export type DetectedStack =
  | 'nextjs' | 'wordpress' | 'webflow' | 'nuxt' | 'astro'
  | 'gatsby' | 'shopify' | 'wix' | 'squarespace' | 'html';

export interface StackSignal {
  stack:      DetectedStack;
  confidence: number;
  evidence:   string[];
  version?:   string;
  extras: {
    hasTypeScript: boolean;
    hasTailwind:   boolean;
    hasAppRouter:  boolean;
    wpPlugins:     string[];
    wpTheme?:      string;
    isHeadless:    boolean;
    cdnProvider?:  string;
    serverPlatform?: string;
  };
}

const BODY_RULES = [
  { pattern: /__NEXT_DATA__/,                              stack: 'nextjs'      as DetectedStack, confidence: 99 },
  { pattern: /\/_next\/static\//,                          stack: 'nextjs'      as DetectedStack, confidence: 95 },
  { pattern: /__NUXT__/,                                   stack: 'nuxt'        as DetectedStack, confidence: 99 },
  { pattern: /\/_nuxt\//,                                  stack: 'nuxt'        as DetectedStack, confidence: 95 },
  { pattern: /astro-island/,                               stack: 'astro'       as DetectedStack, confidence: 95 },
  { pattern: /___gatsby/,                                  stack: 'gatsby'      as DetectedStack, confidence: 99 },
  { pattern: /wp-content\//,                               stack: 'wordpress'   as DetectedStack, confidence: 95 },
  { pattern: /wp-includes\//,                              stack: 'wordpress'   as DetectedStack, confidence: 95 },
  { pattern: /<meta name="generator" content="WordPress/i, stack: 'wordpress'   as DetectedStack, confidence: 99 },
  { pattern: /data-wf-site/,                               stack: 'webflow'     as DetectedStack, confidence: 99 },
  { pattern: /webflow\.com\/css/,                          stack: 'webflow'     as DetectedStack, confidence: 95 },
  { pattern: /<meta[^>]*Webflow/i,                         stack: 'webflow'     as DetectedStack, confidence: 99 },
  { pattern: /Shopify\.theme/,                             stack: 'shopify'     as DetectedStack, confidence: 99 },
  { pattern: /cdn\.shopify\.com/,                          stack: 'shopify'     as DetectedStack, confidence: 95 },
  { pattern: /static\.wixstatic\.com/,                     stack: 'wix'         as DetectedStack, confidence: 99 },
  { pattern: /squarespace\.com/,                           stack: 'squarespace' as DetectedStack, confidence: 95 },
];

const WP_PLUGINS = [
  { pattern: /woocommerce/i, plugin: 'WooCommerce' },
  { pattern: /yoast/i,       plugin: 'Yoast SEO' },
  { pattern: /rank-math/i,   plugin: 'Rank Math SEO' },
  { pattern: /elementor/i,   plugin: 'Elementor' },
  { pattern: /divi/i,        plugin: 'Divi' },
  { pattern: /wpml/i,        plugin: 'WPML' },
  { pattern: /polylang/i,    plugin: 'Polylang' },
];

@Injectable()
export class StackDetectorService {
  private readonly logger = new Logger(StackDetectorService.name);

  async detect(url: string): Promise<StackSignal> {
    const domain = this.normalize(url);
    this.logger.log(`Detecting stack: ${domain}`);
    try {
      const res = await fetch(`https://${domain}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veltro/2.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      const headers  = Object.fromEntries(res.headers.entries());
      const body     = await res.text();
      const finalUrl = res.url;

      const scores = new Map<DetectedStack, number>();
      const evidence: string[] = [];
      const add = (stack: DetectedStack, score: number, reason: string) => {
        scores.set(stack, (scores.get(stack) ?? 0) + score);
        evidence.push(`[${stack}+${score}] ${reason}`);
      };

      // Header signals
      const xpb = headers['x-powered-by'] ?? '';
      if (/next\.js/i.test(xpb))   add('nextjs',    95, 'x-powered-by: Next.js');
      if (/nuxt/i.test(xpb))       add('nuxt',      95, 'x-powered-by: Nuxt');
      if (/wordpress/i.test(xpb))  add('wordpress', 95, 'x-powered-by: WordPress');
      if (headers['x-wix-request-id']) add('wix',   99, 'Wix header');
      if (headers['x-shopify-stage']) add('shopify', 99, 'Shopify header');
      if (/vercel/i.test(headers['server'] ?? '')) add('nextjs', 55, 'Vercel server');

      // Body signals
      for (const r of BODY_RULES) {
        if (r.pattern.test(body)) add(r.stack, r.confidence, r.pattern.source.slice(0, 30));
      }

      // URL signals
      if (finalUrl.includes('vercel.app'))   add('nextjs',      70, 'vercel.app');
      if (finalUrl.includes('webflow.io'))   add('webflow',     99, 'webflow.io');
      if (finalUrl.includes('wixsite.com'))  add('wix',         99, 'wixsite.com');
      if (finalUrl.includes('myshopify'))    add('shopify',     99, 'myshopify');
      if (finalUrl.includes('squarespace'))  add('squarespace', 99, 'squarespace');

      let bestStack: DetectedStack = 'html', bestScore = 0;
      for (const [stack, score] of scores.entries()) {
        if (score > bestScore) { bestScore = score; bestStack = stack; }
      }

      const wpPlugins = bestStack === 'wordpress'
        ? WP_PLUGINS.filter(p => p.pattern.test(body)).map(p => p.plugin) : [];
      const wpTheme = body.match(/wp-content\/themes\/([^/'"]+)/)?.[1];
      const cdnProvider = (() => {
        if (headers['cf-ray']) return 'Cloudflare';
        if (/vercel/i.test(headers['server'] ?? '')) return 'Vercel';
        if (headers['x-netlify-cache']) return 'Netlify';
        return undefined;
      })();

      let version: string | undefined;
      const wpVer = body.match(/<meta name="generator" content="WordPress ([0-9.]+)"/i);
      if (wpVer) version = `WordPress ${wpVer[1]}`;

      return {
        stack: bestStack,
        confidence: Math.min(bestScore, 100),
        evidence,
        version,
        extras: {
          hasTypeScript: /\.tsx?["']/.test(body),
          hasTailwind:   /tailwind|tw-/.test(body),
          hasAppRouter:  bestStack === 'nextjs' && body.includes('"app"'),
          wpPlugins, wpTheme,
          isHeadless: bestStack === 'wordpress' && body.includes('wp-json'),
          cdnProvider,
        },
      };
    } catch (err) {
      this.logger.warn(`Detection failed for ${domain}: ${err}`);
      return {
        stack: 'html', confidence: 0, evidence: [`Failed: ${err}`],
        extras: { hasTypeScript:false, hasTailwind:false, hasAppRouter:false, wpPlugins:[], isHeadless:false },
      };
    }
  }

  summarize(s: StackSignal): string {
    const parts = [s.version ?? s.stack];
    if (s.extras.cdnProvider) parts.push(`on ${s.extras.cdnProvider}`);
    if (s.extras.hasTailwind)  parts.push('Tailwind');
    if (s.extras.wpPlugins.length) parts.push(s.extras.wpPlugins.join(', '));
    return `${parts.join(' · ')} (${s.confidence}% confidence)`;
  }

  private normalize(url: string): string {
    try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
    catch { return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; }
  }
}
