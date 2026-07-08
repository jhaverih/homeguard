import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useAuthStore } from '../src/store/auth.store';
import { useAlertsStore } from '../src/store/alerts.store';
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from '../src/services/notifications';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PK || '';

function AuthRedirect() {
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuth = segments[0] === '(auth)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/welcome');
    } else if (inAuth) {
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
  const { increment, setUnreadCount } = useAlertsStore();
  const router = useRouter();

  // Register push token when user logs in
  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync().catch(() => {});
    } else {
      setUnreadCount(0);
    }
  }, [user?.id]);

  // Set up notification listeners when authenticated
  useEffect(() => {
    if (!user) return;

    const cleanup = setupNotificationListeners(
      () => increment(),
      (screen) => {
        if (screen === 'alerts') {
          router.push('/(customer)/alerts');
        }
      },
    );

    return cleanup;
  }, [user?.id]);

  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.homeguard">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <AuthRedirect />
        <Stack screenOptions={{ headerShown: false }} />
      </GestureHandlerRootView>
    </StripeProvider>
  );
}
