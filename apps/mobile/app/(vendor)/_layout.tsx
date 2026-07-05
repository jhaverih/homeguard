import { useState, useEffect, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  TouchableOpacity, Text, StyleSheet, View, AppState,
  ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi, paymentsApi } from '../../src/services/api';

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

function StripeSetupGate({ onRefresh }: { onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const openStripe = async () => {
    setLoading(true);
    try {
      const res: any = await paymentsApi.getOnboardingLink();
      await Linking.openURL(res.url);
    } catch {
      // error handled silently — button stays available
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.gate}>
      <View style={styles.gateCard}>
        <View style={styles.gateIcon}>
          <Ionicons name="card-outline" size={40} color="#635bff" />
        </View>
        <Text style={styles.gateTitle}>Set Up Payouts to Get Started</Text>
        <Text style={styles.gateBody}>
          Connect your Stripe account so HomeGuard can pay you when jobs are completed.
          This only takes a few minutes and is required before you can accept service requests.
        </Text>

        <TouchableOpacity style={styles.stripeBtn} onPress={openStripe} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="card" size={18} color="#fff" />
                <Text style={styles.stripeBtnText}>Connect Stripe Account</Text>
              </>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={16} color="#635bff" />
          <Text style={styles.refreshText}>I've completed setup — check again</Text>
        </TouchableOpacity>

        <Text style={styles.gateHint}>
          Already set up? Tap "check again" after finishing in your browser.
        </Text>
      </View>
    </View>
  );
}

export default function VendorLayout() {
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; onboardingComplete: boolean } | null>(null);
  const [checking, setChecking] = useState(true);

  const checkStripe = useCallback(async () => {
    try {
      const status = await paymentsApi.getVendorStripeStatus();
      setStripeStatus(status);
    } catch {
      setStripeStatus({ connected: false, onboardingComplete: false });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStripe();
    // Re-check when app comes back to foreground (user returns from Stripe browser)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkStripe();
    });
    return () => sub.remove();
  }, [checkStripe]);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2d4a22" />
      </View>
    );
  }

  if (stripeStatus && !stripeStatus.onboardingComplete) {
    return (
      <>
        <Tabs
          screenOptions={{
            headerRight: () => <RoleSwitcher />,
            headerStyle: { backgroundColor: '#2d4a22' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            tabBarActiveTintColor: '#2d4a22',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: 4, height: 58 },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Ionicons name="grid" size={22} color={color} /> }} />
          <Tabs.Screen name="requests" options={{ title: 'Open Jobs', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
          <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }} />
          <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
          <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} /> }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }} />
          <Tabs.Screen name="active-job" options={{ href: null }} />
          <Tabs.Screen name="notifications" options={{ href: null }} />
        </Tabs>
        {/* Full-screen gate overlay */}
        <StripeSetupGate onRefresh={() => { setChecking(true); checkStripe(); }} />
      </>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <RoleSwitcher />,
        headerStyle: { backgroundColor: '#2d4a22' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#2d4a22',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Ionicons name="grid" size={22} color={color} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Open Jobs', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }} />
      <Tabs.Screen name="active-job" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: '#1e3a5f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  // Gate overlay
  gate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 24,
  },
  gateCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  gateIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0effe', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  gateTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', textAlign: 'center', marginBottom: 12 },
  gateBody: { fontSize: 14, color: '#64748b', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  stripeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#635bff', borderRadius: 14, padding: 16, marginBottom: 12 },
  stripeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  refreshText: { color: '#635bff', fontSize: 14, fontWeight: '600' },
  gateHint: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
