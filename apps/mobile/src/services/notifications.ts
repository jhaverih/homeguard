import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { userApi } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
 * - onIncrement: called when a notification arrives in foreground (bumps badge count).
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
    onIncrement();
    onAlert?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
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
