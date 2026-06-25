import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { detectSource } from './lib/source-detect';

// Supported locales (Veltro — 22 languages)
const SUPPORTED = ['en','fr','zh','ar','pt','es','sw','ha','yo','ig','am','rw','mg',
                   'de','nl','it','ru','hi','ja','ko','tr','vi'] as const;
type Locale = typeof SUPPORTED[number];

const RTL_LOCALES = new Set(['ar']);

const LANGUAGE_MAP: Record<string, Locale> = {
  'fr': 'fr', 'zh': 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
  'ar': 'ar', 'pt': 'pt', 'pt-br': 'pt',
  'es': 'es', 'sw': 'sw', 'ha': 'ha', 'yo': 'yo', 'ig': 'ig',
  'am': 'am', 'rw': 'rw', 'mg': 'mg',
  'de': 'de', 'nl': 'nl', 'it': 'it', 'ru': 'ru',
  'hi': 'hi', 'ja': 'ja', 'ko': 'ko', 'tr': 'tr', 'vi': 'vi',
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') ||
      pathname.includes('.') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // ── Locale detection (Accept-Language) ────────────────────────────────
  const acceptLang = req.headers.get('accept-language') ?? '';
  const detected = detectLocale(acceptLang);

  // ── Source detection (AI platform + search engine autodetect) ─────────
  const ua = req.headers.get('user-agent') ?? '';
  const referer = req.headers.get('referer') ?? '';
  const src = detectSource(ua, referer, req.url);

  const response = NextResponse.next();
  response.headers.set('x-veltro-locale', detected);
  response.headers.set('x-veltro-dir', RTL_LOCALES.has(detected) ? 'rtl' : 'ltr');

  // Source signals — consumed by layout/SSR to serve GEO answer-first content
  // to AI surfaces and canonical SEO meta to search engines.
  response.headers.set('x-veltro-source', src.kind);
  if (src.platform) response.headers.set('x-veltro-ai-platform', src.platform);
  if (src.engine)   response.headers.set('x-veltro-search-engine', src.engine);
  response.headers.set('x-veltro-is-bot', String(src.isBot));
  return response;
}

function detectLocale(acceptLang: string): Locale {
  const langs = acceptLang
    .split(',')
    .map(part => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().toLowerCase(), q: parseFloat(q ?? '1') };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of langs) {
    const mapped = LANGUAGE_MAP[lang] ?? LANGUAGE_MAP[lang.split('-')[0]];
    if (mapped) return mapped;
  }
  return 'en';
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
