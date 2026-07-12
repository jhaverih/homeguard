import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi } from '../../src/services/api';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#f6ad55',
  PENDING_CUSTOMER_REVIEW: '#b45309',
  ACCEPTED: '#4299e1',
  VENDOR_EN_ROUTE: '#9f7aea',
  IN_PROGRESS: '#f6ad55',
  COMPLETED: '#68d391',
  CANCELLED: '#fc8181',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Waiting for vendor',
  PENDING_CUSTOMER_REVIEW: 'Awaiting confirmation',
  ACCEPTED: 'Scheduled',
  VENDOR_EN_ROUTE: 'Vendor on the way',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES = ['PENDING', 'PENDING_CUSTOMER_REVIEW', 'ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'];

function matchesFilter(req: any, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.includes(req.status);
  if (filter === 'completed') return req.status === 'COMPLETED';
  if (filter === 'cancelled') return req.status === 'CANCELLED';
  return true;
}

export default function MyServicesScreen() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = async () => {
    try {
      const data: any = await requestsApi.getMyRequests();
      setRequests(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  const filtered = requests.filter((r) => matchesFilter(r, filter));
  const activeCount = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.topRow}>
        <Text style={styles.pageTitle}>My Services</Text>
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/(customer)/request')}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? requests.length : requests.filter((r) => matchesFilter(r, f.key)).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          {filter === 'all' ? (
            <>
              <Ionicons name="home-outline" size={48} color="#cbd5e0" />
              <Text style={styles.emptyTitle}>No services yet</Text>
              <Text style={styles.emptyText}>Book an inspection or service to get started.</Text>
              <TouchableOpacity style={styles.emptyBookBtn} onPress={() => router.push('/(customer)/request')}>
                <Text style={styles.emptyBookBtnText}>Book a Service</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.emptyText}>No {filter} requests.</Text>
          )}
        </View>
      ) : (
        filtered.map((req: any) => {
          const color = STATUS_COLOR[req.status] || '#888';
          const isEnRoute = req.status === 'VENDOR_EN_ROUTE';
          const isActive = ACTIVE_STATUSES.includes(req.status);
          const typeLabel = req.type === 'ADDITIONAL_SERVICE' ? 'Service' : 'Inspection';
          const serviceName = req.type === 'ADDITIONAL_SERVICE'
            ? (req.additionalServices?.[0]?.name || 'Service Request')
            : null;
          return (
            <TouchableOpacity
              key={req.id}
              style={styles.card}
              onPress={() => router.push(`/(customer)/request-detail?id=${req.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.typeBadge, req.type === 'ADDITIONAL_SERVICE' ? styles.typeBadgeService : styles.typeBadgeInspection]}>
                  <Text style={[styles.typeBadgeText, req.type === 'ADDITIONAL_SERVICE' ? styles.typeBadgeTextService : styles.typeBadgeTextInspection]}>
                    {typeLabel}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
                  <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[req.status] || req.status}</Text>
                </View>
              </View>

              {serviceName && <Text style={styles.cardServiceName}>{serviceName}</Text>}
              <Text style={styles.cardDate}>
                {req.scheduledDate
                  ? new Date(req.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : `Preferred: ${new Date(req.preferredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </Text>
              <Text style={styles.cardAddress}>{req.address}, {req.city}</Text>

              {req.ticketNumber && <Text style={styles.ticketNumber}>{req.ticketNumber}</Text>}

              {isEnRoute && (
                <View style={styles.enRouteBadge}>
                  <Ionicons name="navigate" size={13} color="#7c3aed" />
                  <Text style={styles.enRouteText}>Vendor is on the way</Text>
                </View>
              )}

              {isActive && !isEnRoute && (
                <Text style={styles.cardCta}>Tap to view details →</Text>
              )}
            </TouchableOpacity>
          );
        })
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0B4A45' },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0B4A45', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  filterRow: { marginBottom: 8 },
  filterChip: { backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#0B4A45', borderColor: '#0B4A45' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },
  emptyBox: { padding: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 8 },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22 },
  emptyBookBtn: { marginTop: 16, backgroundColor: '#0B4A45', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBookBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  typeBadgeInspection: { backgroundColor: '#EBF1EF' },
  typeBadgeService: { backgroundColor: '#f0effe' },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  typeBadgeTextInspection: { color: '#0B4A45' },
  typeBadgeTextService: { color: '#635bff' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardServiceName: { fontSize: 15, fontWeight: '700', color: '#0B4A45', marginBottom: 3 },
  cardDate: { fontSize: 14, fontWeight: '700', color: '#0B4A45', marginBottom: 2 },
  cardAddress: { fontSize: 14, color: '#555', marginBottom: 6 },
  ticketNumber: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 4 },
  enRouteBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f5f3ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  enRouteText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  cardCta: { fontSize: 12, color: '#0B4A45', fontWeight: '600' },
});
