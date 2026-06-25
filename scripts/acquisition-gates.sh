#!/usr/bin/env bash
# IRON GATE — ACQUISITION (A1–A4).
set -uo pipefail
SRC="${SRC_DIR:-..}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }; ko(){ echo "  ✗ $1"; fail=$((fail+1)); }
# A1 lead/prospect store exists (status lifecycle + owner)
grep -q "model Prospect" "$SRC/apps/backend/src/prisma/schema.prisma" && grep -q "ProspectStatus" "$SRC/apps/backend/src/prisma/schema.prisma" && ok "A1 prospect store + lifecycle" || ko "A1 no prospect store"
# A2 ICP declared, server-side, never exposed
grep -q "model IdealTargetProfile" "$SRC/apps/backend/src/prisma/schema.prisma" && grep -q "signalWeights, ...safe" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" && ok "A2 ICP server-only (stripped)" || ko "A2 ICP not stripped"
# A3 central engine wired, scoring never reimplemented
grep -q "CentralEngineClient" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" && ! grep -qE "score *= *[0-9]|computeScore|calculateScore" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" && ok "A3 engine wired, no local scoring" || ko "A3 local scoring detected"
# A4 cost guardrails — circuit breaker + engine internals stripped
grep -q "tokenCapCents" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" && grep -q "engineData, ...safe" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" && ok "A4 circuit breaker + internals stripped" || ko "A4 missing guardrails"
echo ""; echo "acquisition: $pass passed / $fail failed"; [ "$fail" -eq 0 ] && exit 0 || exit 1
