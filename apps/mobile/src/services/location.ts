import * as Location from 'expo-location';

// A quick position for "On my way": a recent cached fix if there is one,
// otherwise a fresh one, giving up after a few seconds so the button never
// hangs. Returns null when no position is available; the status still
// changes, the customer's notification just has no arrival estimate.
export async function quickPosition(timeoutMs = 8000): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch {
    // fall through to a fresh fix
  }
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return fresh ? { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude } : null;
  } catch {
    return null;
  }
}
