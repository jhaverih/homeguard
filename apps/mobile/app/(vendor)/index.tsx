import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { requestsApi } from '../../src/services/api';

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const jobs: any = await requestsApi.getVendorJobs();
      setMyJobs(jobs || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeJob = myJobs.find((j) => ['ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'].includes(j.status));
  const upcomingJobs = myJobs.filter((j) => j.status === 'ACCEPTED').slice(0, 3);
  const completedCount = myJobs.filter((j) => j.status === 'COMPLETED').length;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#2d4a22" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#2d4a22', padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#a8d5a2', marginTop: 4 },
  statsRow: { flexDirection: 'row', padding: 16, gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  statNum: { fontSize: 28, fontWeight: '800', color: '#2d4a22' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  activeJobCard: { margin: 16, marginTop: 0, backgroundColor: '#2d4a22', borderRadius: 16, padding: 20 },
  activeJobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  activeJobTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#68d391' },
  activeJobAddress: { fontSize: 16, color: '#e2f0d9', marginBottom: 4 },
  activeJobStatus: { fontSize: 13, color: '#a8d5a2', marginBottom: 8 },
  activeJobCta: { fontSize: 13, color: '#68d391', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', padding: 16, paddingTop: 0, gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  actionIcon: { fontSize: 28, marginBottom: 8 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#2d4a22' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#2d4a22', margin: 16, marginBottom: 8 },
  jobCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  jobDate: { fontSize: 14, fontWeight: '700', color: '#2d4a22', marginBottom: 4 },
  jobAddress: { fontSize: 14, color: '#555', marginBottom: 2 },
  jobCustomer: { fontSize: 12, color: '#888' },
});
