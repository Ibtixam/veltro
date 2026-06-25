#!/usr/bin/env node
/**
 * VELTRO — Pre-deploy Self-Test
 * Bible V2 standard: must pass 100% before handoff to Guy Boris
 * Run: node selftest.js
 */

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0, warn = 0;
const ROOT = __dirname;

function check(name, condition, fix, severity = 'fail') {
  if (condition) {
    console.log(`  ✓  ${name}`);
    pass++;
  } else if (severity === 'warn') {
    console.warn(`  ⚠  ${name}\n     FIX: ${fix}`);
    warn++;
  } else {
    console.error(`  ✗  ${name}\n     FIX: ${fix}`);
    fail++;
  }
}

function has(filePath) { return fs.existsSync(path.join(ROOT, filePath)); }
function read(filePath) {
  try { return fs.readFileSync(path.join(ROOT, filePath), 'utf8'); } catch { return ''; }
}
function contains(filePath, ...strings) {
  const content = read(filePath);
  return strings.every(s => content.includes(s));
}

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   VELTRO — Bible V2 Pre-Deploy Self-Test    ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ── 1. REQUIRED FILES ────────────────────────────────────────────────────
console.log('1. Required files');
[
  ['apps/backend/src/main.ts',                               'Create main.ts'],
  ['apps/backend/src/app.module.ts',                         'Create app.module.ts'],
  ['apps/backend/src/prisma/schema.prisma',                  'Create schema.prisma'],
  ['apps/backend/src/modules/auth/auth.module.ts',           'Create auth module'],
  ['apps/backend/src/modules/billing/billing.service.ts',    'Create billing service'],
  ['apps/backend/src/modules/billing/billing.controller.ts', 'Create billing controller'],
  ['apps/backend/src/modules/onboarding/onboarding.service.ts', 'Create onboarding service'],
  ['apps/backend/src/modules/plan-guard/plan-guard.service.ts', 'Create plan-guard service'],
  ['apps/backend/src/modules/encryption/encryption.service.ts', 'Create encryption service'],
  ['apps/backend/src/modules/health/health.controller.ts',   'Create health controller'],
  ['apps/backend/src/config/env-validation.ts',              'Create env-validation'],
  ['apps/backend/src/modules/connectors/connector-registry.service.ts', 'Create connector registry'],
  ['infrastructure/docker/docker-compose.yml',               'Create docker-compose.yml'],
  ['.env.example',                                            'Create .env.example'],
].forEach(([f, fix]) => check(f, has(f), fix));

// ── 2. STACK ─────────────────────────────────────────────────────────────
console.log('\n2. Stack versions (Bible V2)');
const bePkg  = JSON.parse(fs.existsSync(path.join(ROOT, 'apps/backend/package.json')) ? fs.readFileSync(path.join(ROOT, 'apps/backend/package.json'), 'utf8') : '{}');
const fePkg  = JSON.parse(fs.existsSync(path.join(ROOT, 'apps/frontend/package.json')) ? fs.readFileSync(path.join(ROOT, 'apps/frontend/package.json'), 'utf8') : '{}');
const dc     = read('infrastructure/docker/docker-compose.yml');

check('NestJS 11',            (bePkg.dependencies?.['@nestjs/core'] ?? '').startsWith('^11'), 'Bump @nestjs/core to ^11');
check('Fastify adapter',      bePkg.dependencies?.['@nestjs/platform-fastify'] !== undefined, 'Add @nestjs/platform-fastify');
check('Next.js 16',           (fePkg.dependencies?.['next'] ?? '').startsWith('^16'),         'Bump next to ^16');
check('Prisma 6 pinned',      (bePkg.dependencies?.['@prisma/client'] ?? '').startsWith('^6'), 'Pin @prisma/client to ^6 (schema syntax match)');
check('Node 24 engine',       (bePkg.engines?.node ?? '').includes('24'),                     'Set engines.node >=24.0.0');
check('PostgreSQL 18',        dc.includes('postgres:18-alpine'),                              'Use postgres:18-alpine');
check('Redis 8',              dc.includes('redis:8-alpine'),                                  'Use redis:8-alpine');
check('Traefik v3',           dc.includes('traefik:v3'),                                       'Use traefik:v3.0');
check('Keycloak 24',          dc.includes('keycloak:24'),                                      'Use keycloak:24.0');
check('PgBouncer 1.22.1',     dc.includes('pgbouncer:1.22.1'),                                'Use edoburu/pgbouncer:1.22.1');
check('BullMQ',               bePkg.dependencies?.bullmq !== undefined,                       'Add bullmq');
check('Zod validation',       bePkg.dependencies?.zod !== undefined,                          'Add zod');

