# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
# Split into separate RUN layers deliberately — see apps/vendor/Dockerfile's comment on this
# same pattern: a combined `A && B || (echo ... && exit 1) && C || true` chain looks like a
# fail-loud guard but the trailing `|| true` fallbacks let the whole step report success even
# when `npm run build` itself fails outright. Each RUN below fails the build on its own exit
# code.
RUN NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=2048" npm run build
RUN test -f .next/standalone/server.js || (echo "ERROR: standalone server.js not generated — check output:'standalone' in next.config" >&2 && exit 1)
RUN mkdir -p .next/standalone/node_modules
RUN cp -rL node_modules/react .next/standalone/node_modules/react 2>/dev/null || true
RUN cp -rL node_modules/react-dom .next/standalone/node_modules/react-dom 2>/dev/null || true

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:lts-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

RUN mkdir -p ./public ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3002
ENV PORT=3002
# Next.js standalone binds to $HOSTNAME when set; Docker auto-sets it to the
# container ID, which the healthcheck below (127.0.0.1) can't reach otherwise.
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3002',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
