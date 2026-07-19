# Building a production Android APK

This is a **manual, local, two-step process** — it is not part of the staging CI pipeline, and is currently the *only* way to produce a build: EAS cloud builds are unavailable until 2026-08-01 (plan/service restarts then). Don't reach for `eas build` or `.github/workflows/mobile-build.yml` before that date even though they exist in the repo.

## Why two steps

`expo-router` is hoisted to the monorepo root (`node_modules/expo-router`), not installed inside `apps/mobile/node_modules`. Gradle's own `expo export:embed` invocation resolves the project root incorrectly when called that way, so the bundle has to be generated manually first and left for Gradle to pick up from `src/main/assets/`.

## Step 1 — generate the JS bundle

From `apps/mobile`:

```bash
npx expo export:embed --platform android --dev false \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
```

`--dev false` is **mandatory** — omitting it produces a dev-mode bundle that crashes on launch with "Cannot create devtools websocket connections in embedded environments."

## Step 2 — build the APK

```bash
cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Two Gradle config facts worth knowing if a build ever seems to skip bundling or fails oddly: `bundleInDebug` is deliberately commented out in `gradle.properties` (re-enabling it makes Gradle try to bundle itself, which fails), and `debuggableVariants` is unset (defaults to `["debug"]`, so Gradle skips its own bundling for the debug variant and just picks up the file Step 1 wrote).

## When an `EXPO_PUBLIC_*` env var changes

Metro's bundle cache is keyed on **source file content**, not env var values — if only `apps/mobile/.env` changed (not any `.ts`/`.tsx` file), a normal Step 1 run can silently serve a stale cached bundle with the *old* env value baked in, even though the build reports success and the file gets copied cleanly. Symptom on a real device: something like "Cannot Connect to Server" pointing at the old value, with no error anywhere in the build output.

When this applies:
1. Add `--reset-cache` to the Step 1 command. Confirm it actually took effect via the `warning: Bundler cache is empty, rebuilding` log line — its absence means the cache wasn't cleared.
2. Before Step 2, delete `android/app/build/intermediates/merged_assets`, `android/app/build/intermediates/assets`, and `android/app/build/outputs/apk` — Gradle's own incremental build can independently mark `:app:packageDebug` "UP-TO-DATE" and re-zip the *previous* bundle into the APK even though Step 1 just wrote a fresh one. Don't run `./gradlew clean` for this — it fails on react-native-codegen's autolinking CMake files in this repo, unrelated to the actual problem; deleting the specific directories above is the targeted fix.

## Verifying a build actually contains what you think it does

Don't trust "BUILD SUCCESSFUL" plus a byte-identical file copy alone — both can be true on a build that still shipped stale code (see above). Grep the packaged bundle directly for a string that only exists in the change you just made:

```bash
unzip -p app/build/outputs/apk/debug/app-debug.apk assets/index.android.bundle | grep -c "<distinctive literal string from your change>"
```

Local variable/function names get minified and won't survive this check — use a string literal (an error message, an object key used as a route param name, etc.) instead.

## Distributing the build

Copy the built APK to `Q:\homeguard\houmi-latest.apk`, verifying the copy is byte-identical (`sha256sum` on both source and destination) before considering the build done.