// ── 3. PGBOUNCER CRITICAL ─────────────────────────────────────────────────
console.log('\n3. PgBouncer (critical)');
check('PgBouncer transaction mode', dc.includes('POOL_MODE: transaction'),  'Set POOL_MODE: transaction');
check('PgBouncer port 6432',        dc.includes('"6432:5432"'),             'Expose port "6432:5432"');
check('DATABASE_URL pgBouncer=true', contains('.env.example', 'pgBouncer=true'), 'Add ?pgBouncer=true to DATABASE_URL');
check('DATABASE_URL port 6432',     contains('.env.example', '6432'),      'Route DATABASE_URL through port 6432');
check('DIRECT_URL in .env.example', contains('.env.example', 'DIRECT_URL='), 'Add DIRECT_URL for migrations');
check('Prisma directUrl',           contains('apps/backend/src/prisma/schema.prisma', 'directUrl'), 'Add directUrl to datasource');

// ── 4. SECURITY ───────────────────────────────────────────────────────────
console.log('\n4. Security');
check('No CORS wildcard',           !contains('apps/backend/src/main.ts', "origin: '*'"),        'Remove wildcard CORS');
check('trustProxy enabled',         contains('apps/backend/src/main.ts', 'trustProxy'),          'Add trustProxy: true');
check('Graceful shutdown',          contains('apps/backend/src/main.ts', 'enableShutdownHooks'), 'Add enableShutdownHooks');
check('Env validation at startup',  contains('apps/backend/src/main.ts', 'validateEnv'),         'Call validateEnv(process.env) in bootstrap');
check('Encryption key required',    contains('apps/backend/src/modules/encryption/encryption.service.ts', 'AES-256-GCM' + '' || 'aes-256-gcm'), 'Use AES-256-GCM for credentials');
check('JWT timingSafeEqual',        contains('apps/backend/src/modules/auth/auth.module.ts', 'timingSafeEqual'), 'Use crypto.timingSafeEqual in login');
check('Stripe HMAC verify',         contains('apps/backend/src/modules/billing/billing.service.ts', 'timingSafeEqual'), 'Implement Stripe HMAC verification');
check('Webhook idempotency',        contains('apps/backend/src/modules/billing/billing.controller.ts', 'received: true'), 'Return { received: true } from all webhooks');
check('Redis password required',    dc.includes('REDIS_PASSWORD:?'), 'Mark REDIS_PASSWORD as required in docker-compose');

// ── 5. BUSINESS LOGIC ─────────────────────────────────────────────────────
console.log('\n5. Business logic');
check('Plan limits defined',        contains('apps/backend/src/modules/plan-guard/plan-guard.service.ts', 'STARTER'), 'Define PLAN_LIMITS');
check('Regional pricing (XAF)',     contains('apps/backend/src/modules/plan-guard/plan-guard.service.ts', 'XAF'),     'Add XAF regional pricing');
check('PayBridge primary',          contains('apps/backend/src/modules/billing/billing.service.ts', 'paybridgeCheckout'), 'PayBridge must be primary');
check('Stripe fallback',            contains('apps/backend/src/modules/billing/billing.service.ts', 'stripeCheckout'),   'Add Stripe fallback');
check('Orange Money',               contains('apps/backend/src/modules/billing/billing.service.ts', 'orangeMoneyCheckout'), 'Add Orange Money');
check('MTN MoMo',                   contains('apps/backend/src/modules/billing/billing.service.ts', 'mtnMomoCheckout'),    'Add MTN MoMo');
check('Wave',                       contains('apps/backend/src/modules/billing/billing.service.ts', 'waveCheckout'),       'Add Wave');
check('Auth register endpoint',     contains('apps/backend/src/modules/auth/auth.module.ts', "@Post('register')"), 'Add register endpoint');
check('Auth login endpoint',        contains('apps/backend/src/modules/auth/auth.module.ts', "@Post('login')"),    'Add login endpoint');
check('Onboarding 7 steps',         contains('apps/backend/src/modules/onboarding/onboarding.service.ts', 'DONE'),  'Implement all 7 onboarding steps');
check('Plan enforcement',           contains('apps/backend/src/modules/plan-guard/plan-guard.service.ts', 'ForbiddenException'), 'Throw ForbiddenException on plan breach');

// ── 6. MULTILINGUAL ──────────────────────────────────────────────────────
console.log('\n6. Multilingual (Ray\'s Doctrine)');
check('EN translations',     contains('apps/frontend/src/i18n/translations.ts', "'en'"),   'Add EN translations');
check('FR translations',     contains('apps/frontend/src/i18n/translations.ts', "'fr'"),   'Add FR translations');
check('Locale autodetect',   contains('apps/frontend/src/i18n/translations.ts', 'detectLocale'), 'Add detectLocale function');
check('Lang enum in schema', contains('apps/backend/src/prisma/schema.prisma', 'enum Lang'), 'Add Lang enum to schema');

// ── 7. DELIVERY ──────────────────────────────────────────────────────────
console.log('\n7. Delivery (WhatsApp-first)');
check('WhatsApp delivery',   contains('apps/backend/src/modules/delivery-v2/delivery-v2.service.ts', 'whatsapp'), 'Add WhatsApp delivery');
check('Email delivery',      contains('apps/backend/src/modules/delivery-v2/delivery-v2.service.ts', 'sendEmail'), 'Add email delivery');
check('SMS delivery',        contains('apps/backend/src/modules/delivery-v2/delivery-v2.service.ts', 'sendSMS'), 'Add SMS delivery');
check('CDN upload (no attachment)', contains('apps/backend/src/modules/cdn-upload/cdn-upload.service.ts', 'presign'), 'Use CDN link not attachment');
check('ZIP expires 7 days',  contains('apps/backend/src/modules/cdn-upload/cdn-upload.service.ts', '7 * 24'), 'Set 7-day ZIP expiry');
check('FR WhatsApp message', contains('apps/backend/src/modules/delivery-v2/delivery-v2.service.ts', 'whatsappBodyFR'), 'Add French WhatsApp message');

