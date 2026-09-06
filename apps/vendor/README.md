# @homeguard/vendor

The vendor-facing web portal — company profile, service-area coverage, team management, job queue, payments, capabilities/certifications. Next.js (App Router), Tailwind, Stripe Elements for vendor-side payment flows. Publicly reachable at `vendor.attenteve.com`, guarded by the API's own auth (not by network restriction, unlike the admin portal).

## Running locally

```bash
npm run dev     # next dev -p 3003
```

Requires `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STRIPE_PK` (Stripe *publishable* key — safe to expose client-side) in `.env` — see the root `.env.example`. Both are baked into the client bundle at build time.

`npm run build` / `npm start` (Next.js standalone production build/serve), `npm run lint`, `npm test` (Vitest — pure-logic tests only, extracted into `src/lib/` since Next.js's App Router forbids a `page.tsx` from exporting anything besides its own special names).

## Deploying

Built as a Next.js standalone Docker image (`Dockerfile`) — **always with `--no-cache`** in CI (see [docs/troubleshooting.md](../../docs/troubleshooting.md) for why a cached build can silently ship a broken image). Full pipeline: [docs/deployment.md](../../docs/deployment.md).
