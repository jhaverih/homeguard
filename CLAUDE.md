# CLAUDE.md

Guidance for Claude Code (or any future session) working in this repo. See `README.md` for the human-facing project overview — this file is about *how to operate* in the repo correctly.

## Repo layout

npm-workspaces monorepo, Turborepo-orchestrated, single GitHub repo (`jhaverih/homeguard`), single long-lived branch (`staging` — there is no `main`).

It is **two real codebases**, not three, despite the app surfaces looking like more:

- **Web** — `apps/api` (NestJS backend) + `apps/admin` + `apps/vendor` (both Next.js 15 App Router, both call the api). `packages/shared` holds plain TS types shared across these.
- **Mobile** — `apps/mobile`, a **single** Expo/React Native (SDK 54) project that produces both the Android and iOS apps from the same source. There is no second, separate iOS codebase — `android/` is Expo-generated and gitignored, and there is no committed `ios/` folder at all.

`infrastructure/` holds the Docker Compose / nginx / Postgres-Redis-MinIO config for the deployed stack.

## Running tests locally

```bash
npm test                        # turbo run test — every workspace, in parallel
npm test --workspace=apps/api   # just one workspace (same pattern for admin/vendor/mobile)
```

`npm test` at the root requires the `packageManager` field in the root `package.json` to resolve workspaces (Turborepo 2.x hard-requires this — without it you get "Could not resolve workspaces"). If that field ever gets removed by an unrelated edit, this is why `npm test` suddenly breaks.

Per-workspace test runner:
- `apps/api` — Jest (`ts-jest`), colocated `*.spec.ts`. Pure-logic tests only (no live Postgres in CI) — rule engine, classification, pricing math.
- `apps/admin` / `apps/vendor` — Vitest, Node environment (no jsdom — nothing renders components yet, only extracted pure logic). **Next.js's App Router will not let a `page.tsx` export anything besides its own reserved names** (`default`, `metadata`, etc.) — `next build`/`tsc` fails otherwise. Testable logic pulled out of a page must live in its own module (see `apps/admin/src/lib/pricing-preview.ts`, `apps/vendor/src/lib/password-policy.ts`) and get imported back into the page, never exported from the page file itself.
- `apps/mobile` — Jest + `jest-expo`, pinned to the `sdk-54` dist-tag (matches this app's Expo SDK — check `npm view jest-expo dist-tags` and bump in lockstep with any future Expo SDK upgrade, don't just take `latest`).

## CI/CD

Three workflow files in `.github/workflows/`:

| File | Triggers | What it does |
|---|---|---|
| `staging.yml` | push to `staging`, `workflow_dispatch` | Runs `test-api`/`test-admin`/`test-vendor`, then `deploy` (`needs:` those three — **never starts if any fails**, shows as skipped) on the self-hosted QNAP runner. |
| `test-web.yml` | `pull_request` only | The same three test jobs, for PR-time feedback. Doesn't also run on push — that would just duplicate `staging.yml`'s own copies for no benefit, since a push always goes through `staging.yml` anyway. |
| `test-mobile.yml` | push to `staging`, `pull_request` | `mobile` (Jest suite) + `ios-sanity` (`expo prebuild --platform ios --no-install` + `tsc --noEmit`, Linux-only, no macOS/Xcode/simulator/signing). Nothing here deploys anything — the real iOS build/TestFlight process is manual EAS, untouched by CI. |

**Path filters, and why `package-lock.json` is deliberately absent from all of them**: every workflow lists the app directories it cares about (`apps/api/**`, etc.) plus root `package.json`. It does **not** list `package-lock.json`, even though that seems like it should matter for dependency changes — there is exactly one lockfile for the whole npm-workspaces monorepo, so installing a dependency in `apps/mobile` alone still rewrites it. Including it would make a mobile-only dependency bump spuriously trigger the web test suite and a 20-30 minute QNAP redeploy (this happened once, and was the fix). Root `package.json` stays as a trigger since it changes far less often and a change there (e.g. the workspaces list itself) is a genuine cross-cutting event.

**Verifying the deploy gate actually blocks a bad commit** (rather than just trusting the YAML): pushed a deliberately-failing test, confirmed `test-api` failed red and `deploy` showed **skipped, 0s** with no Docker build or QNAP touch at all, then reverted. If you ever change the `needs:` wiring, re-verify the same way — reading the YAML is not proof it works.

**Known flaky failure, not a code bug**: the `deploy` job's Next.js standalone build occasionally fails with `ENOENT: no such file or directory, mkdir '/app/.next/standalone/node_modules/next/dist/...'` during "Collecting build traces" (a different specific file each time) — a resource-contention race on the QNAP, not a real regression. See `docs/troubleshooting.md`'s last entry. Fix: `gh run rerun <run-id> --failed`, don't start debugging application code for this symptom.

