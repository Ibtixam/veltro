#!/usr/bin/env bash
# IRON GATE — Smoke test. Verifies the booted stack end-to-end.
# Requires the stack running (docker compose up -d). Exits 0 only if all green.
set -uo pipefail
API="${API_URL:-http://localhost:4000}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
ko(){ echo "  ✗ $1"; fail=$((fail+1)); }

echo "SMOKE TEST → $API"
# 1. Postgres reachable (via health)
curl -sf "$API/api/health" >/dev/null && ok "API health" || ko "API health"
# 2. Redis (health reports it)
curl -sf "$API/api/health" | grep -qi "redis\|ok" && ok "health payload" || ko "health payload"
# 3. Register
EMAIL="smoke_$(date +%s)@test.io"
REG=$(curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest123!\",\"name\":\"Smoke\"}")
echo "$REG" | grep -q "error" && ko "register ($REG)" || ok "register"
# 4. Login
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest123!\"}" | grep -oE '"(access_?[Tt]oken|token)":"[^"]+"' | head -1 | sed 's/.*:"//;s/"//')
[ -n "$TOKEN" ] && ok "login (token)" || ko "login (no token)"
# 5. Authed read
curl -sf "$API/api/crm/metrics" -H "Authorization: Bearer $TOKEN" >/dev/null && ok "authed CRM metrics" || ko "authed CRM metrics"

echo ""; echo "smoke: $pass passed / $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
