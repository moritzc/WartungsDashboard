# syntax=docker/dockerfile:1

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# OpenSSL needed for Prisma engine generation
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (layer-cached)
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY . .

# Build client (Vite) and server (tsc)
RUN npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# dumb-init + openssl (Prisma needs openssl at runtime for SQLite engine)
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# Copy built artefacts — owned by root initially
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

# Data directory for SQLite — mounted as a named volume
RUN mkdir -p /app/data

# Fix ownership: everything under /app owned by node user
RUN chown -R node:node /app

USER node

EXPOSE 3067

# Run pending migrations then start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/server/index.js"]
