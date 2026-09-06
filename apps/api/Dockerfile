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
# Read at runtime by LegalController (src/legal/legal.controller.ts) via
# process.cwd() — never compiled, so it isn't in dist/ and has to be copied
# separately. Was never copied here before, which meant /legal/*.html
# returned nothing in every deployed environment.
COPY --chown=node:node legal ./legal

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
