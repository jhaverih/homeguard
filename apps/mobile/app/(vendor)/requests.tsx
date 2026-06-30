import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { requestsApi } from '../../src/services/api';

function DateTimeField({
  label, value, onChange, accentColor = '#2d4a22',
}: { label: string; value: Date; onChange: (d: Date) => void; accentColor?: string }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={[styles.pickerLabel, { color: accentColor }]}>{label}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{formatted}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker
            value={value}
            mode="date"
            minimumDate={new Date()}
            onChange={(_, d) => {
              setShowDate(false);
              if (d) { setTempDate(d); setShowTime(true); }
            }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate}
            mode="time"
            onChange={(_, d) => {
              setShowTime(false);
              if (d) onChange(d);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.pickerLabel, { color: accentColor }]}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.iosOverlay}>
          <View style={styles.iosPickerCard}>
            <RNDateTimePicker
              value={value}
              mode="datetime"
              minimumDate={new Date()}
              display="inline"
              onChange={(_, d) => { if (d) onChange(d); }}
              style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity
              style={[styles.iosDoneBtn, { backgroundColor: accentColor }]}
              onPress={() => setShowDate(false)}
            >
              <Text style={styles.iosDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function OpenRequestsScreen() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptModal, setAcceptModal] = useState<{ visible: boolean; requestId: string }>({ visible: false, requestId: '' });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [scheduledDate, setScheduledDate] = useState(tomorrow);

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
    try {
      await requestsApi.accept(acceptModal.requestId, scheduledDate.toISOString());
      setAcceptModal({ visible: false, requestId: '' });
      Alert.alert('Job Accepted!', 'The customer has been notified of your scheduled date.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));
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
            <Text style={styles.cardDate}>Preferred: {new Date(req.preferredDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
            <Text style={styles.cardAddress}>{req.address}, {req.city}, {req.state} {req.zipCode}</Text>
            {req.customerNotes && <Text style={styles.cardNotes}>Notes: {req.customerNotes}</Text>}
            <Text style={styles.cardPosted}>Posted: {new Date(req.createdAt).toLocaleDateString()}</Text>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
                setScheduledDate(d);
                setAcceptModal({ visible: true, requestId: req.id });
              }}
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
            <DateTimeField
              label="Inspection Date & Time"
              value={scheduledDate}
              onChange={setScheduledDate}
              accentColor="#2d4a22"
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
  modalSubtitle: { color: '#666', marginBottom: 8 },
  confirmBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
  fieldWrap: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  dateBtn: {
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dateBtnText: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  iosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  iosPickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosDoneBtn: { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  iosDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
