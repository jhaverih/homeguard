import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Platform, Image, FlatList, KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, pricingApi, uploadsApi } from '../../src/services/api';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
};

// catalogLinks: service_prices names linked to each task (vendor picks one on Issue)
const INSPECTION_TASKS: { id: string; label: string; catalogLinks: string[] }[] = [
  { id: 't1',  label: 'AC filter checked / replaced',       catalogLinks: ['AC Filter Replacement'] },
  { id: 't2',  label: 'AC drainage pan inspected',          catalogLinks: ['AC Drainage Pan Inspection'] },
  { id: 't3',  label: 'Smoke detectors tested',             catalogLinks: [] },
  { id: 't4',  label: 'Carbon monoxide detectors tested',   catalogLinks: [] },
  { id: 't5',  label: 'Water heater inspected',             catalogLinks: [] },
  { id: 't6',  label: 'Toilet connections checked for leaks', catalogLinks: ['Toilet Leak Check'] },
  { id: 't7',  label: 'Under-sink plumbing inspected',      catalogLinks: ['Toilet Leak Check'] },
  { id: 't8',  label: 'Washer drain pan inspected',         catalogLinks: ['Washer Pan Inspection'] },
  { id: 't9',  label: 'HVAC system visually inspected',     catalogLinks: ['HVAC Full Inspection'] },
  { id: 't10', label: 'Light bulbs checked / replaced',     catalogLinks: ['Light Bulb Replacement', 'Additional Light Bulbs (per 5)'] },
  { id: 't11', label: 'Electrical panel checked',           catalogLinks: [] },
  { id: 't12', label: 'Exterior doors / windows sealed',    catalogLinks: [] },
];

