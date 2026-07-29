# Android Google Maps API key setup

The live vendor-tracking map (`react-native-maps`) needs a Google Maps SDK for Android API key to render on Android — iOS uses Apple Maps and needs no key. Until this is set, the map will render blank/grey on Android devices; everything else in the app is unaffected.

This is separate from, and much smaller than, a paid routing/Directions API (not currently used anywhere in this app) — this key only unlocks map *display*, not turn-by-turn routing.

## One-time setup (Google Cloud Console — cannot be done by an agent)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (or reuse an existing one), e.g. "Attenteve".
2. Enable billing on the project — Google requires a billing-enabled project to issue Maps API keys, but the "Maps SDK for Android" free tier is generous ($200/month credit) and a small app's map-display volume is very unlikely to incur any actual charge.
3. **APIs & Services → Library** → search "Maps SDK for Android" → Enable.
4. **APIs & Services → Credentials → Create Credentials → API key.**
5. Restrict the key (recommended, not required): Application restrictions → Android apps → add package name `com.homeguard.app` with the app's SHA-1 signing certificate fingerprint (find it via `keytool -list -v -keystore <your-keystore>` for whichever keystore signs your builds). API restrictions → restrict to "Maps SDK for Android" only.

## Applying the key

Replace the placeholder in `apps/mobile/app.json`:

```json
"android": {
  "config": {
    "googleMaps": {
      "apiKey": "REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY"
    }
  }
}
```

Then rebuild the APK following `docs/mobile-build.md`'s standard two-step process — this value is baked in at native-config time (`android/app/src/main/AndroidManifest.xml`, generated from `app.json` during prebuild), not read from `.env`, so a plain bundle-only rebuild (Step 1) will **not** pick up a key change — a full Gradle rebuild (Step 2) is required after editing it.
