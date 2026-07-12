# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

# Baked into the client bundle at build time — this app is served on its own port
# (3003), not proxied same-origin by nginx like the admin app, so a relative /api
# path would not resolve correctly; it must be an absolute URL.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=2048" npm run build && \
    test -f .next/standalone/server.js || (echo "ERROR: standalone server.js not generated — check output:'standalone' in next.config" && exit 1) && \
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
EXPOSE 3003
ENV PORT=3003
# Next.js standalone binds to $HOSTNAME when set; Docker auto-sets it to the
# container ID, which the healthcheck below (127.0.0.1) can't reach otherwise.
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3003',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
