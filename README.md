# Attenteve

Attenteve is a subscription-based home-services platform: homeowners get scheduled inspections, monitoring, repair, and maintenance from vetted local vendors, all booked through a mobile app. Vendors run their business (jobs, team, capabilities, payments) through a dedicated web portal, and internal staff manage the whole platform through an admin portal.

## Repo layout

This is an npm-workspaces monorepo managed with [Turborepo](https://turbo.build/repo).

| Path | What it is | Docs |
|---|---|---|
| `apps/api` | NestJS REST API — the backend for every other app | [apps/api/README.md](apps/api/README.md) |
| `apps/admin` | Next.js internal admin portal | [apps/admin/README.md](apps/admin/README.md) |
| `apps/vendor` | Next.js vendor-facing web portal | [apps/vendor/README.md](apps/vendor/README.md) |
| `apps/mobile` | Expo/React Native app (shared by customers and vendors) | [apps/mobile/README.md](apps/mobile/README.md) |
| `infrastructure/` | Docker Compose, nginx, Postgres/Redis/MinIO, Cloudflare Tunnel config | [docs/deployment.md](docs/deployment.md) |
| `packages/` | Shared workspace packages | — |

## Prerequisites

- Node.js ≥ 20, npm ≥ 10 (see `engines` in `package.json`)
- Docker + Docker Compose, for running the full stack locally or for infra work
- A copy of `.env.example` filled in as `.env` (see below)

## Local development

```bash
npm install                  # installs all workspaces
cp .env.example .env         # fill in real values — see the file's own comments
npm run dev                  # turbo run dev — starts api/admin/vendor concurrently
```

Each app can also be run individually — see its own README for the exact command and port. `apps/mobile` isn't part of `npm run dev`; it's a separate Expo project, see [apps/mobile/README.md](apps/mobile/README.md).

Other root scripts: `npm run build`, `npm run lint`, `npm test`, `npm run clean` — all Turbo-orchestrated across every workspace.

## API docs

The API exposes live Swagger/OpenAPI docs, generated from the NestJS controller decorators (never hand-maintained, so they can't drift). Reachable on the internal network only, not from the public internet:

```
http://192.168.86.29/api/docs
```

## Deploying

Staging deploys automatically on every push to the `staging` branch. See [docs/deployment.md](docs/deployment.md) for the full pipeline, and [docs/mobile-build.md](docs/mobile-build.md) for the mobile app specifically — it is **not** part of that automatic pipeline and requires a separate manual build.

## Change history

Every deploy-worthy change is logged in [CHANGELOG.md](CHANGELOG.md), which also documents the convention for keeping it up to date.

## Known issues and gotchas

Before touching deploy config, the API's JSON data imports, TypeORM entities, or a Next.js/Docker build, check [docs/troubleshooting.md](docs/troubleshooting.md) — it covers several non-obvious failure modes that have already cost real debugging time once each.
