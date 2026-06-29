import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { subscriptionsApi, requestsApi } from '../../src/services/api';

export default function CustomerDashboard() {
  const { user } = useAuthStore();
  const [subscription, setSubscription] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const sub: any = await subscriptionsApi.getMySubscription();
      setSubscription(sub);
    } catch (e) {}
    try {
      const reqs: any = await requestsApi.getMyRequests();
      setRequests(reqs || []);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const statusColor: Record<string, string> = {
    PENDING: '#f6ad55',
    ACCEPTED: '#68d391',
    VENDOR_EN_ROUTE: '#4299e1',
    IN_PROGRESS: '#9f7aea',
    COMPLETED: '#2d7d46',
    CANCELLED: '#fc8181',
  };

  const statusLabel: Record<string, string> = {
    PENDING: 'Waiting for vendor',
    ACCEPTED: 'Scheduled',
    VENDOR_EN_ROUTE: 'Vendor on the way',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.firstName}!</Text>
        <Text style={styles.subtitle}>Your home is in good hands.</Text>
      </View>

      {subscription ? (
        <View style={styles.subCard}>
          <View style={styles.subHeader}>
            <Text style={styles.subTitle}>{subscription.plan?.name}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>
          <View style={styles.subStats}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{subscription.plan?.inspectionsPerYear - subscription.inspectionsUsed}</Text>
              <Text style={styles.statLabel}>Inspections Left</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{subscription.inspectionsUsed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{new Date(subscription.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</Text>
              <Text style={styles.statLabel}>Renews</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.requestBtn} onPress={() => router.push('/(customer)/request')}>
            <Text style={styles.requestBtnText}>+ Request Inspection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.noSubCard} onPress={() => router.push('/(customer)/subscribe')}>
          <Text style={styles.noSubTitle}>No Active Subscription</Text>
          <Text style={styles.noSubText}>Tap to choose a plan and protect your home.</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Recent Requests</Text>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No requests yet. Tap "Request Inspection" to get started!</Text>
        </View>
      ) : (
        requests.slice(0, 5).map((req: any) => (
          <TouchableOpacity
            key={req.id}
            style={styles.requestCard}
            onPress={() => router.push(`/(customer)/request-detail?id=${req.id}`)}
          >
            <View style={styles.requestCardHeader}>
              <Text style={styles.requestDate}>
                {req.scheduledDate
                  ? new Date(req.scheduledDate).toLocaleDateString()
                  : `Preferred: ${new Date(req.preferredDate).toLocaleDateString()}`}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor[req.status] + '25' }]}>
                <Text style={[styles.statusText, { color: statusColor[req.status] }]}>
                  {statusLabel[req.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.requestAddress}>{req.address}, {req.city}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#1e3a5f', padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#a8c4e5', marginTop: 4 },
  subCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subTitle: { fontSize: 18, fontWeight: '700', color: '#1e3a5f' },
  activeBadge: { backgroundColor: '#c6f6d5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  activeBadgeText: { color: '#2d7d46', fontSize: 12, fontWeight: '600' },
  subStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#1e3a5f' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  requestBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center' },
  requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  noSubCard: { margin: 16, backgroundColor: '#fff4e5', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: '#f6ad55' },
  noSubTitle: { fontSize: 16, fontWeight: '700', color: '#c05621', marginBottom: 4 },
  noSubText: { color: '#744210', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e3a5f', margin: 16, marginBottom: 8 },
  emptyCard: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22 },
  requestCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  requestCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  requestDate: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: '600' },
  requestAddress: { fontSize: 14, color: '#666' },
});
