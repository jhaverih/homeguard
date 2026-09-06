# Deployment

## Staging pipeline

Staging deploys automatically — there's no separate "release" step — but as of 2026-09-06 it no longer deploys unconditionally: tests gate the deploy.

```
git push origin staging
  → .github/workflows/staging.yml
  → test-api / test-admin / test-vendor (GitHub-hosted, parallel)
  → deploy (needs: the three test jobs above — never starts if any of them fails)
  → self-hosted runner (on the QNAP) builds and redeploys
```

`deploy` declares `needs: [test-api, test-admin, test-vendor]` — if a test fails, GitHub Actions never starts the `deploy` job at all (it shows as **skipped**, not failed), so a broken commit cannot reach the QNAP. This only covers `apps/api`/`apps/admin`/`apps/vendor` — `apps/mobile` isn't part of this deploy at all (see "Mobile" below), so its own test suite (`test-mobile.yml`) runs independently and has nothing to gate here.

The `deploy` job itself, in order:

1. Backs up the database (`/share/Container/homeguard/backup.sh`) — best-effort, never blocks the deploy even if Postgres isn't up yet.
2. Copies `/share/Container/homeguard/.env` → `infrastructure/.env` in the checkout, so the ephemeral CI workspace picks up real secrets.
3. Builds `admin` and `vendor` as two **separate, sequential** `--no-cache` Docker builds, then `api` and `nginx` with layer caching. Admin and vendor are both Next.js `output: 'standalone'` builds — see [troubleshooting.md](troubleshooting.md) for why `--no-cache` alone isn't sufficient and why they're built one at a time rather than together. This is also where the known flaky `ENOENT` "Collecting build traces" failure shows up (different specific file path each time) — see troubleshooting.md's last entry; the fix there is to rerun, not to treat it as a code bug.
4. Stops the app containers (`stop`, not `down` — `down` removes the Docker network, which causes QNAP dnsmasq NAT errors), brings `postgres`/`redis`/`minio` up without `--force-recreate` (their volumes are never touched), reconciles the Postgres password against `.env`.
5. Force-recreates `api`, `admin`, `nginx`, and `vendor` (never the data services) and waits for the API's health check to pass.

A manual `workflow_dispatch` run goes through the exact same `needs:` gate — there's no bypass, by design.

## QNAP operational notes

- **Host**: `192.168.86.29`, SSH alias `qnap` (see `~/.ssh/config`).
- **Docker binary**: not on the default `PATH` over SSH — use the full path `/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker`.
- **Postgres**: `docker exec -e PGPASSWORD=<value from /share/Container/homeguard/.env> infrastructure-postgres-1 psql -U homeguard -d homeguard -c "..."` — never hardcode the password in a script or commit; read it from the QNAP's own `.env` at the time you need it.
- **Manual/emergency deploy steps** (e.g. applying a config change without a full CI run): sync `.env` into the running runner container's checkout (`docker cp` or `docker exec ... cp`), then `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --force-recreate <service>` for just the affected service(s). Recreating `postgres`/`redis` alongside an unrelated service is harmless — Compose may include them in a `--force-recreate` pass, but their named volumes are untouched, so no data is lost. Verify with a row-count query after, not just container health.

## Self-hosted runner: crash-loop prevention

The runner container previously used Docker's native `restart: unless-stopped`, which restarts it *in place* (same container filesystem). An abrupt exit could leave a stale/half-written `.runner` registration file that the runner image's entrypoint could neither reuse nor cleanly deregister — crash-looping forever with `Value cannot be null (Parameter 'configuredSettings')`.

Fixed with two pieces (`/share/Container/staging/`):
- `runner-compose-deploy.yml`: `restart: "no"` — the runner is never auto-restarted by Docker itself.
- `runner-watchdog-compose.yml` + `runner-watchdog.sh`: a separate lightweight container, on a cron loop, that checks the runner's status and does a full `docker compose up -d --force-recreate` (a clean filesystem every time, not a same-container restart) if it's not running.

## Rollback

There's no automated rollback. To revert, `git revert` (or reset, if the bad commit hasn't been built on by anything else) and push `staging` again — the pipeline above re-runs from scratch, which also serves as the rollback mechanism. For a database-affecting change, restore from the pre-deploy backup taken in step 1 above rather than trying to hand-write reverse SQL.

## Mobile

Not part of this pipeline at all — see [mobile-build.md](mobile-build.md).

## Known incidents

See [troubleshooting.md](troubleshooting.md) for specific failure modes hit in this pipeline (Docker build-guard bug, nginx rate-limit CORS exemption, etc.) rather than duplicating them here.