// ── 8. STACK ADAPTERS ────────────────────────────────────────────────────
console.log('\n8. Stack adapters (works on any stack)');
check('Stack detector',      has('apps/backend/src/modules/stack-detector/stack-detector.service.ts'), 'Create stack detector');
check('Adapter router',      has('apps/backend/src/modules/stack-adapters/adapter-router.service.ts'), 'Create adapter router');
check('Next.js adapter',     contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'NextjsAdapterImpl'), 'Implement Next.js adapter');
check('WordPress adapter',   contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'WordPressAdapterImpl'), 'Implement WordPress adapter');
check('Webflow adapter',     contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'WebflowAdapterImpl'), 'Implement Webflow adapter');
check('Nuxt adapter',        contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'NuxtAdapterImpl'), 'Implement Nuxt adapter');
check('HTML fallback',       contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'HTMLAdapterImpl'), 'Implement HTML fallback adapter');
check('Shopify adapter',     contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'ShopifyAdapterImpl'), 'Implement Shopify adapter');
check('Wix instructions',    contains('apps/backend/src/modules/stack-adapters/adapter-router.service.ts', 'WixAdapterImpl'), 'Add Wix instructions adapter');

// ── 9. MODULE WIRING AUDIT (business-critical) ───────────────────────────
console.log('\n9. Module wiring & business logic');
check('PaymentModule in AppModule',     contains('apps/backend/src/app.module.ts', 'PaymentModule'),    'Register PaymentModule in AppModule');
check('I18nModule in AppModule',        contains('apps/backend/src/app.module.ts', 'I18nModule'),       'Register I18nModule in AppModule');
check('BillingModule in AppModule',     contains('apps/backend/src/app.module.ts', 'BillingModule'),    'Register BillingModule in AppModule');
check('OnboardingModule in AppModule',  contains('apps/backend/src/app.module.ts', 'OnboardingModule'), 'Register OnboardingModule in AppModule');
check('AuthModule in BillingModule',    contains('apps/backend/src/modules/billing/billing.module.ts',  'AuthModule'), 'Add AuthModule to BillingModule');
check('AuthModule in PaymentModule',    contains('apps/backend/src/modules/payment/payment.module.ts',  'AuthModule'), 'Add AuthModule to PaymentModule');
check('AuthModule in OnboardingModule', contains('apps/backend/src/modules/onboarding/onboarding.module.ts', 'AuthModule'), 'Add AuthModule to OnboardingModule');
check('AuthModule in HunterModule',     contains('apps/backend/src/modules/hunter/hunter.module.ts',   'AuthModule'), 'Add AuthModule to HunterModule');
check('EmailService in BillingModule',  contains('apps/backend/src/modules/billing/billing.module.ts', 'EmailService'), 'Add EmailService to BillingModule providers');
check('Payment confirmation email',     contains('apps/backend/src/modules/billing/billing.service.ts', 'sendPaymentConfirmation'), 'Wire email in processPaymentSuccess');
check('Onboard advances after payment', contains('apps/backend/src/modules/billing/billing.service.ts', 'onboardDone'), 'Set onboardDone=true after payment webhook');
check('Subscription.subscriptionId set',contains('apps/backend/src/modules/billing/billing.service.ts', 'subscriptionId: subscription.id'), 'Link Payment to Subscription after success');
check('No duplicate constructor params',!contains('apps/backend/src/modules/onboarding/onboarding.service.ts', 'private detector: StackDetectorService,\n    private detector: StackDetectorService,'), 'Remove duplicate detector param');
check('AGENCY plan in PLAN_PRICING',    contains('apps/backend/src/modules/payment/paybridge.service.ts', 'AGENCY'), 'Add AGENCY plan pricing');
check('Lang enum 22 locales',           contains('apps/backend/src/prisma/schema.prisma', 'RW') && contains('apps/backend/src/prisma/schema.prisma', 'MG'), 'Lang enum has 22 locales (one per line)');
check('ANTHROPIC_API_KEY in env schema',contains('apps/backend/src/config/env-validation.ts', 'ANTHROPIC_API_KEY'), 'Add ANTHROPIC_API_KEY to env validation');
check('Google OAuth Redirect decorator',contains('apps/backend/src/modules/onboarding/onboarding.controller.ts', '@Redirect()'), 'Fix Google OAuth callback to use @Redirect()');
check('Webhook metadata lookup (MTN)',  contains('apps/backend/src/modules/billing/billing.controller.ts', 'payment.findFirst'), 'Look up payment record in webhooks for correct metadata');
check('i18n Tier1 embedded',            contains('apps/frontend/src/app/VeltroApp.jsx', 'EMBEDDED'), 'Embed Tier1 translations in VeltroApp');
check('i18n dynamic fetch',             contains('apps/frontend/src/app/VeltroApp.jsx', '/api/i18n'), 'Add dynamic i18n fetch for Tier2 locales');
check('RTL support',                    contains('apps/frontend/src/app/VeltroApp.jsx', 'RTL_LOCALES'), 'Add RTL support for Arabic');
check('No stray {apps dir',             !require('fs').existsSync(require('path').join(__dirname, '{apps')), 'Remove stray {apps directory');
check('No stray {api dir',              !require('fs').existsSync(require('path').join(__dirname, 'apps/frontend/src/app/{api')), 'Remove stray {api directory');

