import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { Platform, Alert as RNAlert } from 'react-native';
import { userApi, hvacAnalyticsApi } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    // shouldShowBanner/shouldShowList replaced shouldShowAlert in newer
    // expo-notifications — both set so foreground presentation is correct
    // regardless of which field this SDK version actually reads.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Must match apps/api/src/iot-analytics/analytics-engine.service.ts'
// SNOOZABLE_FINDING_CATEGORY — the backend tags every water/indoor-temp
// finding alert (and its 30-min re-alerts) with this category so the OS
// shows these action buttons directly on the notification, on both iOS
// and Android, without opening the app first.
const SNOOZABLE_FINDING_CATEGORY = 'SNOOZABLE_FINDING';
const SNOOZE_ACTIONS: { identifier: string; buttonTitle: string; minutes: 30 | 60 | 240 }[] = [
  { identifier: 'SNOOZE_30', buttonTitle: 'Snooze 30m', minutes: 30 },
  { identifier: 'SNOOZE_60', buttonTitle: 'Snooze 1h', minutes: 60 },
  { identifier: 'SNOOZE_240', buttonTitle: 'Snooze 4h', minutes: 240 },
];

/**
 * Registers the notification action category behind the Snooze buttons —
 * a single cross-platform call (expo-notifications maps it to
 * UNNotificationCategory on iOS and a notification action set on Android).
 * Safe to call every app start; re-registering an existing category is a
 * no-op on both platforms. Call once from the root layout, same as
 * registerForPushNotificationsAsync.
 *
 * On Android, expo-notifications looks up the category by this exact
 * identifier from a device-local store (SharedPreferencesNotificationCategoriesStore)
 * when it builds a *received* push notification — if that store doesn't
 * have this category yet (registration never ran, or silently failed), the
 * notification still displays fine with zero buttons and no visible error
 * anywhere. So this reads the category back immediately after registering
 * and retries once + logs loudly on failure, instead of trusting a
 * fire-and-forget call that could fail invisibly.
 */
export async function registerNotificationCategoriesAsync(): Promise<void> {
  const actions = SNOOZE_ACTIONS.map((a) => ({
    identifier: a.identifier,
    buttonTitle: a.buttonTitle,
    options: { opensAppToForeground: true },
  }));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await Notifications.setNotificationCategoryAsync(SNOOZABLE_FINDING_CATEGORY, actions);
      const stored = await Notifications.getNotificationCategoriesAsync().catch(() => []);
      const found = stored.find((c) => c.identifier === SNOOZABLE_FINDING_CATEGORY);
      if (found && found.actions.length === SNOOZE_ACTIONS.length) return;
      console.warn(`[notifications] ${SNOOZABLE_FINDING_CATEGORY} category not confirmed after registration (attempt ${attempt})`, found);
    } catch (e) {
      console.warn(`[notifications] setNotificationCategoryAsync threw on attempt ${attempt}:`, e);
    }
  }
  console.warn(`[notifications] Giving up registering ${SNOOZABLE_FINDING_CATEGORY} after 2 attempts — Snooze buttons will not appear on push notifications.`);
  // Console logs are invisible to a non-technical tester on a real device —
  // this is the one case worth a visible signal, since it means Snooze
  // buttons are guaranteed not to work and there's otherwise no way to
  // know that without dev tools attached.
  RNAlert.alert('Notification setup incomplete', 'Snooze buttons on alert notifications may not appear on this device (diagnostic: category registration failed).');
}

// Shared by both the foreground listener below and the background task —
// returns true if this response was a Snooze action (handled here) so the
// caller knows not to also treat it as a plain notification tap.
async function tryHandleSnoozeAction(response: Notifications.NotificationResponse): Promise<boolean> {
  const snoozeAction = SNOOZE_ACTIONS.find((a) => a.identifier === response.actionIdentifier);
  if (!snoozeAction) return false;
  const alertId = response.notification.request.content.data?.alertId as string | undefined;
  if (!alertId) return true;
  try {
    await hvacAnalyticsApi.snoozeAlert(alertId, snoozeAction.minutes);
    RNAlert.alert('Snoozed', `We'll hold off on repeat alerts for ${snoozeAction.buttonTitle.replace('Snooze ', '')}.`);
  } catch {
    RNAlert.alert('Something went wrong', 'Could not snooze this alert — open the app and try from the finding card instead.');
  }
  return true;
}

