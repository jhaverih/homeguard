import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth.store';
import { registerForPushNotificationsAsync } from '../src/services/notifications';

export default function RootLayout() {
  const { loadFromStorage, user, isLoading } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/(auth)/login');
      } else {
        registerForPushNotificationsAsync();
        if (user.activeRole === 'VENDOR') {
          router.replace('/(vendor)');
        } else {
          router.replace('/(customer)');
        }
      }
    }
  }, [user, isLoading]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
