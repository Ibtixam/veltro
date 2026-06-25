#!/usr/bin/env bash
# IRON GATE — ROI / REVENUE-PROTECTION (R1–R8). Protects money + IP.
set -uo pipefail
API="${API_URL:-http://localhost:4000}"; SRC="${SRC_DIR:-..}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }; ko(){ echo "  ✗ $1"; fail=$((fail+1)); }
# R2 sovereign logic not shipped in frontend (strip base64 first)
if grep -rIE "signalWeights|tokenCapCents|getPriceForPlan|WhisperScore|engineData" "$SRC/apps/frontend/src" 2>/dev/null | grep -v "data:.*base64" | grep -q .; then ko "R2 sovereign logic in frontend"; else ok "R2 no sovereign logic in frontend"; fi
# R5 no internal entity/owner attribution in client files
if grep -rIiE "ray's doctrine|jiogue|wouessi|praya|\bJFK\b" "$SRC/apps/frontend/src" 2>/dev/null | grep -q .; then ko "R5 IP attribution in frontend"; else ok "R5 no IP attribution in frontend"; fi
# R1/R4 provider identity never reachable (PayBridge doctrine) — check frontend never names providers behind PayBridge
if grep -rIiE "flutterwave|wave api secret|provider_identity" "$SRC/apps/frontend/src" 2>/dev/null | grep -q .; then ko "R1 provider identity in frontend"; else ok "R1 provider identity hidden"; fi
# R3 no paid state without verified payment — checkout alone never upgrades (static: webhook gates on SUCCEEDED)
grep -q "PaymentStatus.SUCCEEDED\|status: 'SUCCEEDED'\|=== 'SUCCEEDED'" "$SRC/apps/backend/src/modules/payment/payment.controller.ts" 2>/dev/null && ok "R3 paid state gated on SUCCEEDED" || ko "R3 paid state not gated"
# R7 expensive AI endpoint capped — acquisition has circuit breaker
grep -q "tokenCap\|circuit\|CAPPED" "$SRC/apps/backend/src/modules/acquisition/acquisition.service.ts" 2>/dev/null && ok "R7 AI endpoint capped (circuit breaker)" || ko "R7 no cost cap"
echo "  · R6/R8 require live booted instance"
echo ""; echo "roi: $pass passed / $fail failed"; [ "$fail" -eq 0 ] && exit 0 || exit 1
