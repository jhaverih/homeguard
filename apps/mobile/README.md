# @homeguard/mobile

The Attenteve mobile app — Expo + React Native + Expo Router. A single app shared by both roles: customers book/track services, browse the pricing catalog, chat with eveAI (the in-app maintenance assistant); vendors manage jobs, team, and capabilities. Role-based routing lives under `app/(customer)/` and `app/(vendor)/`.

## Running locally

```bash
npx expo start
```

Requires `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_STRIPE_PK` in `apps/mobile/.env` (baked into the JS bundle at build time, not read at runtime — see [docs/mobile-build.md](../../docs/mobile-build.md) for what that means for rebuilds).

## Building a production APK

**This is a manual, two-step local process — it is not part of any CI pipeline.** EAS cloud builds are unavailable until 2026-08-01; don't reach for `eas build` or `.github/workflows/mobile-build.yml` before then even though they exist in the repo. Full procedure, including two easy-to-hit gotchas around stale env values and stale Gradle caches: [docs/mobile-build.md](../../docs/mobile-build.md).

## Theming

`src/theme.ts` is the single source of truth for the app's color tokens (Ink/Slate/Lantern/Mist/Steel) — don't reintroduce scattered hex literals.