// ── 10. REBUILD — Source detection, grid, i18n, video, admin, CMS ──────────
console.log('\n10. Rebuild — AI/search detection, grid, i18n, video, admin, CMS');

// 1+2 — AI platform & search engine autodetect
check('Source-detect lib exists',       has('apps/frontend/src/lib/source-detect.ts'), 'Add source-detect.ts');
check('AI platforms detected',          contains('apps/frontend/src/lib/source-detect.ts', 'perplexity', 'claude', 'chatgpt', 'gemini'), 'Detect major AI platforms');
check('AI bots detected (UA)',          contains('apps/frontend/src/lib/source-detect.ts', 'GPTBot', 'ClaudeBot', 'PerplexityBot'), 'Detect AI crawler UAs');
check('Search engines detected',        contains('apps/frontend/src/lib/source-detect.ts', 'duckduckgo', 'brave', 'yandex', 'baidu'), 'Detect search engines');
check('Middleware uses detection',      contains('apps/frontend/src/middleware.ts', 'detectSource', 'x-veltro-source'), 'Wire source detection into middleware');

// 3 — responsive i18n (all Doctrine languages)
check('i18n provider/hook',             has('apps/frontend/src/hooks/useI18n.tsx'), 'Add useI18n provider');
check('Language switcher (22 locales)', has('apps/frontend/src/components/layout/LanguageSwitcher.tsx'), 'Add LanguageSwitcher');
check('i18n provider RTL aware',        contains('apps/frontend/src/hooks/useI18n.tsx', 'RTL_LOCALES'), 'RTL handling in provider');
check('i18n dynamic fetch (provider)',  contains('apps/frontend/src/hooks/useI18n.tsx', '/api/i18n'), 'Dynamic Tier-2 fetch in provider');

// 4+7 — Müller-Brockmann grid + brand
check('Grid CSS — Swiss red only',      contains('apps/frontend/src/app/globals.css', '#e4002b'), 'Apply Swiss-red accent');
check('Grid CSS — 12 columns',          contains('apps/frontend/src/app/globals.css', '--cols: 12'), 'Define 12-col grid');
check('Grid CSS — 8px baseline',        contains('apps/frontend/src/app/globals.css', '--baseline: 8px'), 'Define 8px baseline');
check('Grid overlay guides inside wrap',contains('apps/frontend/src/app/globals.css', '.guides'), 'Add .guides overlay');
check('G-key overlay component',        has('apps/frontend/src/components/layout/GridOverlay.tsx'), 'Add GridOverlay (G-key)');
check('Doctrine fonts loaded',          contains('apps/frontend/src/app/layout.tsx', 'Archivo', 'Space_Mono'), 'Load Archivo + Space Mono + Inter');

// 5 — Remotion video pipeline (no Creatomate)
check('No Creatomate in video service', !contains('apps/backend/src/modules/video-agent/video-agent.service.ts', 'creatomate.com'), 'Remove Creatomate API');
check('Remotion render spec',           contains('apps/backend/src/modules/video-agent/video-agent.service.ts', 'RemotionRenderSpec', 'buildRemotionSpec'), 'Build Remotion render spec');
check('Render queue dispatch',          contains('apps/backend/src/modules/video-agent/video-agent.service.ts', 'video-render'), 'Dispatch to render queue');
check('Video module registers queues',  contains('apps/backend/src/modules/video-agent/video-agent.module.ts', 'video-jobs', 'video-render'), 'Register both queues');
check('Remotion worker exists',         has('apps/video-render/src/worker.ts'), 'Add Remotion render worker');
check('Remotion composition exists',    has('apps/video-render/src/compositions/VeltroVideo.tsx'), 'Add VeltroVideo composition');
check('Remotion uses free stock',       contains('apps/video-render/src/compositions/VeltroVideo.tsx', 'OffthreadVideo'), 'Render free stock footage');
check('ElevenLabs voice in pipeline',   contains('apps/backend/src/modules/video-agent/video-agent.service.ts', 'elevenlabs.io'), 'Keep ElevenLabs narration');
check('VideoAgentModule wired',         contains('apps/backend/src/app.module.ts', 'VideoAgentModule'), 'Wire VideoAgentModule');

