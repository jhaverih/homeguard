# @homeguard/api

The Attenteve backend — a NestJS REST API serving the admin portal, vendor portal, and mobile app. Postgres (via TypeORM) for persistence, Redis for queues/caching, MinIO for file storage, Stripe for payments, and an Ollama-backed maintenance chatbot.

## Running locally

```bash
npm run dev     # nest start --watch, listens on API_PORT (see .env)
```

Env vars come from the root `.env` — see `.env.example` at the repo root for the full list (database, Redis, JWT, MinIO, Stripe, SMTP). Don't add a separate `.env.example` here; the whole monorepo shares one.

`npm run build` (compiles to `dist/`), `npm start` (runs the compiled build), `npm test` (Jest), `npm run lint`.

## Schema

TypeORM `synchronize` is on outside of `NODE_ENV=production` (`app.module.ts`) — entity changes apply automatically on next boot in development/staging. There is no migrations directory. See [docs/troubleshooting.md](../../docs/troubleshooting.md) for two sharp edges this causes (enum-shrinking, duplicate table names).

## API docs

Every controller is annotated with `@nestjs/swagger` decorators; `main.ts` serves the generated OpenAPI spec as Swagger UI at `/api/docs`. Reachable on the internal network at `http://192.168.86.29/api/docs` — deliberately not exposed on the public gateway (see `infrastructure/nginx/nginx.conf`).

## Deploying

Not run directly in production — built into a Docker image and deployed via the pipeline in [docs/deployment.md](../../docs/deployment.md).
