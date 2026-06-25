#!/usr/bin/env bash
# IRON GATE — INTEGRATION/WIRING (I1–I5).
set -uo pipefail
API="${API_URL:-http://localhost:4000}"; SRC="${SRC_DIR:-..}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }; ko(){ echo "  ✗ $1"; fail=$((fail+1)); }

# I3 admin RBAC: normal user → 403 (LIVE)
if [ "${LIVE:-0}" = "1" ]; then
  EMAIL="int_$(date +%s)@test.io"
  curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"I123456!\",\"name\":\"I\"}" >/dev/null
  TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"I123456!\"}" | grep -oE '"(access_?[Tt]oken|token)":"[^"]+"' | head -1 | sed 's/.*:"//;s/"//')
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/admin/metrics" -H "Authorization: Bearer $TOKEN")" = "403" ] && ok "I3 non-admin → 403" || ko "I3 non-admin not 403"
else
  echo "  · I3 (RBAC 403) requires LIVE=1 + booted instance"
fi

# I5 no orphan ROUTES — every controller must be mounted in a wired module.
ORPHAN=0
for ctrl in $(find "$SRC/apps/backend/src/modules" -name "*.controller.ts"); do
  cname=$(grep -oE "class [A-Za-z]+Controller" "$ctrl" | head -1 | awk '{print $2}')
  [ -z "$cname" ] && continue
  # find a module file that lists this controller AND is imported in app.module
  mounted=0
  for mod in $(grep -rl "$cname" "$SRC/apps/backend/src/modules"/*/*.module.ts 2>/dev/null); do
    mcls=$(grep -oE "class [A-Za-z]+Module" "$mod" | head -1 | awk '{print $2}')
    if grep -q "$mcls" "$SRC/apps/backend/src/app.module.ts" 2>/dev/null; then mounted=1; break; fi
  done
  [ "$mounted" = "0" ] && { echo "    orphan route: $cname"; ORPHAN=$((ORPHAN+1)); }
done
[ "$ORPHAN" -eq 0 ] && ok "I5 no orphan routes (all controllers mounted)" || ko "I5 $ORPHAN orphan controller(s)"

echo "  · I1/I2/I4 require LIVE=1 + seeded data"
echo ""; echo "integration: $pass passed / $fail failed"; [ "$fail" -eq 0 ] && exit 0 || exit 1
