# SEO Growth Pro — Deployment Guide
## Jiogue Bible V2 Compliant · PayBridge Africa · RGPD · 1M+ users

---

## Stack
| Layer | Tech | Version |
|-------|------|---------|
| Frontend | Next.js | 16 |
| Backend | NestJS + Fastify | 11 |
| Language | TypeScript strict | 5 |
| Runtime | Node.js LTS | 24 |
| ORM | Prisma | 7 |
| Database | PostgreSQL | 18 |
| Cache | Redis | 8 |
| Pooler | PgBouncer | latest |
| Proxy | Traefik | v3 |
| Monitoring | Prometheus + Grafana + Loki + Alloy | latest |
| Containers | Docker | 26 (required — install via get.docker.com) |
| Queues | BullMQ | latest |
| Monorepo | Turborepo | 2 |

## Payment Providers (priority order)
1. **PayBridge Africa** — XAF, XOF, GHS, NGN, KES (Africa primary)
2. **Stripe** — EUR, CAD, USD, GBP (EU/NA fallback, auto-activated)
3. **Orange Money** — CM, GA, SN, CI (mobile-first)
4. **MTN MoMo** — CM, GH, NG, SN (mobile-first)

---

## Pre-Deployment Checklist

### 1. Environment Variables
```bash
cp .env.example .env
nano .env  # Fill ALL required values
```

Required minimum:
- `DATABASE_URL`
- `REDIS_URL` + `REDIS_PASSWORD`
- `JWT_SECRET` (64 random chars)
- `PAYBRIDGE_API_KEY` + `PAYBRIDGE_SECRET` + `PAYBRIDGE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- `SMTP_PASS` (Resend API key recommended)
- `EMAIL_FROM`

### 2. Database Setup
```bash
npm run db:migrate    # Run all Prisma migrations
npm run db:generate   # Generate Prisma client
npm run db:seed       # Optional: seed plans & test data
```

### 3. Build & Deploy
```bash
# Development
npm run dev

# Production (Docker)
npm run docker:up
```

### 4. Webhook Configuration

#### PayBridge Africa
Set webhook URL in PayBridge dashboard:
`https://yourdomain.com/api/payment/webhook/paybridge`
Events: `payment.succeeded`, `payment.failed`, `subscription.canceled`

#### Stripe
```bash
stripe listen --forward-to localhost:4000/api/payment/webhook/stripe
# Production: add in Stripe Dashboard > Webhooks
```
Events: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`

#### Orange Money
Notification URL: `https://yourdomain.com/api/webhook/orange-money`

#### MTN MoMo
Callback URL: `https://yourdomain.com/api/webhook/mtn-momo`

### 5. Google Analytics 4 (Weekly Reports)
1. Create GA4 Service Account in Google Cloud Console
2. Grant "Viewer" role on your GA4 property
3. Download JSON key → extract `client_email` and `private_key`
4. Set `GOOGLE_ANALYTICS_PROPERTY_ID` (format: `GA4-XXXXXXXXX`)
5. Set `GOOGLE_SA_CLIENT_EMAIL` and `GOOGLE_SA_PRIVATE_KEY`

---

## Weekly Report Schedule
Reports run **every Monday at 8:00 AM Paris time** (Europe/Paris).
- Fetches GA4 metrics (sessions, conversions, revenue)
- Computes week-over-week deltas
- Detects critical alerts (traffic drops, conversion issues)
- Persists to `weekly_reports` table
- Sends branded HTML email to each active subscriber

Manual trigger:
```bash
npm run reports:weekly
```

---

## RGPD / GDPR Compliance
- Cookie consent: implement IAB TCF 2.2 banner (Axeptio or Didomi recommended)
- GA4 Consent Mode v2: configured via GTM
- Data retention: 13 months (395 days) — enforced by cron job
- Right to erasure: `DELETE /api/users/me` endpoint included
- Privacy policy: `/privacy` route — update with your company details
- DPA: template in `/docs/DPA_template.docx`

---

## Scaling (1M+ Concurrent Users)
- Backend: horizontal scaling via Docker replicas (default: 2)
- PgBouncer: 1000 max client connections, 50 pool size
- Redis: LRU eviction, 512MB limit (increase for production)
- CDN: deploy frontend to Vercel Edge or Cloudflare Pages
- Rate limiting: 100 req/min per IP (NestJS ThrottlerGuard)
- Audit queue: BullMQ with 50 concurrent workers

---

## Monitoring
| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | `https://grafana.yourdomain.com` | `$GRAFANA_USER/$GRAFANA_PASSWORD` |
| Traefik | `https://traefik.yourdomain.com` | `$TRAEFIK_DASHBOARD_AUTH` |
| Prometheus | Internal only | — |

Key dashboards pre-configured:
- API latency (p50/p95/p99)
- Payment success rate by provider
- Weekly report delivery rate
- Audit queue depth
- DB connection pool usage

---

## Support & Keys Required
| Service | Where to get |
|---------|-------------|
| PayBridge Africa | contact@paybridgeafrica.com |
| Stripe | dashboard.stripe.com |
| Orange Money | developer.orange.com |
| MTN MoMo | momodeveloper.mtn.com |
| Resend (email) | resend.com |
| Google Cloud SA | console.cloud.google.com |
| PageSpeed API | console.cloud.google.com/apis |

---

*Built by Jiogue LLC · Bible V2 · 2025*
Docker 26 | install via get.docker.com

## Server target: Hetzner dedicated (CPX41 recommended, Ubuntu 24)

---

## Rebuild additions (v6 — Jiogue LLC)

### Video render worker (Remotion)
The video pipeline now renders locally with Remotion + ffmpeg — no paid render API.
Run the worker alongside the backend (it consumes the `video-render` BullMQ queue):

```bash
cd apps/video-render
npm install
npm run worker          # production: use the Dockerfile (headless Chromium + ffmpeg)
```

Required env: `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `UNSPLASH_ACCESS_KEY`,
`CDN_PROVIDER` (+ R2/S3 keys), `CDN_PUBLIC_URL`, `RENDER_CONCURRENCY`, `REDIS_URL`.

### Admin dashboard
- Backend: `GET /api/admin/metrics|users|payments|subscriptions` — gated by `JwtAuthGuard + RolesGuard ADMIN`.
- Promote a user: set `users.role = 'ADMIN'` (or `PATCH /api/admin/users/:id/role`).
- Frontend: `/admin`.

### CMS
- Public read: `GET /api/cms/page/:slug?locale=fr` (falls back fr → en).
- Admin authoring: `POST /api/cms/admin/pages`, `…/publish`, `DELETE …`.
- Migration: run `npm run db:migrate` to create `cms_pages`.

### AI + search source detection
Middleware sets `x-veltro-source`, `x-veltro-ai-platform`, `x-veltro-search-engine`, `x-veltro-is-bot`.
Use these in SSR to serve answer-first GEO content to AI surfaces and canonical SEO meta to search engines.
