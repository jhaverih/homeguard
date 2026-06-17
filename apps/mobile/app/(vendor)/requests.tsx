import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, TextInput, Modal,
} from 'react-native';
import { requestsApi } from '../../src/services/api';

export default function OpenRequestsScreen() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptModal, setAcceptModal] = useState<{ visible: boolean; requestId: string }>({ visible: false, requestId: '' });
  const [scheduledDate, setScheduledDate] = useState('');

  const load = async () => {
    try {
      const data: any = await requestsApi.getPending();
      setRequests(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const acceptJob = async () => {
    if (!scheduledDate) { Alert.alert('Required', 'Please enter the scheduled date'); return; }
    try {
      await requestsApi.accept(acceptModal.requestId, new Date(scheduledDate).toISOString());
      setAcceptModal({ visible: false, requestId: '' });
      Alert.alert('Job Accepted!', 'The customer has been notified of your scheduled date.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => { load(); }, []);
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#2d4a22" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>Open Requests ({requests.length})</Text>
      <Text style={styles.subtitle}>Accept a request to get started. First to accept wins the job.</Text>

      {requests.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No open requests right now. Check back soon!</Text></View>
      ) : (
        requests.map((req: any) => (
          <View key={req.id} style={styles.card}>
            <Text style={styles.cardDate}>Preferred: {new Date(req.preferredDate).toLocaleDateString()}</Text>
            <Text style={styles.cardAddress}>{req.address}, {req.city}, {req.state} {req.zipCode}</Text>
            {req.customerNotes && <Text style={styles.cardNotes}>Notes: {req.customerNotes}</Text>}
            <Text style={styles.cardPosted}>Posted: {new Date(req.createdAt).toLocaleDateString()}</Text>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => { setAcceptModal({ visible: true, requestId: req.id }); setScheduledDate(''); }}
            >
              <Text style={styles.acceptBtnText}>Accept This Job</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={acceptModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Set Scheduled Date</Text>
            <Text style={styles.modalSubtitle}>When will you perform this inspection?</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DDTHH:MM (e.g. 2025-03-15T10:00)"
              value={scheduledDate}
              onChangeText={setScheduledDate}
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={acceptJob}>
              <Text style={styles.confirmText}>Confirm & Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAcceptModal({ visible: false, requestId: '' })} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#2d4a22', margin: 16, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginHorizontal: 16, marginBottom: 16 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#888', textAlign: 'center' },
  card: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, marginBottom: 12 },
  cardDate: { fontSize: 14, fontWeight: '700', color: '#2d4a22', marginBottom: 4 },
  cardAddress: { fontSize: 15, color: '#333', marginBottom: 4 },
  cardNotes: { fontSize: 13, color: '#666', marginBottom: 4, fontStyle: 'italic' },
  cardPosted: { fontSize: 12, color: '#aaa', marginBottom: 12 },
  acceptBtn: { backgroundColor: '#2d4a22', borderRadius: 10, padding: 14, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2d4a22', marginBottom: 8 },
  modalSubtitle: { color: '#666', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16 },
  confirmBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
});
