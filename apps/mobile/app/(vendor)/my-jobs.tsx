import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { requestsApi } from '../../src/services/api';

const STATUS_COLOR: Record<string, string> = {
  ACCEPTED: '#4299e1',
  VENDOR_EN_ROUTE: '#9f7aea',
  IN_PROGRESS: '#f6ad55',
  COMPLETED: '#68d391',
  CANCELLED: '#fc8181',
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

  useEffect(() => { load(); }, []);
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
        jobs.map((job: any) => (
          <TouchableOpacity
            key={job.id}
            style={styles.card}
            onPress={() => router.push(`/(vendor)/active-job?id=${job.id}`)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardDate}>
                {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : 'TBD'}
              </Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[job.status] + '20' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[job.status] }]}>
                  {job.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.cardAddress}>{job.address}, {job.city}, {job.state}</Text>
            <Text style={styles.cardCta}>Tap to manage →</Text>
          </TouchableOpacity>
        ))
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardDate: { fontSize: 15, fontWeight: '700', color: '#0B4A45' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cardAddress: { fontSize: 14, color: '#555', marginBottom: 8 },
  cardCta: { fontSize: 12, color: '#0B4A45', fontWeight: '600' },
});
