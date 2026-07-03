import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router } from 'expo-router';
import { requestsApi, inspectionsApi } from '../../src/services/api';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
  IN_PROGRESS: { label: 'Mark Job Complete', next: 'COMPLETED', color: '#68d391' },
};

function DateTimeField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <RNDateTimePicker
              value={value}
              mode="datetime"
              minimumDate={new Date()}
              display="inline"
              onChange={(_, d) => { if (d) onChange(d); }}
              style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function ActiveJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [addServiceName, setAddServiceName] = useState('');
  const [addServiceDesc, setAddServiceDesc] = useState('');
  const [addServicePrice, setAddServicePrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date());

  const load = async () => {
    const data: any = await requestsApi.getOne(id);
    setJob(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const advanceStatus = async () => {
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    await requestsApi.updateStatus(id, next.next);
    load();
  };

  const saveNotes = async () => {
    if (!noteTitle || !notes) { Alert.alert('Required', 'Please enter a title and notes'); return; }
    await inspectionsApi.addNote(id, { title: noteTitle, content: notes });
    setNoteTitle('');
    setNotes('');
    Alert.alert('Notes Saved', 'Inspection notes have been saved and are visible to the customer.');
  };

  const recommendService = async () => {
    if (!addServiceName || !addServicePrice) { Alert.alert('Required', 'Please fill in service name and price'); return; }
    await requestsApi.recommendService(id, {
      name: addServiceName,
      description: addServiceDesc,
      price: parseFloat(addServicePrice),
    });
    setAddServiceName('');
    setAddServiceDesc('');
    setAddServicePrice('');
    Alert.alert('Sent!', 'The customer has been notified and can approve the additional service.');
  };

  const openReschedule = () => {
    setNewDate(job.scheduledDate ? new Date(job.scheduledDate) : new Date());
    setRescheduleModal(true);
  };

  const submitReschedule = async () => {
    try {
      await requestsApi.reschedule(id, newDate.toISOString());
      setRescheduleModal(false);
      Alert.alert('Rescheduled', 'The customer has been notified of the new date.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading || !job) return <ActivityIndicator style={{ flex: 1 }} color="#2d4a22" size="large" />;

  const nextAction = NEXT_STATUS[job.status];
  const canReschedule = !['COMPLETED', 'CANCELLED'].includes(job.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.customerBox}>
        <Text style={styles.customerLabel}>Customer</Text>
        {job.customer && (
          <Text style={styles.customerName}>{job.customer.firstName} {job.customer.lastName}</Text>
        )}
        <Text style={styles.customerAddress}>{job.address}</Text>
        <Text style={styles.customerCity}>{job.city}, {job.state} {job.zipCode}</Text>
        {job.customerNotes && <Text style={styles.customerNotes}>Note: {job.customerNotes}</Text>}
      </View>

      {job.scheduledDate && (
        <View style={styles.scheduledRow}>
          <Text style={styles.scheduledLabel}>Scheduled:</Text>
          <Text style={styles.scheduledDate}>
            {new Date(job.scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
          </Text>
        </View>
      )}

      {nextAction && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: nextAction.color }]}
          onPress={advanceStatus}
        >
          <Text style={styles.actionBtnText}>{nextAction.label}</Text>
        </TouchableOpacity>
      )}

      {job.status === 'COMPLETED' && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>✓ Job Completed</Text>
        </View>
      )}

      {['IN_PROGRESS', 'COMPLETED'].includes(job.status) && (
        <>
          <Text style={styles.sectionTitle}>Add Inspection Notes</Text>
          <Text style={styles.sectionHint}>These notes will be visible to the customer.</Text>
          <TextInput style={styles.input} placeholder="Note title (e.g. AC Filter Status)" value={noteTitle} onChangeText={setNoteTitle} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Describe what you found and what was done..." value={notes} onChangeText={setNotes} multiline />
          <TouchableOpacity style={styles.saveBtn} onPress={saveNotes}>
            <Text style={styles.saveBtnText}>Save Notes</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Recommend Additional Service</Text>
          <Text style={styles.sectionHint}>The customer will be notified and can approve or decline.</Text>
          <TextInput style={styles.input} placeholder="Service name" value={addServiceName} onChangeText={setAddServiceName} />
          <TextInput style={styles.input} placeholder="Description" value={addServiceDesc} onChangeText={setAddServiceDesc} />
          <TextInput style={styles.input} placeholder="Price ($)" value={addServicePrice} onChangeText={setAddServicePrice} keyboardType="decimal-pad" />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#805ad5' }]} onPress={recommendService}>
            <Text style={styles.saveBtnText}>Send Recommendation</Text>
          </TouchableOpacity>
        </>
      )}

      {canReschedule && (
        <TouchableOpacity style={styles.rescheduleBtn} onPress={openReschedule}>
          <Text style={styles.rescheduleBtnText}>Reschedule Inspection</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.chatBtn}
        onPress={() => router.push(`/chat/${id}?recipientId=${job.customerId}&recipientName=${job.customer ? job.customer.firstName : 'Customer'}`)}
      >
        <Text style={styles.chatBtnText}>💬 Message Customer</Text>
      </TouchableOpacity>

      <Modal visible={rescheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reschedule Inspection</Text>
            <Text style={styles.modalSubtitle}>The customer will be notified automatically.</Text>
            <DateTimeField value={newDate} onChange={setNewDate} />
            <TouchableOpacity style={styles.confirmBtn} onPress={submitReschedule}>
              <Text style={styles.confirmText}>Confirm New Date</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRescheduleModal(false)} style={styles.cancelBtn}>
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
  content: { padding: 16 },
  customerBox: { backgroundColor: '#2d4a22', borderRadius: 16, padding: 20, marginBottom: 12 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  customerName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  customerAddress: { fontSize: 14, color: '#c8e6c0', marginBottom: 2 },
  customerCity: { fontSize: 14, color: '#c8e6c0', marginBottom: 8 },
  customerNotes: { fontSize: 13, color: '#a8d5a2', fontStyle: 'italic' },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  scheduledLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  scheduledDate: { fontSize: 13, fontWeight: '700', color: '#2d4a22', flex: 1 },
  actionBtn: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  completedBadge: { backgroundColor: '#c6f6d5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  completedText: { color: '#2d7d46', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', marginBottom: 4, marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10 },
  textArea: { height: 100, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rescheduleBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#2d4a22' },
  rescheduleBtnText: { color: '#2d4a22', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 32 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2d4a22', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: {
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  dateBtnText: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: '#2d4a22', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
});
