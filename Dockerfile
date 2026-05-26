# ─── Base ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ─── Dependencies ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# ─── Builder ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders keep image builds reproducible. Runtime env is
# validated strictly when NODE_ENV/APP_ENV indicate production.
ENV BETTER_AUTH_SECRET=build-secret-minimum-32-characters \
    BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000 \
    DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_hub \
    APP_ENCRYPTION_KEY=1111111111111111111111111111111111111111111111111111111111111111 \
    OBJECT_STORAGE_BUCKET=ai-hub \
    OBJECT_STORAGE_ACCESS_KEY_ID=build-access-key \
    OBJECT_STORAGE_SECRET_ACCESS_KEY=build-storage-secret
RUN npm run build

# ─── Migrator ────────────────────────────────────────────────────────────
FROM base AS migrator
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
RUN npm install tsx --no-save
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY scripts/migrate.ts ./scripts/migrate.ts
ENTRYPOINT ["npx", "tsx", "scripts/migrate.ts"]

# ─── Runner (Next.js standalone) ────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

# ─── Worker ──────────────────────────────────────────────────────────────
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN npm install tsx --no-save

EXPOSE 3001
CMD ["npx", "tsx", "src/server/infrastructure/worker/index.ts"]

