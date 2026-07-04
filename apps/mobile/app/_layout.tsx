import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useAuthStore } from '../src/store/auth.store';
import { registerForPushNotificationsAsync } from '../src/services/notifications';

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

  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync().catch(() => {});
    }
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
