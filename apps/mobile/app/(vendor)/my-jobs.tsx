import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { requestsApi } from '../../src/services/api';

const STATUS_COLOR: Record<string, string> = {
  ACCEPTED: '#4299e1',
  VENDOR_EN_ROUTE: '#9f7aea',
  IN_PROGRESS: '#f6ad55',
  COMPLETED: '#68d391',
  CANCELLED: '#fc8181',
};

const TYPE_LABEL: Record<string, string> = {
  SCHEDULED_INSPECTION: 'Inspection',
  ADDITIONAL_SERVICE: 'Service',
};

export default function MyJobsScreen() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data: any = await requestsApi.getVendorJobs();
      setJobs(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>My Jobs</Text>
      {jobs.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>You have not accepted any jobs yet.</Text></View>
      ) : (
        jobs.map((job: any) => {
          const customerName = job.customer?.customerProfile?.fullName
            || job.customer?.name
            || 'Customer';
          const typeLabel = TYPE_LABEL[job.type] ?? job.type;
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
                      {job.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                {job.ticketNumber && (
                  <Text style={styles.ticketNumber}>{job.ticketNumber}</Text>
                )}
              </View>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.cardDate}>
                {job.scheduledDate
                  ? new Date(job.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Date TBD'}
              </Text>
              <Text style={styles.cardAddress}>{job.address}, {job.city}, {job.state}</Text>
              <Text style={styles.cardCta}>Tap to manage →</Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0B4A45', margin: 16 },
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
  customerName: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  cardDate: { fontSize: 14, fontWeight: '600', color: '#0B4A45', marginBottom: 4 },
  cardAddress: { fontSize: 14, color: '#555', marginBottom: 8 },
  cardCta: { fontSize: 12, color: '#0B4A45', fontWeight: '600' },
});
