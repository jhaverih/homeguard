import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth.store';
import { registerForPushNotificationsAsync } from '../src/services/notifications';

function AuthRedirect() {
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Restore auth state from secure storage on first mount
  useEffect(() => {
    loadFromStorage();
  }, []);

  // Redirect whenever auth state or current route changes
  useEffect(() => {
    if (isLoading) return;

    const inAuth = segments[0] === '(auth)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (inAuth) {
      // Logged-in user landed on an auth screen — send to their dashboard
      if (user.activeRole === 'VENDOR') {
        router.replace('/(vendor)');
      } else {
        router.replace('/(customer)');
      }
    }
  }, [user, isLoading, segments[0]]);

  return null;
}

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
      <AuthRedirect />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
