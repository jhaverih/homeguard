import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { Newsreader_500Medium, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { Karla_400Regular, Karla_700Bold } from '@expo-google-fonts/karla';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../src/store/auth.store';
import { useAlertsStore } from '../src/store/alerts.store';
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from '../src/services/notifications';
import { userApi } from '../src/services/api';
import TermsGateModal from '../src/components/TermsGateModal';
import { colors } from '../src/theme';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PK || '';

// Maps the `screen` key the backend attaches to a push notification's data
// payload to an actual route, since 'my-services'/'my-jobs'/'alerts' etc. only
// make sense for one role. 'alerts' is reserved for real Yolink monitoring
// alerts; anything else lands in the general notification center.
function resolveNotificationRoute(screen: string | undefined, role: string | undefined): string {
  const isVendor = role === 'VENDOR';
  switch (screen) {
    case 'alerts':
      return isVendor ? '/(vendor)/notifications' : '/(customer)/alerts';
    case 'my-services':
      return '/(customer)/my-services';
    case 'my-jobs':
      return '/(vendor)/my-jobs';
    case 'capabilities':
      return isVendor ? '/(vendor)/capabilities' : '/(customer)/notifications';
    case 'notifications':
    default:
      return isVendor ? '/(vendor)/notifications' : '/(customer)/notifications';
  }
}

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

const SEVERITY_COLORS: Record<string, { border: string; icon: string; bg: string }> = {
  CRITICAL: { border: '#dc2626', icon: 'warning',         bg: '#fef2f2' },
  HIGH:     { border: '#ea580c', icon: 'alert-circle',    bg: '#fff7ed' },
  MEDIUM:   { border: '#d97706', icon: 'notifications',   bg: '#fffbeb' },
  LOW:      { border: '#2563eb', icon: 'information-circle', bg: '#eff6ff' },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Karla_400Regular,
    Karla_700Bold,
  });
  const { user, setUser } = useAuthStore();
  const { increment, setUnreadCount } = useAlertsStore();
  const router = useRouter();
  const [alertPopup, setAlertPopup] = useState<{ title: string; body: string; severity: string } | null>(null);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  const isVendorActive = user?.activeRole === 'VENDOR';
  const needsTerms = !!user && (isVendorActive ? !user.vendorTermsAcceptedAt : !user.termsAcceptedAt);

  const handleAcceptTerms = async () => {
    setAcceptingTerms(true);
    try {
      const updated: any = await userApi.acceptTerms(isVendorActive ? 'VENDOR' : 'CUSTOMER');
      setUser(updated);
    } catch {
      Alert.alert('Error', 'Could not save your acceptance. Please try again.');
    } finally {
      setAcceptingTerms(false);
    }
  };

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
      (screen) => router.push(resolveNotificationRoute(screen, user?.activeRole) as any),
      (notification) => {
        const { title, body, data } = notification.request.content;
        setAlertPopup({
          title: title ?? 'Attenteve Alert',
          body: body ?? '',
          severity: (data?.severity as string) ?? 'MEDIUM',
        });
      },
    );

    return cleanup;
  }, [user?.id]);

  const popupCfg = SEVERITY_COLORS[alertPopup?.severity ?? 'MEDIUM'] ?? SEVERITY_COLORS.MEDIUM;

  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.homeguard">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <AuthRedirect />
        <Stack screenOptions={{ headerShown: false }} />

        <TermsGateModal
          visible={needsTerms}
          termsType={isVendorActive ? 'VENDOR' : 'CUSTOMER'}
          onAccept={handleAcceptTerms}
          loading={acceptingTerms}
        />

        {/* In-app alert popup */}
        <Modal
          visible={!!alertPopup}
          transparent
          animationType="slide"
          onRequestClose={() => setAlertPopup(null)}
        >
          <View style={alertStyles.overlay}>
            <View style={[alertStyles.card, { borderTopColor: popupCfg.border, backgroundColor: popupCfg.bg }]}>
              <View style={alertStyles.iconRow}>
                <Ionicons name={popupCfg.icon as any} size={24} color={popupCfg.border} />
                <Text style={[alertStyles.title, { color: popupCfg.border }]}>{alertPopup?.title}</Text>
              </View>
              {!!alertPopup?.body && <Text style={alertStyles.body}>{alertPopup.body}</Text>}
              <View style={alertStyles.btnRow}>
                <TouchableOpacity
                  style={[alertStyles.btn, alertStyles.viewBtn, { borderColor: popupCfg.border }]}
                  onPress={() => {
                    setAlertPopup(null);
                    const dest = user?.activeRole === 'VENDOR' ? '/(vendor)/notifications' : '/(customer)/alerts';
                    router.push(dest as any);
                  }}
                >
                  <Text style={[alertStyles.viewBtnText, { color: popupCfg.border }]}>View Alerts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[alertStyles.btn, alertStyles.dismissBtn]} onPress={() => setAlertPopup(null)}>
                  <Text style={alertStyles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </GestureHandlerRootView>
    </StripeProvider>
  );
}

const alertStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  card: {
    borderTopWidth: 4, borderRadius: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  viewBtn: { backgroundColor: '#fff', borderWidth: 1.5 },
  viewBtnText: { fontWeight: '700', fontSize: 14 },
  dismissBtn: { backgroundColor: colors.border },
  dismissText: { color: colors.steel, fontWeight: '600', fontSize: 14 },
});
