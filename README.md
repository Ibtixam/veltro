# Veltro — Revenue Discovery Engine

AI-powered SEO + GEO growth platform. Multi-tenant SaaS: one backend, one
Postgres, every row partitioned by owner. Turnkey deployment via Docker Compose.

## Platform Components Standard — declared status

| Component | Status |
|---|---|
| **Admin + RBAC** | ✅ Present. `RolesGuard` (admin ≠ user, non-admin → 403). Admin mutations audited server-side (`admin_audit_logs`). |
| **Acquisition** | ✅ Present. Prospect store + status lifecycle, server-only ICP, wired to the **central engine** (`CentralEngineClient`) — scoring is **never** reimplemented locally. Hard per-cohort token cap (circuit breaker). Engine internals never exposed. |
| **Auth + sovereign backend** | ✅ Present. JWT; pricing/scoring/orchestration server-side only. |
| **CMS** | ✅ Present (tenant-scoped by `ownerId`). |
| **CRM** | ✅ Present (tenant-scoped, `TenantGuard` defense-in-depth). |

No exemptions declared — all default + required components are implemented.

## Sovereign rules (enforced server-side)
- Scoring/pricing/orchestration never reach the frontend.
- Payment provider identity hidden behind PayBridge (trade secret).
- Acquisition engine internals (`engineData`, `signalWeights`) stripped from every client response.
- No internal entity attribution in any client-facing file.

## Deploy (turnkey)
```bash
cp .env.example .env            # fill secrets — strong JWT_SECRET/ENCRYPTION_KEY required in prod
docker compose up -d            # postgres 18 + pgbouncer + redis + backend + frontend + traefik + keycloak + monitoring
# inside backend container (first boot):
npm run db:migrate && npm run db:seed
bash scripts/smoke-test.sh      # end-to-end green check
```

## IRON GATE v3 — running the gates
```bash
# After `docker compose up -d` and seed:
LIVE=1 API_URL=http://localhost:4000 bash scripts/smoke-test.sh
LIVE=1 API_URL=http://localhost:4000 bash scripts/security-gates.sh
LIVE=1 API_URL=http://localhost:4000 bash scripts/logic-gates.sh
SRC_DIR=. bash scripts/roi-gates.sh
LIVE=1 API_URL=http://localhost:4000 SRC_DIR=. bash scripts/integration-gates.sh
SRC_DIR=. bash scripts/acquisition-gates.sh
```
Static gates (ROI, Acquisition, Integration-I5) run without a booted instance.
Live gates (smoke, Security S1–S8, Logic, Integration I1–I4) require the stack up.
