import { z } from 'zod';

// Validates all required environment variables at startup.
// Veltro refuses to start if any CRITICAL var is missing.
// Optional vars get defaults logged as warnings.

const envSchema = z.object({
  // App
  NODE_ENV:         z.enum(['development', 'production', 'test']).default('production'),
  APP_URL:          z.string().url(),
  API_PORT:         z.string().default('4000'),
  JWT_SECRET:       z.string().min(32),
  ENCRYPTION_KEY:   z.string().min(32),

  // Database
  DATABASE_URL:     z.string().startsWith('postgresql://'),
  DIRECT_URL:       z.string().startsWith('postgresql://'),

  // Redis
  REDIS_URL:        z.string().startsWith('redis://'),

  // Payments (at least one must be configured)
  PAYBRIDGE_API_KEY:    z.string().optional(),
  STRIPE_SECRET_KEY:    z.string().optional(),
  ORANGE_MONEY_MERCHANT_KEY: z.string().optional(),
  MTN_MOMO_API_KEY:     z.string().optional(),
  WAVE_API_KEY:         z.string().optional(),

  // Delivery (at least email must be configured)
  SMTP_PASS:        z.string().min(1),
  EMAIL_FROM:       z.string().email(),

  // WhatsApp (optional — falls back to email-only)
  WHATSAPP_TOKEN:   z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),

  // CDN (required for ZIP delivery)
  CDN_PROVIDER:     z.enum(['r2', 's3']).default('r2'),
  R2_ACCOUNT_ID:    z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  S3_BUCKET:        z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),

  // Google OAuth (optional — reduces $ accuracy without it)
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // AI (required for i18n dynamic translation)
  ANTHROPIC_API_KEY:    z.string().min(1),

  // Webhook secrets
  PAYBRIDGE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET:    z.string().optional(),
  I18N_INVALIDATE_SECRET:   z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const missing = result.error.issues.map(i => `  ✗ ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error('\n═══════════════════════════════════════════');
    console.error('  VELTRO STARTUP FAILED — Missing env vars:');
    console.error('═══════════════════════════════════════════');
    console.error(missing);
    console.error('\n  Copy .env.example → .env and fill all values.\n');
    process.exit(1);
  }

  // ── HARD GATE: refuse to boot in production with weak/placeholder secrets ──
  if (result.data.NODE_ENV === 'production') {
    const WEAK = /CHANGE_ME|change-me|placeholder|example|secret|test|0000|xxxx/i;
    const secretChecks: Array<[string, string]> = [
      ['JWT_SECRET', result.data.JWT_SECRET],
      ['ENCRYPTION_KEY', result.data.ENCRYPTION_KEY],
    ];
    const weakSecrets = secretChecks.filter(([, v]) => WEAK.test(v) || /(.)\1{7,}/.test(v));
    if (weakSecrets.length > 0) {
      console.error('\n═══════════════════════════════════════════');
      console.error('  VELTRO STARTUP FAILED — Weak secret in production:');
      console.error('═══════════════════════════════════════════');
      weakSecrets.forEach(([k]) => console.error(`  ✗ ${k} looks like a placeholder/weak value`));
      console.error('\n  Generate strong secrets: openssl rand -base64 48\n');
      process.exit(1);
    }
  }

  // Warn about optional but revenue-impacting vars
  const warnings: string[] = [];
  if (!result.data.PAYBRIDGE_API_KEY && !result.data.STRIPE_SECRET_KEY) {
    warnings.push('No payment provider configured — billing will fail');
  }
  if (!result.data.GOOGLE_CLIENT_ID) {
    warnings.push('GOOGLE_CLIENT_ID not set — GSC/GA4 connectors disabled, $ estimates will be heuristic');
  }
  if (!result.data.WHATSAPP_TOKEN) {
    warnings.push('WHATSAPP_TOKEN not set — delivery will be email-only');
  }
  if (!result.data.R2_ACCOUNT_ID && !result.data.S3_BUCKET) {
    warnings.push('No CDN configured — ZIP delivery will fail. Set R2_ACCOUNT_ID or S3_BUCKET.');
  }

  if (warnings.length > 0) {
    console.warn('\n⚠  Veltro warnings:');
    warnings.forEach(w => console.warn(`   — ${w}`));
    console.warn('');
  }

  return result.data;
}
