# Troubleshooting / known gotchas

Non-obvious platform-specific failure modes worth checking before assuming a bug is something new. Each entry: symptom → root cause → fix.

## JSON default-imports in `apps/api` return `undefined` at runtime

**Symptom**: `import x from './file.json'` type-checks fine (`tsc --noEmit` passes, `resolveJsonModule` is on) and `nest build` succeeds, but `x` is `undefined` in the running container.

**Root cause**: `apps/api/tsconfig.json` sets `allowSyntheticDefaultImports: true` but not `esModuleInterop: true`. The former only relaxes the type checker — it doesn't change codegen. Without `esModuleInterop`, TypeScript emits a bare `require(...)` for a default import, and a plain JSON `require()` has no `.default` property.

**Fix**: use a namespace import instead — `import * as x from './file.json'` — which compiles straight to `require()` regardless of the interop setting. Don't turn on `esModuleInterop` repo-wide just to fix one import; it changes codegen for every existing import in the codebase. After adding any new JSON data import, verify with `node -e "require('./dist/...')"` against a real build — `tsc --noEmit` passing is not sufficient proof.

## TypeORM: two entities sharing an `@Entity()` table name

**Symptom**: API crash-loops on boot with `column X of relation Y contains null values`.

**Root cause**: `synchronize` creates the table from whichever entity it processes first, then tries to `ALTER` it for the second entity sharing the same `@Entity('table_name')` — failing on any column the second entity requires `NOT NULL` that the first didn't create.

**Fix**: give every entity a unique table name. If hit, drop the conflicting table in Postgres and rename one entity's table name.

## Postgres enum-shrink deploy ordering

**Symptom**: removing a value from a TypeORM `@Column({ type: 'enum', enum: X })` crash-loops the API on boot, even with an idempotent data-migration written in `onModuleInit()`.

**Root cause**: TypeORM's `synchronize()` runs the `ALTER TYPE` during `TypeOrmModule` initialization — *before* any application `onModuleInit()` hook fires. If any live row still holds a value being removed, the `ALTER TYPE` fails immediately, before your own migration code ever executes. A second, compounding trap: once the enum actually is shrunk, any leftover code doing `WHERE "column" = $1` with a literal string no longer in the enum also crashes (Postgres must cast the parameter to the enum type, and that cast fails on a non-member value) — this recurs on every future boot if the code isn't removed, not just once.

**Fix**: migrate live data away from the doomed enum values via direct SQL (`docker exec ... psql`) *before* deploying the code that shrinks the enum — not as `onModuleInit()` application logic. Once the container boots cleanly, delete the migration code entirely rather than leaving it as a no-op.

## Never put a business-logic gate in a navigation layout file

**Symptom**: an entire tab bar silently disappears for some users; looks like "broken icons" or a routing bug.

**Root cause**: a layout file (e.g. `(vendor)/_layout.tsx`) returning a full-screen component (an onboarding gate, a subscription wall) instead of the navigation shell (`<Tabs>`/`<Stack>`) means that shell — and everything it renders, including the tab bar — never mounts at all.

**Fix**: keep layout files as pure navigation shells. Put business-logic gates inside the relevant *screen's* content area (a banner/card, a modal) so the navigation chrome stays visible regardless.

## nginx rate limits must exempt CORS preflight `OPTIONS`

**Symptom**: real users occasionally get rate-limited (503) on login, with nothing in the application logs since nginx rejects before the request reaches the app.

**Root cause**: a per-IP `limit_req` zone keyed on `$binary_remote_addr` counts a browser's CORS preflight `OPTIONS` request and the actual `POST` as two separate hits against the same quota — so a real cross-origin login costs 2 requests, not 1. A tight limit sized for "one login attempt" can be exhausted by a single normal retry (mistyped password, a slow page reload re-firing the request).

**Fix** (see `infrastructure/nginx/nginx.conf`): key the rate-limit zone on a mapped variable that's empty for `OPTIONS` requests — `map $request_method $auth_limit_key { OPTIONS ""; default $binary_remote_addr; }` — since an empty map key is nginx's documented way to exempt matching requests from a rate limit entirely. A scripted credential-stuffing tool has no reason to ever send `OPTIONS` (it isn't a real browser enforcing CORS), so this costs nothing against the actual threat model. Check any new cross-origin-called, rate-limited endpoint for the same exemption before shipping it.

## Next.js standalone Docker builds: a broken guard can ship an image with no `server.js`

**Symptom**: `admin` or `vendor` container crash-loops with `Error: Cannot find module '/app/server.js'`, even though CI reported the build succeeded.

**Root cause — two, compounding**: (1) a Next.js `output: 'standalone'` build step (`RUN npm run build`) cached from a layer pre-dating that config change ships a stale image missing `.next/standalone/server.js`; `--no-cache` fixes this. (2) Separately — and the one that actually bit in production even with `--no-cache` already on — both Dockerfiles' build-time guard was a single shell command chained with `&&`/`||` in a way that looked like a fail-loud check but wasn't one: `npm run build && test -f .next/standalone/server.js || (echo "ERROR..." && exit 1) && mkdir ... && cp ... || true`. Left-to-right AND-OR evaluation plus the trailing `|| true` fallbacks on the `cp` lines meant the *entire step reported success even when `npm run build` itself failed outright* — Docker happily shipped a broken image and printed "Built." Hit for real when `npm run build` failed with a flaky Next.js standalone-tracing `ENOENT`, most likely from building admin and vendor `--no-cache` in one combined `docker compose build` invocation and contending for CPU/memory.

**Fix**: both Dockerfiles now run the build, the `server.js` existence check, and the `node_modules` copy as **separate `RUN` layers** — each one's own exit code genuinely gates the Docker build, with no AND-OR chaining ambiguity possible. The CI workflow also builds admin and vendor as two sequential `--no-cache` invocations instead of one combined one, to reduce the resource contention that likely caused the flake. If you ever see this symptom again, check the CI logs for "Build error occurred" near that service's build step before assuming it's the stale-cache case again — the guard should now fail the `docker build` outright either way, but it's worth confirming.
