import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Linking, Alert, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { requestsApi, paymentsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const STRIPE_SKIP_KEY = 'vendorStripeSkipped';

function StripeSetupBanner({ onDismiss }: { onDismiss: () => void }) {
  const [loading, setLoading] = useState(false);

  const openStripe = async () => {
    setLoading(true);
    try {
      const res: any = await paymentsApi.getOnboardingLink();
      await Linking.openURL(res.url);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || e?.message || 'Could not get Stripe link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stripeBanner}>
      <View style={styles.stripeBannerHeader}>
        <View style={styles.cardChip}>
          <Text style={styles.cardChipText}>$</Text>
        </View>
        <Text style={styles.stripeBannerTitle}>Set Up Payouts to Get Paid</Text>
      </View>
      <Text style={styles.stripeBannerBody}>
        Connect your Stripe account so Attenteve can pay you when jobs are completed.
      </Text>
      <TouchableOpacity style={styles.stripeBtn} onPress={openStripe} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.stripeBtnText}>Connect Stripe Account</Text>
        }
      </TouchableOpacity>
      <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
        <Text style={styles.dismissText}>Remind me later</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStripeBanner, setShowStripeBanner] = useState(false);
  const appState = useRef(AppState.currentState);

  const load = useCallback(async () => {
    try {
      const [jobs, skipVal] = await Promise.all([
        requestsApi.getVendorJobs().catch(() => []),
        AsyncStorage.getItem(STRIPE_SKIP_KEY).catch(() => null),
      ]);
      setMyJobs((jobs as any[]) || []);

      if (skipVal !== 'true') {
        const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
        const status: any = await Promise.race([
          paymentsApi.getVendorStripeStatus().catch(() => null),
          deadline,
        ]);
        if (status && !status.onboardingComplete) {
          setShowStripeBanner(true);
        } else if (status?.onboardingComplete) {
          setShowStripeBanner(false);
          AsyncStorage.removeItem(STRIPE_SKIP_KEY).catch(() => {});
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-check Stripe when user returns from the Stripe browser tab
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        load();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [load]);

  const handleDismiss = () => {
    AsyncStorage.setItem(STRIPE_SKIP_KEY, 'true').catch(() => {});
    setShowStripeBanner(false);
  };

  const activeJob = myJobs.find((j) => ['ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'].includes(j.status));
  const upcomingJobs = myJobs.filter((j) => j.status === 'ACCEPTED').slice(0, 3);
  const completedCount = myJobs.filter((j) => j.status === 'COMPLETED').length;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {showStripeBanner && <StripeSetupBanner onDismiss={handleDismiss} />}

      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.firstName}!</Text>
        <Text style={styles.subtitle}>Ready to serve homeowners today.</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{myJobs.filter((j) => j.status === 'ACCEPTED').length}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{activeJob ? '1' : '0'}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      {activeJob && (
        <TouchableOpacity
          style={styles.activeJobCard}
          onPress={() => router.push(`/(vendor)/active-job?id=${activeJob.id}`)}
        >
          <View style={styles.activeJobHeader}>
            <Text style={styles.activeJobTitle}>Active Job</Text>
            <View style={styles.activeDot} />
          </View>
          <Text style={styles.activeJobAddress}>{activeJob.address}, {activeJob.city}</Text>
          <Text style={styles.activeJobStatus}>{activeJob.status.replace('_', ' ')}</Text>
          <Text style={styles.activeJobCta}>Tap to manage →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(vendor)/requests')}>
          <Text style={styles.actionIcon}>📋</Text>
          <Text style={styles.actionText}>Open Requests</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(vendor)/my-jobs')}>
          <Text style={styles.actionIcon}>💼</Text>
          <Text style={styles.actionText}>My Jobs</Text>
        </TouchableOpacity>
      </View>

      {upcomingJobs.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
          {upcomingJobs.map((job: any) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/(vendor)/active-job?id=${job.id}`)}
            >
              <Text style={styles.jobDate}>{new Date(job.scheduledDate).toLocaleDateString()}</Text>
              <Text style={styles.jobAddress}>{job.address}, {job.city}</Text>
              <Text style={styles.jobCustomer}>Customer request</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  // Stripe banner
  stripeBanner: { backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, borderLeftWidth: 4, borderLeftColor: '#635bff' },
  stripeBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardChip: { width: 36, height: 24, backgroundColor: '#635bff', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cardChipText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  stripeBannerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1 },
  stripeBannerBody: { fontSize: 13, color: colors.steel, lineHeight: 20, marginBottom: 16 },
  stripeBtn: { backgroundColor: '#635bff', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  stripeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dismissBtn: { alignItems: 'center', paddingVertical: 6 },
  dismissText: { fontSize: 13, color: colors.steel },
  // Dashboard
  header: { backgroundColor: colors.ink, padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.mist },
  subtitle: { fontSize: 14, color: colors.mistDim, marginTop: 4 },
  statsRow: { flexDirection: 'row', padding: 16, gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  statNum: { fontSize: 28, fontWeight: '800', color: colors.lanternDeep },
  statLabel: { fontSize: 12, color: colors.steel, marginTop: 2 },
  activeJobCard: { margin: 16, marginTop: 0, backgroundColor: colors.ink, borderRadius: 16, padding: 20 },
  activeJobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  activeJobTitle: { fontSize: 16, fontWeight: '700', color: colors.mist },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#68d391' },
  activeJobAddress: { fontSize: 16, color: colors.mistDim, marginBottom: 4 },
  activeJobStatus: { fontSize: 13, color: colors.mistDim, marginBottom: 8 },
  activeJobCta: { fontSize: 13, color: '#68d391', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', padding: 16, paddingTop: 0, gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  actionIcon: { fontSize: 28, marginBottom: 8 },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep, margin: 16, marginBottom: 8 },
  jobCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  jobDate: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  jobAddress: { fontSize: 14, color: colors.steel, marginBottom: 2 },
  jobCustomer: { fontSize: 12, color: colors.steel },
});
