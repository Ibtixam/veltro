-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'AGENCY');
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PRO', 'ENTERPRISE', 'LIFETIME');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'PAUSED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME');
CREATE TYPE "PaymentProvider" AS ENUM ('PAYBRIDGE_AFRICA', 'STRIPE', 'ORANGE_MONEY', 'MTN_MOMO', 'WAVE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CACHED');

-- CreateTable users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateTable subscriptions
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" "PaymentProvider" NOT NULL,
    "providerSubId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amountCents" INTEGER NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subscriptions_providerSubId_key" ON "subscriptions"("providerSubId");
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateTable payments
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "metadata" JSONB,
    "receiptUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");
CREATE INDEX "payments_userId_idx" ON "payments"("userId");
CREATE INDEX "payments_provider_status_idx" ON "payments"("provider", "status");

-- CreateTable audits
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "detectedLang" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "seoScore" INTEGER,
    "geoScore" INTEGER,
    "performanceScore" INTEGER,
    "conversionScore" INTEGER,
    "issues" JSONB,
    "keywords" JSONB,
    "schemaStatus" JSONB,
    "geoPages" JSONB,
    "rawData" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audits_userId_idx" ON "audits"("userId");
CREATE INDEX "audits_domain_idx" ON "audits"("domain");
CREATE INDEX "audits_createdAt_idx" ON "audits"("createdAt");

-- CreateTable weekly_reports
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "sessionsDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "organicSessions" INTEGER NOT NULL DEFAULT 0,
    "organicDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "leadsDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "revenueDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPages" JSONB,
    "topKeywords" JSONB,
    "criticalAlerts" JSONB,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "weekly_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "weekly_reports_userId_weekStart_key" ON "weekly_reports"("userId", "weekStart");
CREATE INDEX "weekly_reports_userId_idx" ON "weekly_reports"("userId");
CREATE INDEX "weekly_reports_weekStart_idx" ON "weekly_reports"("weekStart");

-- CreateTable domains
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "domains_url_key" ON "domains"("url");

-- CreateTable webhook_events
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_eventId_key" ON "webhook_events"("eventId");
CREATE INDEX "webhook_events_provider_processed_idx" ON "webhook_events"("provider", "processed");

-- CMS pages (added in rebuild)
DO $$ BEGIN
  CREATE TYPE "CmsStatus" AS ENUM ('DRAFT','PUBLISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "cms_pages" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_pages_owner_slug_locale_key" UNIQUE ("ownerId","slug","locale")
);
CREATE INDEX IF NOT EXISTS "cms_pages_owner_status_locale_idx" ON "cms_pages" ("ownerId","status","locale");

