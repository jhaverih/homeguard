# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=2048" npm run build && \
    mkdir -p .next/standalone/node_modules && \
    cp -rL node_modules/react .next/standalone/node_modules/react 2>/dev/null || true && \
    cp -rL node_modules/react-dom .next/standalone/node_modules/react-dom 2>/dev/null || true

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:lts-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

RUN mkdir -p ./public
COPY --from=builder /app/public/ ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3002
ENV PORT=3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