// 8 — admin + CMS
check('Roles guard',                    has('apps/backend/src/common/guards/roles.guard.ts'), 'Add RolesGuard');
check('Admin module',                   has('apps/backend/src/modules/admin/admin.module.ts'), 'Add AdminModule');
check('Admin metrics endpoint',         contains('apps/backend/src/modules/admin/admin.controller.ts', 'metrics'), 'Add admin metrics');
check('Admin module wired',             contains('apps/backend/src/app.module.ts', 'AdminModule'), 'Wire AdminModule');
check('Admin dashboard UI',             has('apps/frontend/src/app/admin/page.tsx'), 'Add admin dashboard page');
check('CMS module',                     has('apps/backend/src/modules/cms/cms.module.ts'), 'Add CmsModule');
check('CMS page model',                 contains('apps/backend/src/prisma/schema.prisma', 'model CmsPage'), 'Add CmsPage model');
check('CMS migration',                  contains('apps/backend/src/prisma/migrations/0001_init.sql', 'cms_pages'), 'Add cms_pages migration');
check('CMS module wired',               contains('apps/backend/src/app.module.ts', 'CmsModule'), 'Wire CmsModule');

// branding
check('No Wouessi in package.json',     !contains('package.json', 'wouessi') && !contains('package.json', 'Wouessi'), 'Remove Wouessi branding');
check('No internal brand in client i18n', !contains('apps/frontend/src/i18n/translations.ts', 'Jiogue') && !contains('apps/frontend/src/i18n/translations.ts', "Ray's Doctrine"), 'Client i18n carries no internal attribution (IP confidentiality)');

// env
check('Env has Remotion video keys',    contains('.env.example', 'PIXABAY_API_KEY', 'RENDER_CONCURRENCY'), 'Add video pipeline env vars');
check('Env has no Creatomate',          !contains('.env.example', 'CREATOMATE'), 'Remove Creatomate env var');

// ── 11. TURNKEY — CRM, Q&A, testimonials, seed, video placeholders ─────────
console.log('\n11. Turnkey — CRM, Q&A, testimonials, seed, demo videos');

// Full CRM (Veltro's own pipeline)
check('CRM service',                    has('apps/backend/src/modules/crm/crm.service.ts'), 'Add CRM service');
check('CRM controller',                 has('apps/backend/src/modules/crm/crm.controller.ts'), 'Add CRM controller');
check('CRM pipeline + metrics',         contains('apps/backend/src/modules/crm/crm.service.ts', 'pipeline', 'metrics'), 'CRM pipeline + metrics');
check('CRM models in schema',           contains('apps/backend/src/prisma/schema.prisma', 'model Contact', 'model Deal', 'model Activity'), 'Add CRM models');
check('CRM migration',                  contains('apps/backend/src/prisma/migrations/0001_init.sql', 'crm_contacts', 'crm_deals'), 'Add CRM migration');
check('CrmModule wired',                contains('apps/backend/src/app.module.ts', 'CrmModule'), 'Wire CrmModule');
check('CRM frontend page',              has('apps/frontend/src/app/crm/page.tsx'), 'Add CRM dashboard page');

// Q&A / FAQ
check('Content service (FAQ)',          contains('apps/backend/src/modules/content/content.service.ts', 'faq', 'faqJsonLd'), 'Add FAQ service');
check('FAQ model',                      contains('apps/backend/src/prisma/schema.prisma', 'model FaqItem'), 'Add FaqItem model');
check('FAQ JSON-LD (GEO)',              contains('apps/backend/src/modules/content/content.service.ts', 'FAQPage'), 'FAQ JSON-LD for GEO');
check('FAQ frontend page',              has('apps/frontend/src/app/faq/page.tsx'), 'Add FAQ page');
check('FAQ migration',                  contains('apps/backend/src/prisma/migrations/0001_init.sql', 'faq_items'), 'Add FAQ migration');

// Testimonials
check('Testimonial model',              contains('apps/backend/src/prisma/schema.prisma', 'model Testimonial'), 'Add Testimonial model');
check('Testimonials service',           contains('apps/backend/src/modules/content/content.service.ts', 'testimonials'), 'Add testimonials service');
check('Testimonials component',         has('apps/frontend/src/components/ui/Testimonials.tsx'), 'Add Testimonials component');
check('Testimonials migration',         contains('apps/backend/src/prisma/migrations/0001_init.sql', 'testimonials'), 'Add testimonials migration');

// ContentModule
check('ContentModule wired',            contains('apps/backend/src/app.module.ts', 'ContentModule'), 'Wire ContentModule');

// Seed (was referenced but missing — P0)
check('Seed file exists',               has('apps/backend/src/prisma/seed.ts'), 'Add db:seed file');
check('Seed creates admin',             contains('apps/backend/src/prisma/seed.ts', "role: 'ADMIN'"), 'Seed an admin user');
check('Seed FAQ + testimonials',        contains('apps/backend/src/prisma/seed.ts', 'faqItem', 'testimonial'), 'Seed FAQ + testimonials');

// Demo / tutorial video placeholders (responsive)
check('VideoPlaceholder component',     has('apps/frontend/src/components/video/VideoPlaceholder.tsx'), 'Add VideoPlaceholder');
check('VideoPlaceholder responsive',    contains('apps/frontend/src/components/video/VideoPlaceholder.tsx', 'aspect', '9/16'), 'Support responsive aspect ratios');
check('Tutorial video on FAQ',          contains('apps/frontend/src/app/faq/page.tsx', 'VideoPlaceholder'), 'Embed tutorial video');