-- ── CRM + FAQ + Testimonials (rebuild v6.1) ─────────────────────────────
DO $$ BEGIN CREATE TYPE "LeadStatus" AS ENUM ('NEW','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DealStage" AS ENUM ('LEAD','DISCOVERY','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ActivityType" AS ENUM ('NOTE','CALL','EMAIL','MEETING','TASK'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "email" TEXT, "phone" TEXT, "company" TEXT, "country" TEXT, "source" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW', "tags" TEXT[] NOT NULL DEFAULT '{}',
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "crm_contacts_owner_status_idx" ON "crm_contacts" ("ownerId","status");
CREATE INDEX IF NOT EXISTS "crm_contacts_owner_email_idx" ON "crm_contacts" ("ownerId","email");

CREATE TABLE IF NOT EXISTS "crm_deals" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "contactId" TEXT NOT NULL REFERENCES "crm_contacts"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'EUR',
  "stage" "DealStage" NOT NULL DEFAULT 'LEAD', "probability" INTEGER NOT NULL DEFAULT 10,
  "expectedClose" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "crm_deals_owner_stage_idx" ON "crm_deals" ("ownerId","stage");

CREATE TABLE IF NOT EXISTS "crm_activities" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "contactId" TEXT NOT NULL REFERENCES "crm_contacts"("id") ON DELETE CASCADE,
  "type" "ActivityType" NOT NULL DEFAULT 'NOTE', "subject" TEXT NOT NULL, "body" TEXT,
  "dueAt" TIMESTAMP(3), "done" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "crm_activities_owner_contact_idx" ON "crm_activities" ("ownerId","contactId");

CREATE TABLE IF NOT EXISTS "faq_items" (
  "id" TEXT PRIMARY KEY, "locale" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'general',
  "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "faq_locale_pub_order_idx" ON "faq_items" ("locale","published","order");

CREATE TABLE IF NOT EXISTS "testimonials" (
  "id" TEXT PRIMARY KEY, "locale" TEXT NOT NULL DEFAULT 'en', "name" TEXT NOT NULL,
  "role" TEXT, "company" TEXT, "country" TEXT, "avatarUrl" TEXT, "quote" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 5, "featured" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT true, "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "testimonials_locale_pub_feat_idx" ON "testimonials" ("locale","published","featured");

-- ── HuntConfig + WeeklyReport (validation fixes v6.2) ───────────────────
CREATE TABLE IF NOT EXISTS "hunt_configs" (
  "id" TEXT PRIMARY KEY, "subscriptionId" TEXT NOT NULL UNIQUE, "domain" TEXT NOT NULL,
  "seedKeywords" TEXT[] NOT NULL DEFAULT '{}', "lang" TEXT NOT NULL DEFAULT 'en',
  "country" TEXT NOT NULL DEFAULT 'us', "competitors" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );

CREATE TABLE IF NOT EXISTS "weekly_reports" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "weekStart" TIMESTAMP(3) NOT NULL,
  "weekEnd" TIMESTAMP(3) NOT NULL, "domain" TEXT NOT NULL,
  "sessions" INTEGER NOT NULL DEFAULT 0, "sessionsDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "organicSessions" INTEGER NOT NULL DEFAULT 0, "organicDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newUsers" INTEGER NOT NULL DEFAULT 0, "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "conversionDelta" DOUBLE PRECISION NOT NULL DEFAULT 0, "leads" INTEGER NOT NULL DEFAULT 0,
  "leadsDelta" DOUBLE PRECISION NOT NULL DEFAULT 0, "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "revenueDelta" DOUBLE PRECISION NOT NULL DEFAULT 0, "avgPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0, "impressions" INTEGER NOT NULL DEFAULT 0, "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "topPages" JSONB, "topKeywords" JSONB, "criticalAlerts" JSONB, "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_reports_user_week_key" UNIQUE ("userId","weekStart") );
CREATE INDEX IF NOT EXISTS "weekly_reports_user_idx" ON "weekly_reports" ("userId");

-- ── ACQUISITION + ADMIN AUDIT (Ray Platform Components Standard) ────────
DO $$ BEGIN CREATE TYPE "ProspectStatus" AS ENUM ('NEW','DISCOVERED','SCORED','CONTACTED','QUALIFIED','CONVERTED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CohortStatus" AS ENUM ('OPEN','RUNNING','PAUSED','CAPPED','COMPLETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "acq_ideal_target_profiles" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "label" TEXT NOT NULL,
  "industries" TEXT[] NOT NULL DEFAULT '{}', "countries" TEXT[] NOT NULL DEFAULT '{}',
  "minRevenue" DOUBLE PRECISION, "maxRevenue" DOUBLE PRECISION,
  "keywords" TEXT[] NOT NULL DEFAULT '{}', "exclusions" TEXT[] NOT NULL DEFAULT '{}',
  "signalWeights" JSONB, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "acq_icp_owner_active_idx" ON "acq_ideal_target_profiles" ("ownerId","active");

CREATE TABLE IF NOT EXISTS "acq_cohorts" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL REFERENCES "acq_ideal_target_profiles"("id") ON DELETE CASCADE,
  "status" "CohortStatus" NOT NULL DEFAULT 'OPEN',
  "tokenCapCents" INTEGER NOT NULL DEFAULT 500, "tokensSpent" INTEGER NOT NULL DEFAULT 0,
  "targetCount" INTEGER NOT NULL DEFAULT 10, "discovered" INTEGER NOT NULL DEFAULT 0,
  "engineRef" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "acq_cohorts_owner_status_idx" ON "acq_cohorts" ("ownerId","status");

CREATE TABLE IF NOT EXISTS "acq_prospects" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL REFERENCES "acq_cohorts"("id") ON DELETE CASCADE,
  "company" TEXT NOT NULL, "domain" TEXT, "contactName" TEXT, "contactEmail" TEXT, "country" TEXT,
  "score" INTEGER, "scoreBand" TEXT, "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
  "engineData" JSONB, "contactedAt" TIMESTAMP(3), "convertedContactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "acq_prospects_owner_status_idx" ON "acq_prospects" ("ownerId","status");
CREATE INDEX IF NOT EXISTS "acq_prospects_cohort_score_idx" ON "acq_prospects" ("cohortId","score");

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" TEXT PRIMARY KEY, "adminId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "target" TEXT, "meta" JSONB, "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS "admin_audit_admin_created_idx" ON "admin_audit_logs" ("adminId","createdAt");

-- ── Free/trial cost counters ────────────────────────────────────────────
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trialAiCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trialVideosMade" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trialHuntsRun" INTEGER NOT NULL DEFAULT 0;
