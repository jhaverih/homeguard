# @homeguard/mobile

The Attenteve mobile app — Expo + React Native + Expo Router. A single app shared by both roles: customers book/track services, browse the pricing catalog, chat with eveAI (the in-app maintenance assistant); vendors manage jobs, team, and capabilities. Role-based routing lives under `app/(customer)/` and `app/(vendor)/`.

## Running locally

```bash
npx expo start
```

Requires `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_STRIPE_PK` in `apps/mobile/.env` (baked into the JS bundle at build time, not read at runtime — see [docs/mobile-build.md](../../docs/mobile-build.md) for what that means for rebuilds).

`npm test` (Jest + `jest-expo`, pinned to the `sdk-54` tag to match this app's Expo SDK — bump it in lockstep with any future Expo SDK upgrade). CI also runs a Linux-only `expo prebuild --platform ios` + `tsc --noEmit` sanity check on every change (no macOS runner, no Xcode, no simulator) — see `.github/workflows/test-mobile.yml`.

## Building a production release

**Android**: manual, two-step, local — not part of any CI pipeline. Full procedure, including two easy-to-hit gotchas around stale env values and stale Gradle caches: [docs/mobile-build.md](../../docs/mobile-build.md).

**iOS**: manual EAS cloud build (`.github/workflows/mobile-build.yml`, triggered by hand via the Actions tab — deliberately not automatic, since EAS free-tier credits reset monthly and are limited; see that file's own comment). There's no local iOS build path since there's no Mac available to run Xcode.

## Theming

`src/theme.ts` is the single source of truth for the app's color tokens (Ink/Slate/Lantern/Mist/Steel) — don't reintroduce scattered hex literals.
