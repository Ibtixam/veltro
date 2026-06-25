#!/usr/bin/env bash
# IRON GATE — SECURITY (S1–S8). Live tests against a booted instance.
set -uo pipefail
API="${API_URL:-http://localhost:4000}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
ko(){ echo "  ✗ $1"; fail=$((fail+1)); }

# Setup: a normal user token
EMAIL="sec_$(date +%s)@test.io"
curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SecTest123!\",\"name\":\"Sec\"}" >/dev/null
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SecTest123!\"}" | grep -oE '"(access_?[Tt]oken|token)":"[^"]+"' | head -1 | sed 's/.*:"//;s/"//')

# S1 protected route rejects no-token
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crm/metrics")" = "401" ] && ok "S1 no-token → 401" || ko "S1 no-token not 401"
# S2 forged JWT rejected
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crm/metrics" -H 'Authorization: Bearer forged.token.xyz')" = "401" ] && ok "S2 forged JWT → 401" || ko "S2 forged JWT not 401"
# S3 mass-assignment: inject role/isAdmin on register
R=$(curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"ma_$(date +%s)@test.io\",\"password\":\"X123456!\",\"name\":\"x\",\"role\":\"ADMIN\"}")
echo "$R" | grep -qi '"role":"ADMIN"' && ko "S3 mass-assign role leaked" || ok "S3 mass-assign blocked"
# S4 sensitive fields never leak
curl -s "$API/api/crm/contacts" -H "Authorization: Bearer $TOKEN" | grep -qi "passwordHash" && ko "S4 passwordHash leaked" || ok "S4 no passwordHash"
# S5 SQL injection in query param → no 500
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crm/contacts?status=NEW';DROP%20TABLE%20users;--" -H "Authorization: Bearer $TOKEN")
[ "$C" != "500" ] && ok "S5 injection handled ($C)" || ko "S5 injection → 500"
# S6 trade-secret fields never in output (engineData/signalWeights/provider internal)
curl -s "$API/api/acquisition/prospects" -H "Authorization: Bearer $TOKEN" | grep -qiE "engineData|signalWeights" && ko "S6 sovereign field leaked" || ok "S6 sovereign fields absent"
# S7 security headers
H=$(curl -s -D - -o /dev/null "$API/api/health")
echo "$H" | grep -qi "x-frame-options\|content-security-policy\|x-content-type" && ok "S7 security headers" || ko "S7 missing security headers"
# S8 rate-limit (burst)
codes=$(for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code} ' "$API/api/auth/login" -X POST -H 'Content-Type: application/json' -d '{"email":"x@x.io","password":"y"}'; done)
echo "$codes" | grep -q "429" && ok "S8 rate-limit (429)" || ko "S8 no 429 under burst"

echo ""; echo "security: $pass passed / $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
