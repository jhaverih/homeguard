import { useEffect, useState } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveIcon, AttenteveLogo } from '../../src/components/AttenteveLogo';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi, onboardingApi, paymentsApi } from '../../src/services/api';
import { isPayoutSetupDeferred } from '../../src/utils/payoutPrompt';
import { colors } from '../../src/theme';

function RoleSwitcher() {
  const { user, setUser } = useAuthStore();
  if (!user?.roles.includes('CUSTOMER')) return null;

  const switchToCustomer = async () => {
    try {
      const updated: any = await userApi.switchRole('CUSTOMER');
      setUser(updated);
      router.replace('/(customer)');
    } catch (e) {}
  };

  return (
    <TouchableOpacity style={styles.switchBtn} onPress={switchToCustomer}>
      <Text style={styles.switchText}>Switch to Homeowner</Text>
    </TouchableOpacity>
  );
}

export default function VendorLayout() {
  // Only an approved company gets the vendor tabs; anyone else (still filling
  // in, under review, sent back, rejected) is sent to their application. If
  // the check itself fails, show the tabs — the API refuses every vendor call
  // for an unapproved company anyway.
  // An approved company without finished Stripe payouts goes to the payout
  // screen first, unless the vendor chose "Browse open jobs first" this session.
  // An expired insurance certificate or trade license locks the tabs until
  // it's renewed (apps/api vendor-access.ts).
  const [gate, setGate] = useState<'checking' | 'approved' | 'onboarding' | 'payouts' | 'credentials'>('checking');
  useEffect(() => {
    (async () => {
      try {
        const s = await onboardingApi.getStatus();
        if (s.applicationStatus !== 'APPROVED') { setGate('onboarding'); return; }
        if (s.credentialsLocked) { setGate('credentials'); return; }
        if (isPayoutSetupDeferred()) { setGate('approved'); return; }
        const stripe = await paymentsApi.getVendorStripeStatus().catch(() => null);
        setGate(stripe && !stripe.onboardingComplete ? 'payouts' : 'approved');
      } catch {
        setGate('approved');
      }
    })();
  }, []);

  if (gate === 'checking') return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  if (gate === 'onboarding') return <Redirect href="/(vendor-onboarding)" />;
  if (gate === 'payouts') return <Redirect href="/(vendor-onboarding)/payouts" />;
  if (gate === 'credentials') return <Redirect href="/(vendor-onboarding)/credentials" />;

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <RoleSwitcher />,
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.mist,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.lanternDeep,
        tabBarInactiveTintColor: colors.steel,
        tabBarStyle: { borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: () => <AttenteveLogo size="sm" onDark />, tabBarIcon: ({ color }) => <AttenteveIcon size="sm" onDark={false} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Open Jobs', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }} />
      <Tabs.Screen name="active-job" options={{ href: null, title: 'Active Job' }} />
      <Tabs.Screen name="bundle-job" options={{ href: null, title: 'Bundle Job' }} />
      <Tabs.Screen name="bundle-close-all" options={{ href: null, title: 'Close Out Bundle' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="capabilities" options={{ href: null, title: 'My Capabilities' }} />
      <Tabs.Screen name="certifications" options={{ href: null, title: 'My Certifications' }} />
      <Tabs.Screen name="company-application" options={{ href: null, title: 'Company Application' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: colors.lanternDeep, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
