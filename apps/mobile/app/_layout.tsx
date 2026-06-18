import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth.store';
import { registerForPushNotificationsAsync } from '../src/services/notifications';

export default function RootLayout() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync().catch(() => {});
    }
  }, [user?.id]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