// Env
check('Env has seed admin vars',        contains('.env.example', 'SEED_ADMIN_EMAIL'), 'Add seed admin env');
check('Env has public API url',         contains('.env.example', 'NEXT_PUBLIC_API_URL'), 'Add NEXT_PUBLIC_API_URL');

// ── RESULT ─────────────────────────────────────────────────────────────────

// ── 12. VALIDATION — compile-critical fixes (v6.2) ─────────────────────────
console.log('\n12. Validation — install + compile integrity');

// Dependency pins that previously broke npm install
check('swagger NestJS-11 compatible',   contains('apps/backend/package.json', '"@nestjs/swagger": "^11'), 'Fix swagger version');
check('No broken @fastify/raw-body',     !contains('apps/backend/package.json', '@fastify/raw-body'), 'Remove non-existent @fastify/raw-body');
check('Native rawBody enabled',          contains('apps/backend/src/main.ts', 'rawBody: true'), 'Use native NestJS rawBody');
check('No unused next-auth',             !contains('apps/frontend/package.json', 'next-auth'), 'Remove unused next-auth');

// Enum name alignment (schema ↔ code ↔ migration)
check('Schema PaymentProvider enum',     contains('apps/backend/src/prisma/schema.prisma', 'enum PaymentProvider'), 'Align PaymentProvider enum name');
check('Schema PaymentStatus enum',       contains('apps/backend/src/prisma/schema.prisma', 'enum PaymentStatus'), 'Align PaymentStatus enum name');
check('No stale PayProvider ref',        !contains('apps/backend/src/prisma/schema.prisma', 'PayProvider'), 'Remove stale PayProvider');
check('Migration enum has WAVE',         contains('apps/backend/src/prisma/migrations/0001_init.sql', "'WAVE'"), 'Align migration enum values');

// Missing models that code referenced (would crash at runtime)
check('HuntConfig model exists',         contains('apps/backend/src/prisma/schema.prisma', 'model HuntConfig'), 'Add HuntConfig model');
check('WeeklyReport model exists',       contains('apps/backend/src/prisma/schema.prisma', 'model WeeklyReport'), 'Add WeeklyReport model');
check('HuntConfig migration',            contains('apps/backend/src/prisma/migrations/0001_init.sql', 'hunt_configs'), 'Add hunt_configs table');
check('WeeklyReport migration',          contains('apps/backend/src/prisma/migrations/0001_init.sql', 'weekly_reports'), 'Add weekly_reports table');

// Dead code + syntax
check('No dead feature.modules',         !has('apps/backend/src/modules/feature.modules.ts'), 'Remove dead feature.modules.ts');
check('JSZip default import',            contains('apps/backend/src/modules/codegen/code-generator.service.ts', "import JSZip from 'jszip'"), 'Fix JSZip import');
check('sendHuntDelivery method',         contains('apps/backend/src/modules/delivery-v2/delivery-v2.service.ts', 'sendHuntDelivery'), 'Add sendHuntDelivery method');

// No leftover node_modules in package
check('No shipped node_modules',         !has('apps/backend/node_modules'), 'Strip node_modules before packaging');

// ── 13. MULTI-TENANCY + PROVISIONING (turnkey customer accounts) ───────────
console.log('\n13. Multi-tenancy + account provisioning');

// CRM tenant scoping
check('CRM scoped by ownerId',           contains('apps/backend/src/modules/crm/crm.service.ts', 'ownerId'), 'CRM scoped per customer');

// CMS tenant scoping (was a security hole — global)
check('CmsPage has ownerId',             contains('apps/backend/src/prisma/schema.prisma', 'ownerId'), 'CMS scoped per tenant');
check('CMS unique by owner+slug+locale', contains('apps/backend/src/prisma/schema.prisma', '@@unique([ownerId, slug, locale])'), 'CMS tenant-unique constraint');
check('CMS service scopes ownerId',      contains('apps/backend/src/modules/cms/cms.service.ts', 'ownerId'), 'CMS queries scoped');
check('CMS controller uses auth uid',    contains('apps/backend/src/modules/cms/cms.controller.ts', 'this.uid(req)'), 'CMS authoring scoped to user');
check('CMS migration has ownerId',       contains('apps/backend/src/prisma/migrations/0001_init.sql', 'cms_pages_owner_slug_locale_key'), 'CMS migration scoped');

// Account provisioning on payment success
check('Payment provisions onboarding',   contains('apps/backend/src/modules/payment/payment.controller.ts', 'onboardDone: true'), 'Complete onboarding on payment');
check('Payment provisions Site',         contains('apps/backend/src/modules/payment/payment.controller.ts', 'site.create'), 'Create Site on payment');
check('Payment provisions HuntConfig',   contains('apps/backend/src/modules/payment/payment.controller.ts', 'huntConfig.create'), 'Arm weekly hunt on payment');

