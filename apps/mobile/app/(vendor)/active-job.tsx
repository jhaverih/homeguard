import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { requestsApi, inspectionsApi, pricingApi } from '../../src/services/api';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
  IN_PROGRESS: { label: 'Mark Job Complete', next: 'COMPLETED', color: '#68d391' },
};

export default function ActiveJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [addServiceName, setAddServiceName] = useState('');
  const [addServiceDesc, setAddServiceDesc] = useState('');
  const [addServicePrice, setAddServicePrice] = useState('');
  const [loading, setLoading] = useState(true);

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

  if (loading || !job) return <ActivityIndicator style={{ flex: 1 }} color="#2d4a22" size="large" />;

  const nextAction = NEXT_STATUS[job.status];

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

      <TouchableOpacity
        style={styles.chatBtn}
        onPress={() => router.push(`/chat/${id}?recipientId=${job.customerId}&recipientName=Customer`)}
      >
        <Text style={styles.chatBtnText}>💬 Message Customer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 16 },
  customerBox: { backgroundColor: '#2d4a22', borderRadius: 16, padding: 20, marginBottom: 16 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  customerName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  customerAddress: { fontSize: 14, color: '#c8e6c0', marginBottom: 2 },
  customerCity: { fontSize: 14, color: '#c8e6c0', marginBottom: 8 },
  customerNotes: { fontSize: 13, color: '#a8d5a2', fontStyle: 'italic' },
  actionBtn: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 16 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  completedBadge: { backgroundColor: '#c6f6d5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  completedText: { color: '#2d7d46', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', marginBottom: 4, marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10 },
  textArea: { height: 100, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 32 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
