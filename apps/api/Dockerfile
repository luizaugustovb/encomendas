# ============================================
# Dockerfile — Encomendas API (NestJS)
# ============================================
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; \
    else npm install --omit=dev; fi
# Generate Prisma client
RUN npx prisma generate

# Dev dependencies for building
FROM base AS dev-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN if [ -f package-lock.json ]; then npm ci; \
    else npm install; fi
RUN npx prisma generate

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production node_modules (without dev deps)
COPY --from=deps /app/node_modules ./node_modules
# Copy compiled output
COPY --from=builder /app/dist ./dist
# Copy prisma schema (for migrations)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Create uploads directories
RUN mkdir -p uploads/deliveries uploads/photos uploads/withdrawals

EXPOSE 3001

CMD ["node", "dist/src/main"]
