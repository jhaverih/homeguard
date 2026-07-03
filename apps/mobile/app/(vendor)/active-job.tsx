import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, pricingApi } from '../../src/services/api';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
  IN_PROGRESS: { label: 'Mark Job Complete', next: 'COMPLETED', color: '#68d391' },
};

const INSPECTION_TASKS = [
  { id: 't1', label: 'AC filter checked / replaced' },
  { id: 't2', label: 'AC drainage pan inspected' },
  { id: 't3', label: 'Smoke detectors tested' },
  { id: 't4', label: 'Carbon monoxide detectors tested' },
  { id: 't5', label: 'Water heater inspected' },
  { id: 't6', label: 'Toilet connections checked for leaks' },
  { id: 't7', label: 'Under-sink plumbing inspected' },
  { id: 't8', label: 'Washer drain pan inspected' },
  { id: 't9', label: 'HVAC system visually inspected' },
  { id: 't10', label: 'Light bulbs checked / replaced' },
  { id: 't11', label: 'Electrical panel checked' },
  { id: 't12', label: 'Exterior doors / windows sealed' },
];

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
            value={value} mode="date" minimumDate={new Date()}
            onChange={(_, d) => { setShowDate(false); if (d) { setTempDate(d); setShowTime(true); } }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate} mode="time"
            onChange={(_, d) => { setShowTime(false); if (d) onChange(d); }}
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
              value={value} mode="datetime" minimumDate={new Date()} display="inline"
              onChange={(_, d) => { if (d) onChange(d); }} style={{ alignSelf: 'center' }}
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
  const [loading, setLoading] = useState(true);

  // Checklist state
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [savingChecklist, setSavingChecklist] = useState(false);

  // Additional notes state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Catalog / recommendation state
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<any>(null);
  const [sendingRec, setSendingRec] = useState(false);

  // Reschedule state
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date());

  const load = useCallback(async () => {
    const data: any = await requestsApi.getOne(id);
    setJob(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    pricingApi.getAll().then((items: any) => setCatalogItems(items || [])).catch(() => {});
  }, [load]);

  const advanceStatus = async () => {
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    try {
      await requestsApi.updateStatus(id, next.next);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const toggleTask = (taskId: string) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const saveChecklist = async () => {
    const done = INSPECTION_TASKS.filter((t) => checkedTasks.has(t.id)).map((t) => `✓ ${t.label}`);
    const missed = INSPECTION_TASKS.filter((t) => !checkedTasks.has(t.id)).map((t) => `- ${t.label}`);
    if (done.length === 0) {
      Alert.alert('No tasks selected', 'Please check at least one completed task.');
      return;
    }
    setSavingChecklist(true);
    try {
      await inspectionsApi.addNote(id, {
        title: 'Inspection Checklist',
        content: [...done, ...(missed.length ? ['\nNot completed:', ...missed] : [])].join('\n'),
      });
      Alert.alert('Saved', 'Inspection checklist saved and visible to the customer.');
      setCheckedTasks(new Set());
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingChecklist(false);
    }
  };

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      Alert.alert('Required', 'Please enter a title and note content.');
      return;
    }
    try {
      await inspectionsApi.addNote(id, { title: noteTitle.trim(), content: noteContent.trim() });
      setNoteTitle('');
      setNoteContent('');
      Alert.alert('Saved', 'Note saved and visible to the customer.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const sendRecommendation = async () => {
    if (!selectedCatalogItem) return;
    setSendingRec(true);
    try {
      await requestsApi.recommendService(id, {
        name: selectedCatalogItem.name,
        description: selectedCatalogItem.description,
        price: selectedCatalogItem.basePrice,
      });
      setSelectedCatalogItem(null);
      Alert.alert('Sent!', 'The customer has been notified and can approve or decline.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSendingRec(false);
    }
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
  const showInProgress = ['IN_PROGRESS', 'COMPLETED'].includes(job.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Customer Header */}
      <View style={styles.customerBox}>
        <Text style={styles.customerLabel}>Customer</Text>
        {job.customer && (
          <Text style={styles.customerName}>{job.customer.firstName} {job.customer.lastName}</Text>
        )}
        <Text style={styles.customerAddress}>{job.address}</Text>
        <Text style={styles.customerCity}>{job.city}, {job.state} {job.zipCode}</Text>
        {job.customerNotes && <Text style={styles.customerNotes}>Note: {job.customerNotes}</Text>}
      </View>

      {/* Scheduled date */}
      {job.scheduledDate && (
        <View style={styles.scheduledRow}>
          <Text style={styles.scheduledLabel}>Scheduled:</Text>
          <Text style={styles.scheduledDate}>
            {new Date(job.scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
          </Text>
        </View>
      )}

      {/* Status action */}
      {nextAction && (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: nextAction.color }]} onPress={advanceStatus}>
          <Text style={styles.actionBtnText}>{nextAction.label}</Text>
        </TouchableOpacity>
      )}
      {job.status === 'COMPLETED' && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>✓ Job Completed</Text>
        </View>
      )}

      {/* Inspection checklist + notes */}
      {showInProgress && (
        <>
          <Text style={styles.sectionTitle}>Inspection Checklist</Text>
          <Text style={styles.sectionHint}>Check off completed tasks — saved as a customer-visible report.</Text>
          <View style={styles.checklistCard}>
            {INSPECTION_TASKS.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.checkRow}
                onPress={() => toggleTask(task.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={checkedTasks.has(task.id) ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checkedTasks.has(task.id) ? '#2d4a22' : '#94a3b8'}
                />
                <Text style={[styles.checkLabel, checkedTasks.has(task.id) && styles.checkLabelDone]}>
                  {task.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, checkedTasks.size === 0 && styles.saveBtnDisabled]}
            onPress={saveChecklist}
            disabled={savingChecklist || checkedTasks.size === 0}
          >
            {savingChecklist
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Checklist ({checkedTasks.size} items)</Text>
            }
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <Text style={styles.sectionHint}>Add specific findings or details beyond the checklist.</Text>
          <TextInput
            style={styles.input}
            placeholder="Note title (e.g. AC Drainage Blockage Found)"
            value={noteTitle}
            onChangeText={setNoteTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe what you found..."
            value={noteContent}
            onChangeText={setNoteContent}
            multiline
          />
          <TouchableOpacity style={styles.saveBtn} onPress={saveNote}>
            <Text style={styles.saveBtnText}>Save Note</Text>
          </TouchableOpacity>

          {/* Catalog-based service recommendation */}
          <Text style={styles.sectionTitle}>Recommend Additional Service</Text>
          <Text style={styles.sectionHint}>Select from the HomeGuard service catalog. The customer sees our standard price.</Text>
          {catalogItems.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.catalogCard, selectedCatalogItem?.id === item.id && styles.catalogCardSelected]}
              onPress={() => setSelectedCatalogItem(selectedCatalogItem?.id === item.id ? null : item)}
            >
              <View style={styles.catalogHeader}>
                <Text style={styles.catalogName}>{item.name}</Text>
                <Text style={styles.catalogPrice}>${parseFloat(item.basePrice).toFixed(2)}</Text>
              </View>
              <Text style={styles.catalogDesc}>{item.description}</Text>
              {selectedCatalogItem?.id === item.id && (
                <Ionicons name="checkmark-circle" size={18} color="#2d4a22" style={{ marginTop: 6 }} />
              )}
            </TouchableOpacity>
          ))}
          {selectedCatalogItem && (
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#805ad5' }]}
              onPress={sendRecommendation}
              disabled={sendingRec}
            >
              {sendingRec
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Send Recommendation: {selectedCatalogItem.name}</Text>
              }
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Reschedule */}
      {canReschedule && (
        <TouchableOpacity style={styles.rescheduleBtn} onPress={openReschedule}>
          <Text style={styles.rescheduleBtnText}>Reschedule Inspection</Text>
        </TouchableOpacity>
      )}

      {/* Chat */}
      <TouchableOpacity
        style={styles.chatBtn}
        onPress={() => router.push(`/chat/${id}?recipientId=${job.customerId}&recipientName=${job.customer ? job.customer.firstName : 'Customer'}`)}
      >
        <Text style={styles.chatBtnText}>💬 Message Customer</Text>
      </TouchableOpacity>

      {/* Reschedule modal */}
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', marginBottom: 4, marginTop: 16 },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12 },
  checklistCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  checkLabel: { fontSize: 14, color: '#374151', flex: 1 },
  checkLabelDone: { color: '#2d4a22', fontWeight: '600' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10 },
  textArea: { height: 90, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnDisabled: { backgroundColor: '#94a3b8' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  catalogCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  catalogCardSelected: { borderColor: '#2d4a22', backgroundColor: '#f0fdf4' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  catalogName: { fontSize: 14, fontWeight: '700', color: '#1e3a5f', flex: 1, marginRight: 8 },
  catalogPrice: { fontSize: 14, fontWeight: '700', color: '#2d7d46' },
  catalogDesc: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  rescheduleBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 10, borderWidth: 1.5, borderColor: '#2d4a22' },
  rescheduleBtnText: { color: '#2d4a22', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 32 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2d4a22', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateBtnText: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: '#2d4a22', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: '#2d4a22', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
});
