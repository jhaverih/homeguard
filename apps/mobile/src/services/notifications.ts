import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert as RNAlert } from 'react-native';
import { userApi, hvacAnalyticsApi } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
 */
export async function registerNotificationCategoriesAsync(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    SNOOZABLE_FINDING_CATEGORY,
    SNOOZE_ACTIONS.map((a) => ({
      identifier: a.identifier,
      buttonTitle: a.buttonTitle,
      options: { opensAppToForeground: true },
    })),
  );
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

  try {
    await userApi.updatePushToken(token);
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

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    // A Snooze action button was tapped (not a plain tap-to-open) — handle
    // it here directly instead of navigating anywhere; the same action is
    // available in-app on the finding card if the customer wants to see it.
    const snoozeAction = SNOOZE_ACTIONS.find((a) => a.identifier === response.actionIdentifier);
    if (snoozeAction) {
      const alertId = response.notification.request.content.data?.alertId as string | undefined;
      if (alertId) {
        hvacAnalyticsApi.snoozeAlert(alertId, snoozeAction.minutes)
          .then(() => RNAlert.alert('Snoozed', `We'll hold off on repeat alerts for ${snoozeAction.buttonTitle.replace('Snooze ', '')}.`))
          .catch(() => RNAlert.alert('Something went wrong', 'Could not snooze this alert — open the app and try from the finding card instead.'));
      }
      return;
    }

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
