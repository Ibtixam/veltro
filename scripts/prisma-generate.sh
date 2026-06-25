#!/usr/bin/env bash
# Generate Prisma client from monorepo root (never from apps/backend).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="apps/backend/src/prisma/schema.prisma"
CACHE_DIR="${HOME}/.cache/prisma"

cd "$ROOT"

# Prisma engine cache can get corrupted; clear it if the binary is missing.
if [ -d "$CACHE_DIR" ]; then
  if ! find "$CACHE_DIR" -name 'libquery-engine' -type f 2>/dev/null | grep -q .; then
    echo "[prisma] Clearing incomplete engine cache at $CACHE_DIR"
    rm -rf "$CACHE_DIR"
  fi
fi

echo "[prisma] Generating client from $ROOT"
npx prisma generate --schema="$SCHEMA"
