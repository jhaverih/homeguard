import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

// Shares the technician's location with the customer from "On my way" until
// arrival, also while the app is in the background (switched to Maps,
// phone locked). Uses the "while using the app" permission: on Android a
// foreground service with a visible notification, on iPhone the blue
// location indicator. Stops on arrival, or as soon as the server says the
// job is no longer on the way (arrived automatically, cancelled, released).
//
// This file must be imported at app start (app/_layout.tsx) so the task is
// defined before the OS delivers locations to it.

const TASK = 'attenteve-trip-location';
const JOB_KEY = 'tripJobId';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.29/api';

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) return;
  const loc = data?.locations?.[data.locations.length - 1];
  if (!loc) return;
  try {
    const [jobId, token] = await Promise.all([SecureStore.getItemAsync(JOB_KEY), SecureStore.getItemAsync('accessToken')]);
    if (!jobId || !token) { await stopTripSharing(); return; }
    const res = await fetch(`${API_URL}/service-requests/${jobId}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        ...(loc.coords.heading != null && loc.coords.heading >= 0 ? { heading: loc.coords.heading } : {}),
      }),
    });
    // 400: no longer on the way; 401/403/404: signed out or not this
    // vendor's job. Either way, stop sharing.
    if ([400, 401, 403, 404].includes(res.status)) await stopTripSharing();
  } catch {
    // Offline for a moment; the next location will try again.
  }
});

export async function startTripSharing(jobId: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(JOB_KEY, jobId);
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 200,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Sharing your location with the customer',
        notificationBody: 'Until you arrive. Stops automatically.',
        notificationColor: '#F2A93C',
      },
    });
    return true;
  } catch {
    // Not available (e.g. older build, permission changed): the job screen
    // still reports while it's open.
    return false;
  }
}

export async function stopTripSharing(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  } catch {
    // already stopped
  }
  try { await SecureStore.deleteItemAsync(JOB_KEY); } catch { /* none stored */ }
}