// Android-only: on Android, a notification's action buttons are only
// reliably rendered/handled when the app process is backgrounded or fully
// terminated if a background task is registered — a plain foreground
// listener (below) is not invoked while the app isn't running. Must be
// defined at module scope (not inside a component) so the OS can invoke it
// without the rest of the app having mounted. See:
// https://docs.expo.dev/versions/latest/sdk/notifications/#background-notification-tasks
const BACKGROUND_NOTIFICATION_TASK = 'ATTENTEVE_SNOOZE_BACKGROUND_TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error || !data) return;
  if ('actionIdentifier' in data) {
    await tryHandleSnoozeAction(data as Notifications.NotificationResponse);
  }
});

export async function registerBackgroundNotificationTaskAsync(): Promise<void> {
  if (Platform.OS !== 'android') return; // iOS handles category actions without this
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (e) {
    console.warn('Could not register background notification task:', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Attenteve Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0B4A45',
      sound: 'default',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? '9ec8fbd8-d213-4bc8-9c9d-646646255a46';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // Native FCM registration token (Android only) — sent alongside the Expo
  // token so category-tagged (Snoozable) alerts can go out via direct FCM,
  // bypassing Expo's push relay, which silently drops the categoryId field
  // before it reaches the device (confirmed via on-device diagnostic).
  let fcmDeviceToken: string | undefined;
  if (Platform.OS === 'android') {
    try {
      fcmDeviceToken = (await Notifications.getDevicePushTokenAsync()).data as string;
    } catch (e) {
      console.warn('Could not get native FCM device token:', e);
    }
  }

  try {
    await userApi.updatePushToken(token, fcmDeviceToken);
  } catch (e) {
    console.warn('Could not register push token:', e);
  }

  return token;
}

/**
 * Schedule a local, on-device reminder — no push infra/Firebase involved.
 * Used for "remind me about my next inspection" style features. Requests
 * notification permission if not already granted (separate from the push
 * permission requested in registerForPushNotificationsAsync).
 */
export async function scheduleLocalReminder(date: Date, title: string, body: string): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000; // 24h before
  const triggerDate = new Date(date.getTime() - REMINDER_LEAD_MS);
  if (triggerDate.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
}

/**
 * Set up listeners for the app session.
 * - Foreground alerts are shown automatically by setNotificationHandler above.
 * - onIncrement: called only for real Yolink alerts (data.screen === 'alerts'), bumps badge count.
 * - onAlert: called when a notification arrives in foreground; receives the notification content.
 * - onNavigate: called when the user taps a notification; receives the target screen name.
 *
 * Call once from the root layout after authentication.
 * Returns a cleanup function.
 */
export function setupNotificationListeners(
  onIncrement: () => void,
  onNavigate: (screen: string) => void,
  onAlert?: (notification: Notifications.Notification) => void,
): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    // Only real Yolink monitoring alerts should bump the Alerts tab badge —
    // this used to fire for every push (job updates, payments, schedule
    // changes, etc.), so the badge count and the Alerts screen's actual
    // contents (scoped to the `alerts` table) were never the same data.
    // Same 'alerts' vs. everything-else distinction onNavigate already uses.
    const screen = notification.request.content.data?.screen as string | undefined;
    if (screen === 'alerts') onIncrement();
    onAlert?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    // A Snooze action button was tapped (not a plain tap-to-open) — handle
    // it here directly instead of navigating anywhere; the same action is
    // available in-app on the finding card if the customer wants to see it.
    // (Also handled by the Android background task above when the app
    // wasn't running at tap time — this covers the foreground case.)
    if (await tryHandleSnoozeAction(response)) return;

    // 'alerts' is reserved for actual Yolink monitoring alerts (AlertsService sets
    // it explicitly); anything else that didn't specify a screen is a general
    // notification (schedule change, job completed, etc.) and belongs in the
    // general notification center, not the Yolink-branded alerts screen.
    const screen = response.notification.request.content.data?.screen as string | undefined;
    onNavigate(screen ?? 'notifications');
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
