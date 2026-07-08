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
      name: 'Houmi Alerts',
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
 * Set up listeners for the app session.
 * - Foreground alerts are shown automatically by setNotificationHandler above.
 * - onIncrement: called when a notification arrives in foreground (bumps badge count).
 * - onNavigate: called when the user taps a notification; receives the target screen name.
 *
 * Call once from the root layout after authentication.
 * Returns a cleanup function.
 */
export function setupNotificationListeners(
  onIncrement: () => void,
  onNavigate: (screen: string) => void,
): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener(() => {
    onIncrement();
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const screen = response.notification.request.content.data?.screen as string | undefined;
    onNavigate(screen ?? 'alerts');
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