// Shared photo picker strip component
function PhotoStrip({
  photos, onAdd, onRemove, maxPhotos = 5, uploading,
}: {
  photos: { uri: string; key?: string }[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  maxPhotos?: number;
  uploading: boolean;
}) {
  return (
    <View style={ps.row}>
      {photos.map((p, i) => (
        <View key={i} style={ps.thumb}>
          <Image source={{ uri: p.uri }} style={ps.img} />
          <TouchableOpacity style={ps.removeBtn} onPress={() => onRemove(i)}>
            <Ionicons name="close-circle" size={18} color="#fff" />
          </TouchableOpacity>
          {!p.key && <ActivityIndicator style={ps.spinner} size="small" color="#fff" />}
        </View>
      ))}
      {photos.length < maxPhotos && (
        <TouchableOpacity style={ps.addBtn} onPress={onAdd} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#0B4A45" />
          ) : (
            <>
              <Ionicons name="camera" size={22} color="#0B4A45" />
              <Text style={ps.addText}>Add</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

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
          <RNDateTimePicker value={value} mode="date" minimumDate={new Date()}
            onChange={(_, d) => { setShowDate(false); if (d) { setTempDate(d); setShowTime(true); } }} />
        )}
        {showTime && (
          <RNDateTimePicker value={tempDate} mode="time"
            onChange={(_, d) => { setShowTime(false); if (d) onChange(d); }} />
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
            <RNDateTimePicker value={value} mode="datetime" minimumDate={new Date()}
              display="inline" onChange={(_, d) => { if (d) onChange(d); }} style={{ alignSelf: 'center' }} />
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

  // Checklist — pass/issue per task
  const [taskStatus, setTaskStatus] = useState<Record<string, 'PASS' | 'ISSUE'>>({});
  // Per-task issue state: selected catalog item id OR 'other', plus custom fields
  const [taskIssue, setTaskIssue] = useState<Record<string, { selectedId: string; customName: string; customPrice: string }>>({});
  const [checklistPhotos, setChecklistPhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [uploadingChecklist, setUploadingChecklist] = useState(false);
  const [sendingTaskRec, setSendingTaskRec] = useState<string | null>(null); // task id being sent

  // Additional notes
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<'OBSERVATION' | 'FINDING'>('OBSERVATION');
  const [notePhotos, setNotePhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingNote, setUploadingNote] = useState(false);

  // Completion
  const [completionPhotos, setCompletionPhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [completingJob, setCompletingJob] = useState(false);
  const [uploadingCompletion, setUploadingCompletion] = useState(false);

  // Catalog / standalone recommendation
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<any>(null);
  const [sendingRec, setSendingRec] = useState(false);

  // Saved inspection notes (loaded from API)
  const [inspectionNotes, setInspectionNotes] = useState<any[]>([]);

  // Reschedule
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date());

  const load = useCallback(async () => {
    const data: any = await requestsApi.getOne(id);
    setJob(data);
    setLoading(false);
    inspectionsApi.getNotes(id).then((notes: any) => setInspectionNotes(notes || [])).catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
    pricingApi.getAll().then((items: any) => setCatalogItems(items || [])).catch(() => {});
  }, [load]);

  // Reload job when vendor returns to this screen (e.g. after customer approves)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Photo helpers ───────────────────────────────────────────────
  const pickAndUpload = async (
    folder: string,
    current: { uri: string; key?: string }[],
    setCurrent: (v: { uri: string; key?: string }[]) => void,
    setUploading: (v: boolean) => void,
    max: number,
  ) => {
    if (current.length >= max) {
      Alert.alert('Limit reached', `Maximum ${max} photos allowed.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    const pending = { uri };
    setCurrent([...current, pending]);
    setUploading(true);
    try {
      const res: any = await uploadsApi.uploadPhoto(uri, folder);
      setCurrent((prev: any[]) =>
        prev.map((p) => (p.uri === uri && !p.key ? { uri, key: res.key } : p)),
      );
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Unknown error';
      Alert.alert('Upload failed', msg);
      setCurrent((prev: any[]) => prev.filter((p) => p.uri !== uri || p.key));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (
    idx: number,
    current: { uri: string; key?: string }[],
    setCurrent: (v: { uri: string; key?: string }[]) => void,
  ) => {
    setCurrent(current.filter((_, i) => i !== idx));
  };

  const readyKeys = (photos: { uri: string; key?: string }[]) =>
    photos.filter((p) => p.key).map((p) => p.key!);

  // ─── Actions ─────────────────────────────────────────────────────
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

  const markComplete = async () => {
    const keys = readyKeys(completionPhotos);
    if (keys.length === 0) {
      Alert.alert('Photos required', 'Please attach at least 1 completion photo before marking the job complete.');
      return;
    }
    if (completionPhotos.some((p) => !p.key)) {
      Alert.alert('Please wait', 'Some photos are still uploading. Please wait a moment.');
      return;
    }
    Alert.alert(
      'Mark Job Complete?',
      'The customer will be notified and will have 48 hours to review before payment is processed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Job',
          onPress: async () => {
            setCompletingJob(true);
            try {
              // Auto-save any unsaved checklist ratings
              if (Object.keys(taskStatus).length > 0) {
                const lines = INSPECTION_TASKS
                  .filter((t) => taskStatus[t.id])
                  .map((t) => `${taskStatus[t.id] === 'PASS' ? '✓' : '⚠'} ${t.label}`);
                const unrated = INSPECTION_TASKS.filter((t) => !taskStatus[t.id]).map((t) => `- ${t.label}`);
                const photoKeys = readyKeys(checklistPhotos);
                await inspectionsApi.addNote(id, {
                  title: 'Inspection Checklist',
                  content: [...lines, ...(unrated.length ? ['\nNot assessed:', ...unrated] : [])].join('\n'),
                  type: 'OBSERVATION',
                  photoUrls: photoKeys,
                }).catch(() => {});
              }
              await requestsApi.updateStatus(id, 'COMPLETED', keys);
              setTaskStatus({});
              setChecklistPhotos([]);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setCompletingJob(false);
            }
          },
        },
      ],
    );
  };

  const customerPrice = (item: any): number => {
    const base = parseFloat(item.basePrice);
    const markup = item.markupPercent != null ? parseFloat(item.markupPercent) : 20;
    return Math.round(base * (1 + markup / 100) * 100) / 100;
  };

  const setTaskPass = (taskId: string) => {
    setTaskStatus((prev) => ({ ...prev, [taskId]: 'PASS' }));
    setTaskIssue((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
  };

  const setTaskIssueStatus = (taskId: string) => {
    setTaskStatus((prev) => ({ ...prev, [taskId]: 'ISSUE' }));
    setTaskIssue((prev) => ({ ...prev, [taskId]: prev[taskId] ?? { selectedId: '', customName: '', customPrice: '' } }));
  };

  const sendTaskRecommendation = async (taskId: string) => {
    const issue = taskIssue[taskId];
    if (!issue?.selectedId) {
      Alert.alert('Select a recommendation', 'Pick a service or choose Other.');
      return;
    }
    let name: string, description: string, price: number;
    if (issue.selectedId === 'other') {
      if (!issue.customName.trim() || !issue.customPrice.trim()) {
        Alert.alert('Required', 'Enter a name and price for the custom recommendation.');
        return;
      }
      name = issue.customName.trim();
      description = 'Recommended during inspection';
      price = parseFloat(issue.customPrice);
      if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid amount.'); return; }
    } else {
      const item = catalogItems.find((c) => c.id === issue.selectedId);
      if (!item) return;
      name = item.name;
      description = item.description;
      price = customerPrice(item);
    }
    setSendingTaskRec(taskId);
    try {
      await requestsApi.recommendService(id, { name, description, price });
      Alert.alert('Sent!', `"${name}" sent to customer for approval.`);
      setTaskIssue((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSendingTaskRec(null);
    }
  };

  const saveChecklist = async () => {
    const rated = Object.keys(taskStatus);
    if (rated.length === 0) {
      Alert.alert('No tasks rated', 'Mark at least one task as Pass or Issue.');
      return;
    }
    const keys = readyKeys(checklistPhotos);
    if (keys.length === 0) {
      Alert.alert('Photo required', 'Attach at least 1 photo as proof.');
      return;
    }
    if (checklistPhotos.some((p) => !p.key)) {
      Alert.alert('Please wait', 'Photos are still uploading.');
      return;
    }
    const lines = INSPECTION_TASKS
      .filter((t) => taskStatus[t.id])
      .map((t) => `${taskStatus[t.id] === 'PASS' ? '✓' : '⚠'} ${t.label}`);
    const unrated = INSPECTION_TASKS.filter((t) => !taskStatus[t.id]).map((t) => `- ${t.label}`);
    setSavingChecklist(true);
    try {
      await inspectionsApi.addNote(id, {
        title: 'Inspection Checklist',
        content: [...lines, ...(unrated.length ? ['\nNot assessed:', ...unrated] : [])].join('\n'),
        type: 'OBSERVATION',
        photoUrls: keys,
      });
      Alert.alert('Saved', 'Inspection checklist saved.');
      setTaskStatus({});
      setChecklistPhotos([]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingChecklist(false);
    }
  };

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      Alert.alert('Required', 'Please enter a title and description.');
      return;
    }
    const keys = readyKeys(notePhotos);
    if (keys.length === 0) {
      Alert.alert('Photo required', 'At least 1 photo is required for every inspection note.');
      return;
    }
    if (notePhotos.some((p) => !p.key)) {
      Alert.alert('Please wait', 'Photos are still uploading.');
      return;
    }
    setSavingNote(true);
    try {
      await inspectionsApi.addNote(id, {
        title: noteTitle.trim(),
        content: noteContent.trim(),
        type: noteType,
        photoUrls: keys,
      });
      setNoteTitle('');
      setNoteContent('');
      setNoteType('OBSERVATION');
      setNotePhotos([]);
      Alert.alert('Saved', 'Note saved and visible to the customer.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingNote(false);
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

  if (loading || !job) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  const nextAction = NEXT_STATUS[job.status];
  const canReschedule = !['COMPLETED', 'CANCELLED'].includes(job.status);
  const showInProgress = ['IN_PROGRESS', 'COMPLETED'].includes(job.status);
  const isCompleted = job.status === 'COMPLETED';
  const isService = job.type === 'ADDITIONAL_SERVICE';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Customer Header */}
      <View style={styles.customerBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.customerLabel}>{isService ? 'Service Request' : 'Inspection'}</Text>
          {job.ticketNumber && <Text style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{job.ticketNumber}</Text>}
        </View>
        {job.customer && <Text style={styles.customerName}>{job.customer.firstName} {job.customer.lastName}</Text>}
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

      {/* Status actions */}
      {nextAction && (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: nextAction.color }]} onPress={advanceStatus}>
          <Text style={styles.actionBtnText}>{nextAction.label}</Text>
        </TouchableOpacity>
      )}

      {isCompleted && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>✓ Job Completed</Text>
        </View>
      )}

      {/* Saved inspection notes (visible after completion) */}
      {isCompleted && inspectionNotes.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inspection Results</Text>
          {inspectionNotes.map((note: any, i: number) => (
            <View key={note.id ?? i} style={[styles.savedNoteCard, note.type === 'FINDING' && styles.savedNoteCardFinding]}>
              <View style={styles.savedNoteHeader}>
                <Ionicons name={note.type === 'FINDING' ? 'warning' : 'document-text'} size={16}
                  color={note.type === 'FINDING' ? '#c05621' : '#0B4A45'} />
                <Text style={[styles.savedNoteTitle, note.type === 'FINDING' && { color: '#c05621' }]}>{note.title}</Text>
              </View>
              <Text style={styles.savedNoteContent}>{note.content}</Text>
              {note.photoUrls?.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {note.photoUrls.map((url: string, i: number) => (
                    <Image key={i} source={{ uri: url }} style={{ width: 90, height: 90, borderRadius: 8, marginRight: 8 }} />
                  ))}
                </ScrollView>
              )}
            </View>
          ))}
        </>
      )}

      {/* ── IN-PROGRESS CONTENT ── */}
      {showInProgress && (
        <>
          {/* Inspection Checklist — only for inspection jobs */}
          {!isService && <>
          <Text style={styles.sectionTitle}>Inspection Checklist</Text>
          <Text style={styles.sectionHint}>Mark each item Pass or Issue. If there's an issue, select the recommended action to send to the customer.</Text>

          {INSPECTION_TASKS.map((task) => {
            const status = taskStatus[task.id];
            const issue = taskIssue[task.id];
            const linkedItems = catalogItems.filter((c) => task.catalogLinks.includes(c.name));
            const alreadySent = job.additionalServices?.some((s: any) =>
              linkedItems.some((li) => li.name === s.name) || (issue?.selectedId === 'other' && s.name === issue?.customName)
            );
            return (
              <View key={task.id} style={[styles.taskCard, status === 'ISSUE' && styles.taskCardIssue, status === 'PASS' && styles.taskCardPass]}>
                <Text style={styles.taskLabel}>{task.label}</Text>
                <View style={styles.taskBtns}>
                  <TouchableOpacity style={[styles.taskBtn, status === 'PASS' && styles.taskBtnPass]} onPress={() => setTaskPass(task.id)}>
                    <Ionicons name="checkmark-circle" size={15} color={status === 'PASS' ? '#fff' : '#64748b'} />
                    <Text style={[styles.taskBtnText, status === 'PASS' && { color: '#fff' }]}>Pass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.taskBtn, status === 'ISSUE' && styles.taskBtnIssue]} onPress={() => setTaskIssueStatus(task.id)}>
                    <Ionicons name="warning" size={15} color={status === 'ISSUE' ? '#fff' : '#c05621'} />
                    <Text style={[styles.taskBtnText, status === 'ISSUE' && { color: '#fff' }]}>Issue</Text>
                  </TouchableOpacity>
                </View>

                {status === 'ISSUE' && !alreadySent && (
                  <View style={styles.issuePanel}>
                    <Text style={styles.issuePanelTitle}>Recommend a service:</Text>
                    {linkedItems.map((item) => (
                      <TouchableOpacity key={item.id}
                        style={[styles.recOption, issue?.selectedId === item.id && styles.recOptionSelected]}
                        onPress={() => setTaskIssue((prev) => ({ ...prev, [task.id]: { ...prev[task.id], selectedId: item.id, customName: '', customPrice: '' } }))}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.recOptionName}>{item.name}</Text>
                          <Text style={styles.recOptionPrices}>
                            Your rate: <Text style={{ fontWeight: '700' }}>${parseFloat(item.basePrice).toFixed(2)}</Text>
                          </Text>
                        </View>
                        {issue?.selectedId === item.id && <Ionicons name="checkmark-circle" size={20} color="#0B4A45" />}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.recOption, issue?.selectedId === 'other' && styles.recOptionSelected]}
                      onPress={() => setTaskIssue((prev) => ({ ...prev, [task.id]: { ...prev[task.id], selectedId: 'other' } }))}
                    >
                      <Text style={styles.recOptionName}>Other recommendation</Text>
                      {issue?.selectedId === 'other' && <Ionicons name="checkmark-circle" size={20} color="#0B4A45" />}
                    </TouchableOpacity>
                    {issue?.selectedId === 'other' && (
                      <View style={{ marginTop: 8 }}>
                        <TextInput style={styles.input} placeholder="Service name" placeholderTextColor="#94a3b8"
                          value={issue.customName}
                          onChangeText={(v) => setTaskIssue((prev) => ({ ...prev, [task.id]: { ...prev[task.id], customName: v } }))} />
                        <TextInput style={styles.input} placeholder="Customer price ($)" placeholderTextColor="#94a3b8"
                          keyboardType="decimal-pad" value={issue.customPrice}
                          onChangeText={(v) => setTaskIssue((prev) => ({ ...prev, [task.id]: { ...prev[task.id], customPrice: v } }))} />
                      </View>
                    )}
                    {issue?.selectedId && (
                      <TouchableOpacity style={styles.sendRecBtn} onPress={() => sendTaskRecommendation(task.id)} disabled={sendingTaskRec === task.id}>
                        {sendingTaskRec === task.id
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.sendRecBtnText}>Send to Customer for Approval</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {status === 'ISSUE' && alreadySent && (
                  <View style={styles.recSentBadge}>
                    <Ionicons name="paper-plane" size={14} color="#7c3aed" />
                    <Text style={styles.recSentText}>Recommendation sent</Text>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={styles.photoLabel}>Proof photos <Text style={styles.required}>*</Text></Text>
          <PhotoStrip
            photos={checklistPhotos}
            onAdd={() => pickAndUpload('checklist', checklistPhotos, setChecklistPhotos, setUploadingChecklist, 5)}
            onRemove={(i) => removePhoto(i, checklistPhotos, setChecklistPhotos)}
            uploading={uploadingChecklist}
          />
          <TouchableOpacity
            style={[styles.saveBtn, (Object.keys(taskStatus).length === 0 || readyKeys(checklistPhotos).length === 0) && styles.saveBtnDisabled]}
            onPress={saveChecklist}
            disabled={savingChecklist || Object.keys(taskStatus).length === 0 || readyKeys(checklistPhotos).length === 0}
          >
            {savingChecklist
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Checklist ({Object.keys(taskStatus).length} tasks rated)</Text>}
          </TouchableOpacity>
          </>}

          {/* Additional Notes */}
          <Text style={styles.sectionTitle}>{isService ? 'Service Notes' : 'Inspection Notes'}</Text>
          <Text style={styles.sectionHint}>Add an observation or finding with a photo.</Text>

          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, noteType === 'OBSERVATION' && styles.typeChipActive]}
              onPress={() => setNoteType('OBSERVATION')}
            >
              <Text style={[styles.typeChipText, noteType === 'OBSERVATION' && styles.typeChipTextActive]}>Observation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeChip, noteType === 'FINDING' && styles.typeChipFinding, noteType === 'FINDING' && styles.typeChipActive]}
              onPress={() => setNoteType('FINDING')}
            >
              <Ionicons name="warning" size={13} color={noteType === 'FINDING' ? '#fff' : '#c05621'} />
              <Text style={[styles.typeChipText, noteType === 'FINDING' && styles.typeChipTextActive]}> Finding</Text>
            </TouchableOpacity>
          </View>

          <TextInput style={styles.input} placeholder="Title (e.g. AC Drainage Blockage)"
            placeholderTextColor="#94a3b8" value={noteTitle} onChangeText={setNoteTitle} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Describe what you found or performed..."
            placeholderTextColor="#94a3b8" value={noteContent} onChangeText={setNoteContent} multiline />
          <Text style={styles.photoLabel}>Note photos <Text style={styles.required}>*</Text></Text>
          <PhotoStrip
            photos={notePhotos}
            onAdd={() => pickAndUpload('notes', notePhotos, setNotePhotos, setUploadingNote, 5)}
            onRemove={(i) => removePhoto(i, notePhotos, setNotePhotos)}
            uploading={uploadingNote}
          />
          <TouchableOpacity
            style={[styles.saveBtn, (readyKeys(notePhotos).length === 0) && styles.saveBtnDisabled]}
            onPress={saveNote}
            disabled={savingNote || readyKeys(notePhotos).length === 0}
          >
            {savingNote ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
          </TouchableOpacity>

          {/* Sent recommendations status */}
          {job.additionalServices?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Sent Recommendations</Text>
              {job.additionalServices.map((svc: any) => (
                <View key={svc.id} style={[styles.sentSvcCard, svc.approved ? styles.sentSvcApproved : styles.sentSvcPending]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sentSvcName}>{svc.name}</Text>
                    <Text style={styles.sentSvcPrice}>${Number(svc.price).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.sentSvcBadge, svc.approved ? styles.badgeGreen : styles.badgeOrange]}>
                    <Text style={[styles.sentSvcBadgeText, { color: svc.approved ? '#059669' : '#d97706' }]}>
                      {svc.approved ? '✓ Approved' : 'Pending'}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Service recommendations */}
          <Text style={styles.sectionTitle}>Recommend Additional Service</Text>
          <Text style={styles.sectionHint}>Select from the catalog. Customer approves before work begins.</Text>
          {catalogItems.map((item: any) => (
            <TouchableOpacity key={item.id}
              style={[styles.catalogCard, selectedCatalogItem?.id === item.id && styles.catalogCardSelected]}
              onPress={() => setSelectedCatalogItem(selectedCatalogItem?.id === item.id ? null : item)}
            >
              <View style={styles.catalogHeader}>
                <Text style={styles.catalogName}>{item.name}</Text>
                <Text style={styles.catalogPrice}>${parseFloat(item.basePrice).toFixed(2)}</Text>
              </View>
              <Text style={styles.catalogDesc}>{item.description}</Text>
              {selectedCatalogItem?.id === item.id && (
                <Ionicons name="checkmark-circle" size={18} color="#0B4A45" style={{ marginTop: 6 }} />
              )}
            </TouchableOpacity>
          ))}
          {selectedCatalogItem && (
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#805ad5' }]} onPress={sendRecommendation} disabled={sendingRec}>
              {sendingRec ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Send Recommendation: {selectedCatalogItem.name}</Text>}
            </TouchableOpacity>
          )}

          {/* Mark Complete — only when IN_PROGRESS */}
          {job.status === 'IN_PROGRESS' && (
            <>
              <View style={styles.completeSeparator} />
              <Text style={styles.sectionTitle}>Complete Job</Text>
              <Text style={styles.sectionHint}>
                Attach 1–5 photos showing the completed work. The customer has 48 hours to review before payment is released.
              </Text>
              <Text style={styles.photoLabel}>Completion photos <Text style={styles.required}>* min 1</Text></Text>
              <PhotoStrip
                photos={completionPhotos}
                onAdd={() => pickAndUpload('completion', completionPhotos, setCompletionPhotos, setUploadingCompletion, 5)}
                onRemove={(i) => removePhoto(i, completionPhotos, setCompletionPhotos)}
                uploading={uploadingCompletion}
                maxPhotos={5}
              />
              <TouchableOpacity
                style={[styles.completeBtn, (readyKeys(completionPhotos).length === 0 || completingJob) && styles.saveBtnDisabled]}
                onPress={markComplete}
                disabled={readyKeys(completionPhotos).length === 0 || completingJob}
              >
                {completingJob
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}> Mark Job Complete</Text></>
                }
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      {canReschedule && (
        <TouchableOpacity style={styles.rescheduleBtn} onPress={() => { setNewDate(job.scheduledDate ? new Date(job.scheduledDate) : new Date()); setRescheduleModal(true); }}>
          <Text style={styles.rescheduleBtnText}>Reschedule Inspection</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.chatBtn}
        onPress={() => router.push(`/chat/${id}?recipientId=${job.customerId}&recipientName=${job.customer ? job.customer.firstName : 'Customer'}`)}>
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
    </KeyboardAvoidingView>
  );
}

const ps = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  img: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10 },
  spinner: { position: 'absolute', bottom: 4, left: 4 },
  addBtn: { width: 76, height: 76, borderRadius: 10, borderWidth: 1.5, borderColor: '#0B4A45', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  addText: { fontSize: 11, color: '#0B4A45', marginTop: 2, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 16 },
  customerBox: { backgroundColor: '#0B4A45', borderRadius: 16, padding: 20, marginBottom: 12 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  customerName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  customerAddress: { fontSize: 14, color: '#c8e6c0', marginBottom: 2 },
  customerCity: { fontSize: 14, color: '#c8e6c0', marginBottom: 8 },
  customerNotes: { fontSize: 13, color: '#a8d5a2', fontStyle: 'italic' },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  scheduledLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  scheduledDate: { fontSize: 13, fontWeight: '700', color: '#0B4A45', flex: 1 },
  actionBtn: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  completedBadge: { backgroundColor: '#c6f6d5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  completedText: { color: '#17897D', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0B4A45', marginBottom: 4, marginTop: 16 },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12 },
  photoLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#c53030' },
  checklistCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  checkLabel: { fontSize: 14, color: '#374151', flex: 1 },
  checkLabelDone: { color: '#0B4A45', fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  typeChipActive: { backgroundColor: '#0B4A45', borderColor: '#0B4A45' },
  typeChipFinding: { borderColor: '#c05621' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  typeChipTextActive: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10, color: '#0f172a' },
  textArea: { height: 90, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#0B4A45', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnDisabled: { backgroundColor: '#94a3b8' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  completeSeparator: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 20 },
  completeBtn: { flexDirection: 'row', backgroundColor: '#059669', borderRadius: 14, padding: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  catalogCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  catalogCardSelected: { borderColor: '#0B4A45', backgroundColor: '#f0fdf4' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  catalogName: { fontSize: 14, fontWeight: '700', color: '#0B4A45', flex: 1, marginRight: 8 },
  catalogPrice: { fontSize: 14, fontWeight: '700', color: '#17897D' },
  catalogDesc: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  // Task pass/issue cards
  savedNoteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  savedNoteCardFinding: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  savedNoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  savedNoteTitle: { fontSize: 14, fontWeight: '700', color: '#0B4A45', flex: 1 },
  savedNoteContent: { fontSize: 13, color: '#475569', lineHeight: 20 },
  taskCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  taskCardPass: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  taskCardIssue: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  taskLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 10, lineHeight: 20 },
  taskBtns: { flexDirection: 'row', gap: 8 },
  taskBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, paddingVertical: 8, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  taskBtnPass: { backgroundColor: '#059669', borderColor: '#059669' },
  taskBtnIssue: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  taskBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  issuePanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#fecaca' },
  issuePanelTitle: { fontSize: 13, fontWeight: '700', color: '#dc2626', marginBottom: 8 },
  recOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  recOptionSelected: { borderColor: '#0B4A45', backgroundColor: '#EBF1EF' },
  recOptionName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  recOptionPrices: { fontSize: 12, color: '#64748b', marginTop: 2 },
  sendRecBtn: { backgroundColor: '#7c3aed', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  sendRecBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  recSentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#f3e8ff', borderRadius: 8, padding: 8 },
  recSentText: { fontSize: 13, color: '#7c3aed', fontWeight: '600' },
  sentSvcCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1.5 },
  sentSvcApproved: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  sentSvcPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  sentSvcName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sentSvcPrice: { fontSize: 13, color: '#475569', marginTop: 2 },
  sentSvcBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeOrange: { backgroundColor: '#fef3c7' },
  sentSvcBadgeText: { fontSize: 12, fontWeight: '700' },
  rescheduleBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 10, borderWidth: 1.5, borderColor: '#0B4A45' },
  rescheduleBtnText: { color: '#0B4A45', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#0B4A45', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 32 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0B4A45', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateBtnText: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: '#0B4A45', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: '#0B4A45', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
});