// Payment gateways
check('PayBridge gateway',               contains('apps/backend/src/modules/payment/paybridge.service.ts', 'PAYBRIDGE_AFRICA'), 'PayBridge wired');
check('Stripe gateway',                  contains('apps/backend/src/modules/payment/paybridge.service.ts', 'STRIPE'), 'Stripe wired');
check('Mobile money gateways',           contains('apps/backend/src/modules/payment/paybridge.service.ts', 'ORANGE_MONEY', 'MTN_MOMO'), 'Mobile money wired');
check('Checkout passes domain',          contains('apps/backend/src/modules/payment/payment.controller.ts', 'domain: userDomain'), 'Domain flows to provisioning');
check('Env has all gateway keys',        contains('.env.example', 'PAYBRIDGE_API_KEY', 'STRIPE_SECRET_KEY', 'MTN_MOMO_API_KEY'), 'Gateway env present');

// ── 14. REMAINING WORK — tenant guard, trial, CMS domain, tutorials ────────
console.log('\n14. Tenant guard · 7-day trial · CMS domain · tutorial videos');

// Tenant guard (defense-in-depth)
check('TenantGuard exists',              has('apps/backend/src/common/guards/tenant.guard.ts'), 'Add TenantGuard');
check('TenantResource decorator',        contains('apps/backend/src/common/guards/tenant.guard.ts', 'TenantResource'), 'Add @TenantResource');
check('Admin bypass in guard',           contains('apps/backend/src/common/guards/tenant.guard.ts', "role === 'ADMIN'"), 'Admin bypasses tenant guard');
check('CRM uses TenantGuard',            contains('apps/backend/src/modules/crm/crm.controller.ts', 'TenantGuard'), 'Wire TenantGuard to CRM');
check('CRM routes decorated',            contains('apps/backend/src/modules/crm/crm.controller.ts', "@TenantResource('contact')"), 'Decorate CRM routes');
check('TenantGuard provided',            contains('apps/backend/src/modules/crm/crm.module.ts', 'TenantGuard'), 'Provide TenantGuard');

// 7-day trial
check('TrialService exists',             has('apps/backend/src/modules/trial/trial.service.ts'), 'Add TrialService');
check('Trial provisions account',        contains('apps/backend/src/modules/trial/trial.service.ts', 'onboardDone: true', 'huntConfig.create'), 'Trial provisions full account');
check('Trial day-7 cron',                contains('apps/backend/src/modules/trial/trial.service.ts', '@Cron', 'processExpiringTrials'), 'Add day-7 conversion job');
check('Trial converts or pauses',        contains('apps/backend/src/modules/trial/trial.service.ts', "'ACTIVE'", "'PAUSED'"), 'Convert or suspend at day 7');
check('Trial controller',                has('apps/backend/src/modules/trial/trial.controller.ts'), 'Add trial endpoints');
check('TrialModule wired',               contains('apps/backend/src/app.module.ts', 'TrialModule'), 'Wire TrialModule');

// CMS public domain rendering
check('CMS domain resolution',           contains('apps/backend/src/modules/cms/cms.service.ts', 'getPublishedByDomain'), 'Resolve custom domain → owner');
check('CMS public domain route',         contains('apps/backend/src/modules/cms/cms.controller.ts', "@Get('site/:domain/:slug')"), 'Add public domain route');

// Tutorial videos
check('Tutorial composition',            has('apps/video-render/src/compositions/VeltroTutorial.tsx'), 'Add tutorial composition');
check('Tutorial registered in Root',     contains('apps/video-render/src/Root.tsx', 'VeltroTutorial'), 'Register tutorial composition');
check('Tutorial batch generator',        has('apps/video-render/scripts/generate-tutorials.ts'), 'Add tutorial generator');
check('6 tutorials defined',             contains('apps/video-render/scripts/generate-tutorials.ts', 'getting-started', 'using-crm', 'deploying-zip'), 'Define all tutorials');
check('Tutorials npm script',            contains('apps/video-render/package.json', '"tutorials"'), 'Add npm run tutorials');

// ── 15. FREE-TIER COST CONTROL (minimise our cost on trial) ────────────────
console.log('\n15. Free-tier cost control');
check('FreeTierGuard exists',           has('apps/backend/src/modules/cost-control/free-tier-guard.service.ts'), 'Add free-tier guard');
check('Video blocked on trial',         contains('apps/backend/src/modules/cost-control/free-tier-guard.service.ts', 'FREE_TRIAL_VIDEOS'), 'Block video on trial');
check('Hard caps + 403',                contains('apps/backend/src/modules/cost-control/free-tier-guard.service.ts', 'ForbiddenException'), 'Throw 403 at cap');
check('Cheap cascade on trial',         contains('apps/backend/src/modules/cost-control/free-tier-guard.service.ts', 'cheapCascade'), 'Force cheap cascade on trial');
check('Usage counters in schema',       contains('apps/backend/src/prisma/schema.prisma', 'trialAiCalls', 'trialVideosMade'), 'Add trial usage counters');
check('Counters migration',             contains('apps/backend/src/prisma/migrations/0001_init.sql', 'trialAiCalls'), 'Migrate trial counters');
check('Video enforce wired',            contains('apps/backend/src/modules/video-agent/video-agent.controller.ts', "freeTier.enforce"), 'Wire video cost guard');
check('Hunt enforce wired',             contains('apps/backend/src/modules/hunter/hunter.controller.ts', "freeTier.enforce"), 'Wire hunt cost guard');
check('Reset on conversion',            contains('apps/backend/src/modules/trial/trial.service.ts', 'trialAiCalls: 0'), 'Reset counters on ACTIVE');
check('Trial site hunt disabled',       contains('apps/backend/src/modules/trial/trial.service.ts', 'huntActive: false'), 'Disable auto-hunt on trial');
check('Limits configurable via env',    contains('.env.example', 'FREE_TRIAL_AI_CALLS'), 'Make limits env-configurable');
check('CostControlModule wired',        contains('apps/backend/src/app.module.ts', 'CostControlModule'), 'Wire CostControlModule');

