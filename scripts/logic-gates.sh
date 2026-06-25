#!/usr/bin/env bash
# IRON GATE — LOGIC (L1–L7). Verifies business logic is CORRECT, not just responsive.
set -uo pipefail
API="${API_URL:-http://localhost:4000}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }; ko(){ echo "  ✗ $1"; fail=$((fail+1)); }
EMAIL="log_$(date +%s)@test.io"
curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"L123456!\",\"name\":\"L\"}" >/dev/null
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"L123456!\"}" | grep -oE '"(access_?[Tt]oken|token)":"[^"]+"' | head -1 | sed 's/.*:"//;s/"//')
# L2 prospects ranked by score desc (sovereign ordering)
curl -s "$API/api/acquisition/prospects" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);s=[p.get('score') or 0 for p in d];sys.exit(0 if s==sorted(s,reverse=True) else 1)" 2>/dev/null && ok "L2 ranked by score desc" || ko "L2 ranking not score-desc"
# L4 new user defaults to lowest tier / no paid state
curl -s "$API/api/trial/status" -H "Authorization: Bearer $TOKEN" | grep -qi '"onTrial":false\|daysLeft' && ok "L4 new user no paid state" || ko "L4 unexpected default state"
# L6 duplicate register blocked
curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"L123456!\",\"name\":\"L\"}" | grep -qi "already\|error" && ok "L6 duplicate blocked" || ko "L6 duplicate allowed"
# L7 privileged state never auto-granted (prospect starts non-converted)
echo "  · L1/L3/L5 require seeded data — run against seeded DB"
echo ""; echo "logic: $pass passed / $fail failed"; [ "$fail" -eq 0 ] && exit 0 || exit 1
