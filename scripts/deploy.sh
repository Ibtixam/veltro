#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VELTRO — One-command deploy script (Hetzner / any Ubuntu 24)
# Wouessi Bible V2 compliant
# Usage: bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${GREEN}[VELTRO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

log "Starting Veltro deployment — Bible V2"

# Check .env
[ ! -f .env ] && error ".env not found. Copy .env.example → .env and fill all values."
source .env
[ -z "$DATABASE_URL" ] && error "DATABASE_URL is not set in .env"
[ -z "$REDIS_PASSWORD" ] && error "REDIS_PASSWORD is not set in .env"
[ -z "$JWT_SECRET" ] && error "JWT_SECRET is not set in .env"
[ -z "$PAYBRIDGE_API_KEY" ] && warn "PAYBRIDGE_API_KEY not set — PayBridge Africa disabled, Stripe only"

log "Environment validated"

# Install Docker if needed
if ! command -v docker &> /dev/null; then
  log "Installing Docker 26..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
fi

# Install Node 24 if needed
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 24 ]]; then
  log "Installing Node.js 24 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Install dependencies
log "Installing dependencies..."
npm ci --workspace=apps/backend
npm ci --workspace=apps/frontend

# Generate Prisma client
log "Generating Prisma client..."
npm run db:generate

# Build
log "Building applications..."
npm run build

# Run migrations
log "Running database migrations..."
cd apps/backend && npx prisma migrate deploy && cd ../..

# Docker compose up
log "Starting infrastructure..."
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Wait for health
log "Waiting for services to be healthy..."
sleep 15
docker compose -f infrastructure/docker/docker-compose.yml ps

log ""
log "════════════════════════════════════════════"
log "  Veltro is live!"
log "  App:      https://${APP_URL:-yourdomain.com}"
log "  Grafana:  https://grafana.${APP_URL:-yourdomain.com}"
log "  Traefik:  https://traefik.${APP_URL:-yourdomain.com}"
log "════════════════════════════════════════════"
log ""
log "Next steps:"
log "  1. Configure webhooks in PayBridge + Stripe dashboards"
log "  2. Add Google Analytics service account keys"
log "  3. Connect Buffer for social publishing"
log "  4. Run: npm run reports:weekly (to test weekly reports)"
