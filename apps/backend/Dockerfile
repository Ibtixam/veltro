# Veltro — Backend Dockerfile
# Node.js 24 LTS · NestJS 11 · Fastify · Bible V2

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app

# ─── DEPS ────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
COPY src/prisma ./src/prisma/
RUN npm ci --omit=dev && \
    npx prisma generate --schema=src/prisma/schema.prisma

# ─── BUILD ───────────────────────────────────────────────
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
RUN npm run build

# ─── PRODUCTION ──────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/prisma ./src/prisma
COPY package*.json ./

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
