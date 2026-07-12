import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi } from '../../src/services/api';

const STATUS_COLOR: Record<string, string> = {
  PENDING_CUSTOMER_REVIEW: '#b45309',
  ACCEPTED: '#4299e1',
  VENDOR_EN_ROUTE: '#9f7aea',
  IN_PROGRESS: '#f6ad55',
  COMPLETED: '#68d391',
  CANCELLED: '#fc8181',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_CUSTOMER_REVIEW: 'Awaiting Confirmation',
  ACCEPTED: 'Accepted',
  VENDOR_EN_ROUTE: 'En Route',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const TYPE_LABEL: Record<string, string> = {
  SCHEDULED_INSPECTION: 'Inspection',
  ADDITIONAL_SERVICE: 'Service',
};

type FilterKey = 'all' | 'active' | 'accepted' | 'cancelled' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES = ['VENDOR_EN_ROUTE', 'IN_PROGRESS'];

function matchesFilter(job: any, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.includes(job.status);
  if (filter === 'accepted') return job.status === 'ACCEPTED' || job.status === 'PENDING_CUSTOMER_REVIEW';
  if (filter === 'cancelled') return job.status === 'CANCELLED';
  if (filter === 'completed') return job.status === 'COMPLETED';
  return true;
}

export default function MyJobsScreen() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = async () => {
    try {
      const data: any = await requestsApi.getVendorJobs();
      const sorted = (data || []).sort((a: any, b: any) => {
        const aDate = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
        const bDate = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
        return aDate - bDate;
      });
      setJobs(sorted);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  const filtered = jobs.filter((j) => matchesFilter(j, filter));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>My Jobs</Text>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? jobs.length : jobs.filter((j) => matchesFilter(j, f.key)).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {filter === 'all' ? 'You have not accepted any jobs yet.' : `No ${filter} jobs.`}
          </Text>
        </View>
      ) : (
        filtered.map((job: any) => {
          const customerName = job.customer?.customerProfile?.fullName
            || job.customer?.name
            || 'Customer';
          const typeLabel = TYPE_LABEL[job.type] ?? job.type;
          const serviceName = job.type === 'ADDITIONAL_SERVICE'
            ? (job.additionalServices?.[0]?.name || 'Service Request')
            : 'Home Inspection';
          return (
            <TouchableOpacity
              key={job.id}
              style={styles.card}
              onPress={() => router.push(`/(vendor)/active-job?id=${job.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.badgeRow}>
                  <View style={[styles.typeBadge, job.type === 'ADDITIONAL_SERVICE' ? styles.typeBadgeService : styles.typeBadgeInspection]}>
                    <Text style={[styles.typeBadgeText, job.type === 'ADDITIONAL_SERVICE' ? styles.typeBadgeTextService : styles.typeBadgeTextInspection]}>
                      {typeLabel}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[job.status] || '#888') + '20' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[job.status] || '#888' }]}>
                      {STATUS_LABEL[job.status] || job.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                {job.ticketNumber && (
                  <Text style={styles.ticketNumber}>{job.ticketNumber}</Text>
                )}
              </View>
              <Text style={styles.serviceNameLabel}>{serviceName}</Text>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.cardDate}>
                {job.scheduledDate
                  ? new Date(job.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Date TBD'}
              </Text>
              <Text style={styles.cardAddress}>{job.address}, {job.city}, {job.state}</Text>
              {(job.status === 'IN_PROGRESS' || job.status === 'VENDOR_EN_ROUTE') ? (
                <View style={styles.resumeChip}>
                  <Ionicons name="play-circle" size={14} color="#fff" />
                  <Text style={styles.resumeChipText}>Resume Job</Text>
                </View>
              ) : (
                <Text style={styles.cardCta}>Tap to manage →</Text>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0B4A45', margin: 16, marginBottom: 8 },
  filterRow: { marginBottom: 12 },
  filterChip: { backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#0B4A45', borderColor: '#0B4A45' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#888', textAlign: 'center' },
  card: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  typeBadgeInspection: { backgroundColor: '#EBF1EF' },
  typeBadgeService: { backgroundColor: '#f0effe' },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  typeBadgeTextInspection: { color: '#0B4A45' },
  typeBadgeTextService: { color: '#635bff' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  ticketNumber: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' },
  serviceNameLabel: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 4, marginBottom: 2 },
  customerName: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  cardDate: { fontSize: 14, fontWeight: '600', color: '#0B4A45', marginBottom: 4 },
  cardAddress: { fontSize: 14, color: '#555', marginBottom: 8 },
  cardCta: { fontSize: 12, color: '#0B4A45', fontWeight: '600' },
  resumeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0B4A45', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  resumeChipText: { fontSize: 12, color: '#fff', fontWeight: '700' },
});
