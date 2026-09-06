# @homeguard/admin

The internal admin portal — customer/vendor management, pricing catalog, vendor applications and certifications, waitlist, platform analytics. Next.js (App Router), Tailwind. Only ever served on the LAN/Tailscale network, never on a public hostname (see `infrastructure/nginx/nginx.conf`).

## Running locally

```bash
npm run dev     # next dev -p 3002
```

Requires `NEXT_PUBLIC_API_URL` pointing at a running `apps/api` instance (set in `.env`, baked into the client bundle at build time — see the root `.env.example`).

`npm run build` / `npm start` (Next.js standalone production build/serve), `npm run lint`, `npm test` (Vitest — pure-logic tests only, extracted into `src/lib/`/`src/components/` since Next.js's App Router forbids a `page.tsx` from exporting anything besides its own special names).

## Deploying

Built as a Next.js standalone Docker image (`Dockerfile`) — **always with `--no-cache`** in CI (see [docs/troubleshooting.md](../../docs/troubleshooting.md) for why a cached build can silently ship a broken image). Not deployed by running `npm start` directly. Full pipeline: [docs/deployment.md](../../docs/deployment.md).
