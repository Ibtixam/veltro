# Veltro — Production Deploy Guide
## For Guy Boris (kouamojp)

**Estimated time: 45–60 minutes on a fresh Hetzner server**

---

## Prerequisites

- Hetzner VPS (recommended: CX41 — 8 vCPU, 16GB RAM, 160GB SSD)
- Docker Engine 26 + Docker Compose V2 installed
- Domain pointing to server IP (A record for `veltro.io` and `api.veltro.io`)
- Git access to the Veltro repo

---

## Step 1 — Clone and configure

```bash
git clone https://github.com/raykuate/veltro.git /opt/veltro
cd /opt/veltro

# Copy environment file
cp .env.example .env
nano .env   # Fill ALL values — see comments in file
```

**Required values you must fill before continuing:**
- `APP_URL` — your production URL
- `JWT_SECRET` — generate: `openssl rand -hex 64`
- `ENCRYPTION_KEY` — generate: `openssl rand -hex 32`
- `DB_PASSWORD` — strong random password
- `REDIS_PASSWORD` — strong random password
- `SMTP_PASS` — Resend API key from resend.com
- `EMAIL_FROM` — your sender email
- `PAYBRIDGE_API_KEY` — from PayBridge Africa dashboard
- `STRIPE_SECRET_KEY` — from Stripe dashboard (for EU/CA/US)
- `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` — Cloudflare R2

---

## Step 2 — Run self-test

```bash
node selftest.js
```

Must show `✅ All checks passed` before proceeding.

---

## Step 3 — Start infrastructure

```bash
cd infrastructure/docker
docker compose up -d postgres redis pgbouncer

# Wait for postgres to be healthy
docker compose ps
# All should show (healthy)
```

---

## Step 4 — Run database migrations

```bash
# Run from repo root (direct connection for migrations)
DATABASE_URL=$(grep DIRECT_URL .env | cut -d= -f2-) \
  docker run --rm --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  -v $(pwd)/apps/backend:/app \
  node:24-alpine sh -c "cd /app && npx prisma migrate deploy"
```

---

## Step 5 — Start all services

```bash
docker compose up -d
docker compose ps  # All services should be healthy within 2 minutes
```

---

## Step 6 — Verify deployment

```bash
# Health check
curl https://api.veltro.io/api/health
# Expected: {"status":"ok","checks":{"database":"ok","redis":"ok"}}

# Pricing endpoint (public)
curl https://api.veltro.io/api/billing/pricing/CM
# Expected: JSON with XAF pricing for Cameroon
```

---

## Step 7 — Configure Google OAuth (for GSC + GA4)

1. Go to console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
3. Add authorized redirect URI: `https://api.veltro.io/api/onboarding/connect/google/callback`
4. Copy Client ID + Secret → update `.env` → restart backend:

```bash
docker compose restart backend
```

---

## Step 8 — Configure WhatsApp (Meta Business API)

1. Go to developers.facebook.com → Your App → WhatsApp → Getting Started
2. Generate permanent token
3. Copy Phone Number ID
4. Update `.env`: `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`
5. Pre-register message templates (required by Meta):
   - `veltro_weekly_hunt_en` (English)
   - `veltro_weekly_hunt_fr` (French)
6. Restart: `docker compose restart backend`

---

## Step 9 — Configure CDN (Cloudflare R2)

1. Go to Cloudflare dashboard → R2
2. Create bucket: `veltro-deliveries`
3. Create R2 API token with Object Read & Write permissions
4. Update `.env` with account ID + keys
5. Restart: `docker compose restart backend`

---

## Monitoring

- Grafana: `https://grafana.veltro.io` (credentials in .env)
- Prometheus: internal only
- Logs: `docker compose logs -f backend`
- Health: `https://api.veltro.io/api/health`

---

## Common issues

**Backend won't start:**
```bash
docker compose logs backend
# Look for "VELTRO STARTUP FAILED" — missing env vars
```

**Migrations fail:**
```bash
# Use DIRECT_URL (bypasses PgBouncer)
# Port 5432 not 6432
```

**WhatsApp not delivering:**
- Check Meta Business Manager — template must be APPROVED status
- Phone number must be verified in Meta dashboard

**ZIP links expired:**
- CDN links expire after 7 days — customer should download immediately
- Extend expiry in cdn-upload.service.ts if needed

---

## Rollback procedure

```bash
cd /opt/veltro
git log --oneline -10     # find last good commit
git checkout <commit>     # rollback code
docker compose up -d --build backend frontend
```

---

Questions: raykuate@gmail.com | rod@jiogue.com