**A local `tsc --noEmit` failure in `apps/mobile` may not be real** — `.expo/types/router.d.ts` (Expo Router's typed-routes file) is gitignored and can go stale on a dev machine that hasn't run `expo start` in a while, producing a wall of route-typing errors that a fresh CI checkout would never see (that file wouldn't exist there at all). Before treating a mobile `tsc` failure as real, delete the local `.expo/types` directory and re-run — if the errors vanish, they were never real; only what's left after that is worth fixing.

## Commit conventions

Plain, descriptive commit messages — no enforced format (Conventional Commits, etc.) was requested; revisit if that changes.

**`CHANGELOG.md` discipline** (already established, predates the CI work above — see the file's own header for the full policy): any commit that changes *deployed, user-facing behavior* gets a dated entry in the same commit, categorized Added/Changed/Fixed/Removed and tagged by app. Pure test/CI/tooling additions (like everything in this file) don't need one — nothing about what ships to a user changed. When in doubt, ask "would someone using the app or reading this repo's history need to know this happened" — if yes, it's a changelog entry.

## Legal documents & terms versioning

**The actual, served terms documents are static HTML committed at `apps/admin/public/legal/*.html`** (`customer-terms.html`, `vendor-terms.html`, plus `privacy-policy.html`) — nginx's LAN catch-all (`infrastructure/nginx/nginx.conf`'s `server_name _;` block's `location /`) routes anything not matching `/api/`, `/socket.io/`, etc. straight to the admin Next.js app, which serves anything under its own `public/` folder. `TERMS_URL`/`VENDOR_TERMS_URL` (`apps/mobile/src/services/api.ts`) point at these and are opened directly in the device browser (`Linking.openURL`) — they never reach `apps/api` at all. **`apps/api/legal/*.md` is a separate, independently-maintained copy** (fuller/draft-oriented prose, used as the source when the admin HTML was originally authored) — the two aren't auto-synced, so if you edit one for a substantive content change, check whether the other needs the same edit. (Learned the hard way: an earlier attempt at this system built a whole markdown-rendering pipeline in `apps/api` assuming the docs were dead-linked and unserved — they weren't, nginx just routes there before the request ever reaches the API. Checked only `apps/api` for something serving `/legal/*`, never `apps/admin/public/`.)

A version string per document type lives in `apps/api/src/common/constants/tos.ts` (`CURRENT_CUSTOMER_TOS_VERSION`, `CURRENT_VENDOR_TOS_VERSION`, `CURRENT_FACILITATOR_DISCLOSURE_VERSION`); each `User` row stores which version it last accepted (`tosVersion`/`vendorTosVersion`/`facilitatorDisclosureVersion`, each paired with an `*AcceptedAt` timestamp). `GET /legal/versions` (`apps/api/src/legal/legal.controller.ts`, normal `/api` prefix — called through the authenticated axios instance, not opened in a browser) exposes the current versions; the mobile app compares its stored version against that via `needsReacceptance()` (`apps/mobile/src/utils/legal.ts`) to decide whether to re-gate a user.

There is deliberately **no separate database table recording every historical version** — git history of `tos.ts` and the `.md` files *is* the version-control/audit trail (every version bump is a dated, diffable commit), which is simpler than a parallel table and harder to quietly edit after the fact.

**The general Terms & Conditions and the facilitator/agent disclosure are separate documents with separate versions and separate gates** — the general ToS gates the whole app (shown from `_layout.tsx`, `TermsGateModal`); the facilitator disclosure gates only service-request submission (shown from `app/(customer)/request.tsx`, `FacilitatorDisclosureModal`), the first time a customer submits either kind of request. Don't merge them into one version/gate — a change to one shouldn't force re-acceptance of the other.

**Hard rule, no exceptions**: never bump `CURRENT_CUSTOMER_TOS_VERSION`, `CURRENT_VENDOR_TOS_VERSION`, or `CURRENT_FACILITATOR_DISCLOSURE_VERSION` without first asking the product owner whether *this specific* content change is consequential enough to force every existing user to re-accept. Bumping one is a real, user-facing action (every affected user gets re-gated on next launch or next service request) — not a bookkeeping formality. A typo or formatting fix should not bump the version; edit the `.md` content and leave the constant alone. When genuinely unsure, ask rather than guess either direction.

## Reference

`C:\Users\hares\.claude\plans\radiant-marinating-shell.md` has the original approved plan and reasoning for the whole test/CI setup (Phases 1-4). `C:\Users\hares\.claude\plans\jazzy-napping-sutherland.md` covers the facilitator disclosure feature above, including why it's built this way rather than as a database-backed version-history table.