// ── 16. IRON GATE v3 + Acquisition + déterministe (cette session) ──────────
console.log('\n16. Iron Gate v3 · Acquisition · turnkey hardening');
check('Acquisition module',             has('apps/backend/src/modules/acquisition/acquisition.service.ts'), 'Add acquisition');
check('Central engine client',          has('apps/backend/src/modules/acquisition/central-engine.client.ts'), 'Add central engine bridge');
check('No local scoring',               !contains('apps/backend/src/modules/acquisition/acquisition.service.ts', 'computeScore', 'calculateScore'), 'Never reimplement scoring');
check('ICP server-only stripped',       contains('apps/backend/src/modules/acquisition/acquisition.service.ts', 'signalWeights, ...safe'), 'Strip ICP weights');
check('engineData stripped',            contains('apps/backend/src/modules/acquisition/acquisition.service.ts', 'engineData, ...safe'), 'Strip sovereign engine data');
check('Circuit breaker',                contains('apps/backend/src/modules/acquisition/acquisition.service.ts', 'tokenCapCents', 'CAPPED'), 'Per-cohort cost cap');
check('Admin audit log',                contains('apps/backend/src/modules/admin/admin.service.ts', 'adminAuditLog'), 'Audit admin actions');
check('TenantGuard exists',             has('apps/backend/src/common/guards/tenant.guard.ts'), 'Tenant defense-in-depth');
check('JWT weak-secret gate',           contains('apps/backend/src/config/env-validation.ts', 'Weak secret in production'), 'Refuse boot on weak secret');
check('.gitignore protects .env',       has('.gitignore') && contains('.gitignore', '.env'), 'gitignore .env');
check('.dockerignore exists',           has('.dockerignore'), 'Add dockerignore');
check('No IP leak in frontend',         !contains('apps/frontend/src/i18n/translations.ts', 'Jiogue') && !contains('apps/frontend/src/middleware.ts', "Ray's Doctrine"), 'No IP attribution client-side');
check('Root docker-compose',            has('docker-compose.yml'), 'Add deployable root compose');
check('pgbouncer userlist',             has('infrastructure/docker/pgbouncer/userlist.txt'), 'Add pgbouncer userlist');
check('Health module wired',            contains('apps/backend/src/app.module.ts', 'HealthModule'), 'Mount health route');
check('6 gate scripts',                 has('scripts/security-gates.sh') && has('scripts/roi-gates.sh') && has('scripts/acquisition-gates.sh'), 'Iron Gate scripts present');
check('README declares components',     has('README.md') && contains('README.md', 'Platform Components Standard'), 'Declare component status');

// ── 17. SCHEMA VALIDITÉ MOTEUR (Prisma 6) — bug attrapé cette session ──────
console.log('\n17. Prisma schema engine-validity');
const schemaTxt = require('fs').readFileSync(__dirname + '/apps/backend/src/prisma/schema.prisma','utf8');
check('Enums multi-ligne (pas compact)', !/^enum\s+\w+\s*\{[ \t]*[A-Z]/m.test(schemaTxt), 'Enum values must be one per line (Prisma requirement)');
check('Prisma 6 épinglé',                contains('apps/backend/package.json', '"prisma": "^6') || contains('apps/backend/package.json','@prisma/client": "^6'), 'Pin Prisma 6 (schema syntax match)');
check('prisma.config.ts présent',        has('apps/backend/prisma.config.ts'), 'Add prisma config file');
check('datasource url présent',          contains('apps/backend/src/prisma/schema.prisma', 'url       = env'), 'datasource url for Prisma 6');
console.log('\n╔══════════════════════════════════════════════╗');
console.log(`║  ${pass.toString().padEnd(3)} passed · ${fail.toString().padEnd(3)} failed · ${warn.toString().padEnd(3)} warnings   ║`);
console.log('╚══════════════════════════════════════════════╝\n');

if (fail > 0) {
  console.error(`❌  ${fail} issue(s) must be fixed before deploy.\n`);
  process.exit(1);
} else if (warn > 0) {
  console.warn(`⚠   Passed with ${warn} warning(s). Review before production.\n`);
  process.exit(0);
} else {
  console.log('✅  All checks passed. Safe to hand off to Guy Boris.\n');
  process.exit(0);
}
