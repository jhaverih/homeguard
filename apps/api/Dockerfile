# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:lts-alpine AS runner
ENV NODE_ENV=staging
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
