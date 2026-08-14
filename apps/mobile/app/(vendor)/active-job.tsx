import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Platform, Image,
  KeyboardAvoidingView, Switch, Linking, AppState,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, pricingApi, uploadsApi, yolinkApi } from '../../src/services/api';
import { enqueueTaskResult, flushQueue } from '../../src/services/taskQueue';
import { fmtUSD } from '../../src/utils/currency';
import { haversineMeters } from '../../src/utils/geo';
import { colors } from '../../src/theme';
import { PhotoStrip } from '../../src/components/vendor/PhotoStrip';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
};

const GUTTER_CHECKLIST = [
  { key: 'gutter_debris', label: 'Debris Buildup', description: 'Check for debris (leaves, granules, nests) and clear if in scope', promptFields: [], catalogLinks: [] },
  { key: 'gutter_structural', label: 'Structural Condition', description: 'Inspect for sagging, separation from fascia, or misaligned sections', promptFields: [], catalogLinks: [] },
  { key: 'gutter_downspout', label: 'Downspout Inspection', description: 'Check downspouts for clogs and proper water flow away from foundation', promptFields: [], catalogLinks: [] },
  { key: 'gutter_seams', label: 'Seams & End Caps', description: 'Inspect gutter seams and end caps for rust or leaks', promptFields: [], catalogLinks: [] },
  { key: 'gutter_granules', label: 'Granule Buildup / Roof Edge', description: 'Check for granule buildup (roof shingle wear) or visible roof edge damage', promptFields: [], catalogLinks: [] },
  { key: 'gutter_slope', label: 'Drainage Slope', description: 'Verify slope/pitch allows proper drainage — no standing water', promptFields: [], catalogLinks: [] },
];

const GUTTER_NOTES_FIELDS = [
  'Overall condition (clear / partially clogged / heavily clogged)',
  'Structural issues found (sagging, loose brackets, separation) — include location',
  'Downspout function (draining properly / clogged / discharging near foundation)',
  'Recommendation: repair/re-hanging or downspout extension needed',
];

const formatCurrencyInput = (text: string): string => {
  const raw = text.replace(/[$,]/g, '');
  const clean = raw.replace(/[^0-9.]/g, '');
  if (!clean) return '';
  const parts = clean.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `$${intPart}.${parts[1].slice(0, 2)}`;
  return `$${intPart}`;
};
const parseCurrencyRaw = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;

function getServiceKey(job: any): 'inspection' | 'gutters' | 'solar' | 'hvac' | 'other' {
  const name = (job.additionalServices?.[0]?.name || '').toLowerCase();
  if (name.includes('gutter')) return 'gutters';
  if (name.includes('hvac') || name.includes('heating') || name.includes('air conditioning') || name.includes('furnace')) return 'hvac';
  if (job.type === 'SCHEDULED_INSPECTION') return 'inspection';
  if (name.includes('assessment')) return 'inspection';
  if (name.includes('solar')) return 'solar';
  return 'other';
}

const TASK_STATUS_OPTIONS = [
  { key: 'OK', label: 'OK', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
  { key: 'NEEDS_ATTENTION', label: 'Needs Attention', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'URGENT', label: 'Urgent', color: '#dc2626', bg: '#fff5f5', border: '#fca5a5' },
  { key: 'NOT_ACCESSIBLE', label: 'Not Accessible', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
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
              display="inline" themeVariant="light" onChange={(_, d) => { if (d) onChange(d); }} style={{ alignSelf: 'center', height: 400 }} />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Renders a single prompt field (boolean switch, select, text, number)
function PromptField({
  field, value, onChange, readOnly,
}: {
  field: any; value: any; onChange: (v: any) => void; readOnly: boolean;
}) {
  if (field.type === 'boolean') {
    return (
      <View style={styles.promptRow}>
        <Text style={styles.promptLabel}>{field.label}</Text>
        {readOnly
          ? <Text style={[styles.promptInput, { color: colors.lanternDeep, fontWeight: '700' }]}>{value ? 'Yes' : 'No'}</Text>
          : <Switch value={!!value} onValueChange={onChange} trackColor={{ true: colors.lanternDeep }} thumbColor={value ? '#fff' : '#f3f4f6'} />
        }
      </View>
    );
  }
  if (field.type === 'select') {
    return (
      <View style={styles.promptRow}>
        <Text style={styles.promptLabel}>{field.label}</Text>
        {readOnly
          ? <Text style={styles.promptInput}>{value || '—'}</Text>
          : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
              {(field.options || []).map((opt: string) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.selectChip, value === opt && styles.selectChipActive]}
                  onPress={() => onChange(opt)}
                >
                  <Text style={[styles.selectChipText, value === opt && styles.selectChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        }
      </View>
    );
  }
  return (
    <View style={styles.promptRow}>
      <Text style={styles.promptLabel}>{field.label}</Text>
      <TextInput
        style={styles.promptInput}
        placeholder={readOnly ? '' : (field.placeholder || (field.type === 'number' ? '0' : 'Enter...'))}
        placeholderTextColor={colors.steel}
        keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
        value={value != null ? String(value) : ''}
        onChangeText={onChange}
        editable={!readOnly}
      />
    </View>
  );
}

export default function ActiveJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Home monitoring (Yolink) connect
  const [showMonitorForm, setShowMonitorForm] = useState(false);
  const [monitorForm, setMonitorForm] = useState({ yolinkUAID: '', yolinkSecretKey: '', homeName: '', address: '' });
  const [connectingMonitor, setConnectingMonitor] = useState(false);
  const [monitorError, setMonitorError] = useState('');
  const [monitorResult, setMonitorResult] = useState<{ deviceCount: number } | null>(null);

  // Checklist
  const [checklist, setChecklist] = useState<any[]>([]);
  const [taskResults, setTaskResults] = useState<Record<string, any>>({});
  const [progress, setProgress] = useState<{ total: number; completed: number; sections: any[] } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // Checklists sharing a subgroupKey (admin's Inspection Configurator
  // grouping, e.g. "Leak Inspection") are always contiguous in `checklist`
  // (see loadChecklist() server-side). Groups start expanded (empty Set),
  // matching the admin page's own collapse convention — individual
  // checklists underneath still start collapsed via expandedSections.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Task modal
  const [activeTask, setActiveTask] = useState<any>(null);
  const [taskStatus, setTaskStatus] = useState('');
  const [taskFindings, setTaskFindings] = useState('');
  const [taskStructured, setTaskStructured] = useState<Record<string, any>>({});
  const [taskPhotos, setTaskPhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [uploadingTaskPhoto, setUploadingTaskPhoto] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [taskModalVisible, setTaskModalVisible] = useState(false);

  // Upsell modal
  const [upsellTask, setUpsellTask] = useState<any>(null);
  const [upsellModalVisible, setUpsellModalVisible] = useState(false);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [upsellSelectedId, setUpsellSelectedId] = useState('');
  const [upsellCustomName, setUpsellCustomName] = useState('');
  const [upsellCustomPrice, setUpsellCustomPrice] = useState('');
  const [sendingUpsell, setSendingUpsell] = useState(false);

  // Materials — vendor-logged material costs for the current repair, shown
  // to the customer and auto-included in their total (no approval step, see
  // ServiceRequestsService.addMaterialCost for why). Independent of the
  // checklist/service-type gating below, so it's available for every job
  // type, including general/"other" services that have no checklist at all.
  const [materialDescription, setMaterialDescription] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);

  // Completion
  const [completionPhotos, setCompletionPhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [completingJob, setCompletingJob] = useState(false);
  // Final quantity confirmation for Per Unit additional services — keyed by
  // AdditionalService id. Pre-filled from svc.quantity (what the customer
  // was billed at booking); if the vendor raises it, the customer's final
  // price increases accordingly when the job is marked complete.
  const [finalQuantities, setFinalQuantities] = useState<Record<string, string>>({});

  // General vendor notes (non-inspection jobs)
  const [generalNotes, setGeneralNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploadingCompletion, setUploadingCompletion] = useState(false);

  // Reschedule
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date());

  // Solar quote
  const [solarQuote, setSolarQuote] = useState<any>(null);
  const [solarQuoteEditing, setSolarQuoteEditing] = useState(false);
  const [solarForm, setSolarForm] = useState({
    systemSizeKw: '', numInverters: '', inverterManufacturer: '', inverterModel: '',
    pvSystemPrice: '', storageSizeKwh: '', storageManufacturer: '', storageModel: '', storagePrice: '',
  });
  const [submittingSolar, setSubmittingSolar] = useState(false);
  const [showCustomerContact, setShowCustomerContact] = useState(false);
  // Solar consultation
  const [solarConsultation, setSolarConsultation] = useState<any>(null);
  const [showCounterDatePicker, setShowCounterDatePicker] = useState(false);
  const [counterDate, setCounterDate] = useState(new Date());
  const [consultationBusy, setConsultationBusy] = useState(false);

  // Location tracking
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last GPS fix reported to the backend — used to gate "I Have Arrived" on
  // proximity to the job's address client-side (the backend independently
  // auto-advances the job on the same proximity check server-side; this is
  // just so the button itself doesn't sit enabled from far away).
  const [vendorCoords, setVendorCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Status advance guard
  const [advancingStatus, setAdvancingStatus] = useState(false);

  // One location fetch + report. Shared by the initial ping and every 90s
  // interval tick — used to be two separate near-duplicate blocks, which is
  // how a bug slipped in: the interval was only ever created *after* the
  // first fetch succeeded, so a single transient GPS failure (indoors, still
  // acquiring a fix, location services toggled off, ...) silently killed
  // tracking for the entire rest of the job with no retry and no error.
  const reportLocationOnce = useCallback(async (): Promise<boolean> => {
    try {
      // mayShowUserSettingsDialog defaults to true, which (on Android, when
      // the phone's separate Wi-Fi/Bluetooth "network location" assist is
      // off even though GPS itself is on) makes this depend on the vendor
      // tapping a system "Improve Location Accuracy?" dialog before it'll
      // resolve — miss that tap and it throws LocationSettingsUnsatisfiedException.
      // We only need GPS, so skip that dependency entirely.
      const l = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      });
      setVendorCoords({ lat: l.coords.latitude, lng: l.coords.longitude });
      await requestsApi.updateLocation(id, l.coords.latitude, l.coords.longitude, l.coords.heading);
      return true;
    } catch (err: any) {
      // The backend rejects location updates once this job is no longer
      // VENDOR_EN_ROUTE (cancelled, released, rescheduled, completed) —
      // stop pinging immediately instead of waiting for the normal
      // IN_PROGRESS/unmount stop conditions, and reload the job so the
      // screen reflects whatever actually happened to it.
      if (err?.response?.status === 400 && locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
        loadJob();
      } else {
        // Not a "job moved on" rejection — a genuine GPS/location-provider
        // failure. Logged (not shown to the vendor) so it's diagnosable via
        // logcat/Metro instead of being a total black box next time.
        console.warn('[active-job] location report failed:', err?.message ?? err);
      }
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Immediate ping + a 90s repeating interval — extracted so both the
  // VENDOR_EN_ROUTE status advance and the AppState foreground-resume
  // handler below can (re)start reporting the same way. The interval is
  // always created, even if this first ping fails, so a transient failure
  // doesn't permanently disable tracking — and the vendor is told plainly if
  // the very first attempt didn't go through, instead of it failing silently.
  const startLocationReporting = useCallback(async () => {
    const firstOk = await reportLocationOnce();
    if (!firstOk) {
      Alert.alert(
        'Location Not Sent',
        "We couldn't get your current location, so the customer won't see live tracking yet. Make sure Location Services are turned on — we'll keep trying automatically.",
      );
    }
    if (!locationIntervalRef.current) {
      locationIntervalRef.current = setInterval(reportLocationOnce, 90000);
    }
  }, [reportLocationOnce]);

  const stopLocationReporting = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }, []);

  const loadJob = useCallback(async () => {
    const data: any = await requestsApi.getOne(id);
    setJob(data);
    setGeneralNotes(data?.vendorNotes || '');
    setLoading(false);
    // Pre-fill (without clobbering any in-progress edit) the final-quantity
    // input for each Per Unit additional service with what the customer was
    // originally billed for.
    const perUnitServices = (data?.additionalServices || []).filter((s: any) => s.approved && s.quantity != null);
    if (perUnitServices.length > 0) {
      setFinalQuantities((prev) => {
        const next = { ...prev };
        for (const svc of perUnitServices) {
          if (next[svc.id] == null) next[svc.id] = String(svc.quantity);
        }
        return next;
      });
    }
    if (data?.type === 'ADDITIONAL_SERVICE') {
      const svcName = (data.additionalServices?.[0]?.name || '').toLowerCase();
      if (svcName.includes('solar')) {
        requestsApi.getSolarQuote(id).then((q: any) => {
          setSolarQuote(q);
        }).catch(() => {});
        requestsApi.getSolarConsultation(id).then((c: any) => {
          setSolarConsultation(c);
          if (c?.status === 'CONFIRMED' || c?.status === 'COMPLETED') setShowCustomerContact(true);
        }).catch(() => {});
      }
    }
  }, [id]);

  const loadChecklistData = useCallback(async () => {
    const [cl, results, prog] = await Promise.all([
      inspectionsApi.getChecklist(id).catch(() => []),
      inspectionsApi.getTasks(id).catch(() => []),
      inspectionsApi.getProgress(id).catch(() => null),
    ]);
    setChecklist((cl as any[]) || []);
    const map: Record<string, any> = {};
    for (const r of ((results as any[]) || [])) map[r.taskKey] = r;
    setTaskResults(map);
    setProgress((prog as any) || null);
  }, [id]);

  useEffect(() => {
    loadJob();
    loadChecklistData();
    pricingApi.getAll().then((items: any) => setCatalogItems(items || [])).catch(() => {});
    flushQueue(async (requestId, taskKey, dto) => {
      await inspectionsApi.upsertTask(requestId, taskKey, dto);
    }).catch(() => {});
    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [loadJob, loadChecklistData]);

  // Android in particular doesn't reliably suspend a plain setInterval just
  // because the app is backgrounded — without this, GPS + a network call
  // every 90s could keep running (and draining battery) while the vendor
  // isn't even looking at the screen. Pause reporting the moment the app
  // leaves the foreground; resume (with an immediate fresh ping, not a
  // stale wait) the moment it returns, only if the job is still actually
  // en route.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (job?.status === 'VENDOR_EN_ROUTE' && !locationIntervalRef.current) {
          startLocationReporting();
        }
      } else {
        stopLocationReporting();
      }
    });
    return () => sub.remove();
  }, [job?.status, startLocationReporting, stopLocationReporting]);

  useFocusEffect(useCallback(() => { loadJob(); loadChecklistData(); }, [loadJob, loadChecklistData]));

  // ── Photo helpers ──────────────────────────────────────────────────────────

  const uploadAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    folder: string,
    current: { uri: string; key?: string }[],
    setCurrent: (v: any) => void,
    setUploading: (v: boolean) => void,
    max: number,
  ) => {
    const available = max - current.length;
    const toUpload = assets.slice(0, available);
    if (!toUpload.length) return;
    const uris = toUpload.map((a) => a.uri);
    setCurrent((prev: any[]) => [...prev, ...uris.map((uri) => ({ uri }))]);
    setUploading(true);
    try {
      await Promise.all(uris.map(async (uri) => {
        const res: any = await uploadsApi.uploadPhoto(uri, folder);
        setCurrent((prev: any[]) => prev.map((p: any) =>
          p.uri === uri && !p.key ? { uri, key: res.key } : p
        ));
      }));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Unknown error');
      setCurrent((prev: any[]) => prev.filter((p: any) => !uris.includes(p.uri) || p.key));
    } finally {
      setUploading(false);
    }
  };

  const pickAndUpload = (
    folder: string,
    current: { uri: string; key?: string }[],
    setCurrent: (v: any) => void,
    setUploading: (v: boolean) => void,
    max = 5,
  ) => {
    if (current.length >= max) { Alert.alert('Limit', `Max ${max} photos`); return; }
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
          if (!result.canceled && result.assets?.length) {
            await uploadAssets(result.assets, folder, current, setCurrent, setUploading, max);
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const remaining = max - current.length;
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
          });
          if (!result.canceled && result.assets?.length) {
            await uploadAssets(result.assets, folder, current, setCurrent, setUploading, max);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const readyKeys = (photos: { uri: string; key?: string }[]) =>
    photos.filter((p) => p.key).map((p) => p.key!);

  // ── Task modal ─────────────────────────────────────────────────────────────

  const openTask = async (task: any) => {
    if (isCompleted) return; // submitted inspections are locked
    const existing = taskResults[task.key];
    setActiveTask(task);
    setTaskStatus(existing?.status || '');
    setTaskFindings(existing?.findings || '');
    setTaskPhotos(existing?.photoUrls?.map((u: string) => ({ uri: u, key: '_saved' })) || []);

    // AC Unit task: if nothing's been entered for THIS inspection yet,
    // pre-fill from the customer's last-known units/filters instead of
    // starting blank — same prefixed-key shape the renderer already uses.
    if (!existing && task.key === 'hvac_visual.units_overview') {
      const prefill = await inspectionsApi.getPropertyAcProfilePrefill(id).catch(() => null);
      setTaskStructured(prefill || {});
    } else {
      setTaskStructured(existing?.structuredData || {});
    }
    setTaskModalVisible(true);
  };

  const quickSaveOK = async (task: any) => {
    const dto = {
      status: 'OK',
      findings: undefined as string | undefined,
      structuredData: undefined as any,
      photoKeys: taskResults[task.key]?.photoKeys,
    };
    setSavingTask(true);
    try {
      await inspectionsApi.upsertTask(id, task.key, dto);
    } catch {
      await enqueueTaskResult(id, task.key, dto);
    }
    setTaskResults((prev) => ({ ...prev, [task.key]: { taskKey: task.key, status: 'OK', photoKeys: dto.photoKeys || [] } }));
    setSavingTask(false);
    setTaskModalVisible(false);
    loadChecklistData();
  };

  const saveTask = async () => {
    if (!taskStatus) { Alert.alert('Required', 'Select a status for this item.'); return; }
    if (taskStatus !== 'OK' && taskPhotos.length === 0) {
      Alert.alert('Photo required', 'At least one photo is required when the status is not OK.');
      return;
    }
    if (taskPhotos.some((p) => !p.key)) {
      Alert.alert('Please wait', 'Photos are still uploading.');
      return;
    }
    const photoKeys = taskPhotos.filter((p) => p.key !== '_saved').map((p) => p.key!);
    const existingKeys = taskResults[activeTask.key]?.photoKeys || [];
    const allKeys = [...existingKeys, ...photoKeys];
    const dto = {
      status: taskStatus,
      findings: taskFindings.trim() || undefined,
      structuredData: Object.keys(taskStructured).length > 0 ? taskStructured : undefined,
      photoKeys: allKeys.length > 0 ? allKeys : undefined,
    };
    setSavingTask(true);
    try {
      await inspectionsApi.upsertTask(id, activeTask.key, dto);
    } catch {
      await enqueueTaskResult(id, activeTask.key, dto);
    }
    // Optimistic update so checkmark appears immediately (fixes gutter checkmark race)
    setTaskResults((prev) => ({ ...prev, [activeTask.key]: { taskKey: activeTask.key, status: taskStatus, findings: dto.findings, photoKeys: dto.photoKeys || [] } }));
    setSavingTask(false);
    setTaskModalVisible(false);
    loadChecklistData();
    if (taskStatus === 'NEEDS_ATTENTION' || taskStatus === 'URGENT') {
      setUpsellTask(activeTask);
      setUpsellSelectedId('');
      setUpsellCustomName('');
      setUpsellCustomPrice('');
      setUpsellModalVisible(true);
    }
  };

  // ── Upsell ─────────────────────────────────────────────────────────────────

  const sendUpsell = async () => {
    let name: string, description: string, price: number;
    if (upsellSelectedId === 'other') {
      if (!upsellCustomName.trim() || !upsellCustomPrice.trim()) {
        Alert.alert('Required', 'Enter a name and price.'); return;
      }
      name = upsellCustomName.trim();
      description = `Recommendation from checklist task: ${upsellTask?.label}`;
      price = parseCurrencyRaw(upsellCustomPrice);
      if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid amount.'); return; }
    } else if (upsellSelectedId) {
      const item = catalogItems.find((c) => c.id === upsellSelectedId);
      if (!item) return;
      name = item.name; description = item.description; price = parseFloat(item.basePrice);
    } else {
      setUpsellModalVisible(false); return;
    }
    setSendingUpsell(true);
    try {
      await requestsApi.recommendService(id, { name, description, price });
      Alert.alert('Quote sent', `"${name}" has been sent to the customer for approval.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSendingUpsell(false);
      setUpsellModalVisible(false);
      loadJob();
    }
  };

  // ── Materials ──────────────────────────────────────────────────────────────

  const addMaterial = async () => {
    if (!materialDescription.trim()) { Alert.alert('Required', 'Enter a description of the material(s).'); return; }
    const cost = parseCurrencyRaw(materialCost);
    if (isNaN(cost) || cost <= 0) { Alert.alert('Invalid cost', 'Enter a valid amount.'); return; }
    setAddingMaterial(true);
    try {
      await requestsApi.addMaterial(id, { description: materialDescription.trim(), cost });
      setMaterialDescription('');
      setMaterialCost('');
      await loadJob();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingMaterial(false);
    }
  };

  // ── Status advance ─────────────────────────────────────────────────────────

  const performAdvance = async (next: { label: string; next: string; color: string }) => {
    if (advancingStatus) return;
    setAdvancingStatus(true);

    if (next.next === 'VENDOR_EN_ROUTE') {
      // Location sharing is required to enter this status, not best-effort —
      // a denied/skipped permission used to leave vendorLatitude/Longitude
      // permanently null with no way for the customer to tell that apart
      // from a location that just hasn't been reported yet.
      const existing = await Location.getForegroundPermissionsAsync();
      const { status, canAskAgain } = existing.status === 'granted'
        ? existing
        : await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Location Required',
            "Location access is required so the customer can see when you're on the way. Please enable it in Settings.",
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
          );
        } else {
          Alert.alert('Location Required', "Please allow location access so the customer can see when you're on the way.");
        }
        setAdvancingStatus(false);
        return;
      }
      await startLocationReporting();
    }

    if (next.next === 'IN_PROGRESS') {
      stopLocationReporting();
    }

    try {
      await requestsApi.updateStatus(id, next.next);
      await loadJob();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAdvancingStatus(false);
    }
  };

  const advanceStatus = () => {
    const next = NEXT_STATUS[job.status];
    if (!next || advancingStatus) return;

    if (next.next === 'IN_PROGRESS') {
      Alert.alert(
        'Confirm Arrival',
        "Have you arrived at the customer's home?",
        [
          { text: 'Not yet', style: 'cancel' },
          { text: "Yes, I'm Here", onPress: () => performAdvance(next) },
        ]
      );
      return;
    }

    performAdvance(next);
  };

  // ── Complete job ───────────────────────────────────────────────────────────

  const markComplete = async () => {
    if (showInspectionChecklist && progress && progress.completed < progress.total) {
      Alert.alert('Checklist incomplete', `${progress.total - progress.completed} items still need a status.`);
      return;
    }
    if (showGutterChecklist && gutterCompletedCount < GUTTER_CHECKLIST.length) {
      Alert.alert('Checklist incomplete', `${GUTTER_CHECKLIST.length - gutterCompletedCount} gutter items still need a status.`);
      return;
    }
    const keys = readyKeys(completionPhotos);
    if (keys.length === 0) { Alert.alert('Photos required', 'Attach at least 1 completion photo.'); return; }
    if (completionPhotos.some((p) => !p.key)) { Alert.alert('Please wait', 'Photos are still uploading.'); return; }
    Alert.alert(
      'Mark Job Complete?',
      'The customer will be notified and will have 48 hours to review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Job',
          onPress: async () => {
            setCompletingJob(true);
            try {
              const finalQtyPayload: Record<string, number> = {};
              for (const [svcId, val] of Object.entries(finalQuantities)) {
                const n = parseFloat(val);
                if (!isNaN(n)) finalQtyPayload[svcId] = n;
              }
              await requestsApi.updateStatus(id, 'COMPLETED', keys, finalQtyPayload);
              loadJob(); loadChecklistData();
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

  const saveGeneralNotes = async () => {
    setSavingNotes(true);
    try {
      await requestsApi.addNotes(id, generalNotes.trim());
      Alert.alert('Saved', 'Your notes are visible to the homeowner.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const submitReschedule = async () => {
    try {
      await requestsApi.reschedule(id, newDate.toISOString());
      setRescheduleModal(false);
      Alert.alert('Rescheduled', 'The customer has been notified.');
      loadJob();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const [releasingJob, setReleasingJob] = useState(false);
  const handleReleaseJob = () => {
    Alert.alert(
      "Can't Make It?",
      'This releases the job back to the open pool for another vendor to accept, and notifies the customer. This cannot be undone.',
      [
        { text: 'Keep Job', style: 'cancel' },
        {
          text: 'Release Job', style: 'destructive',
          onPress: async () => {
            setReleasingJob(true);
            try {
              await requestsApi.vendorRelease(id);
              Alert.alert('Job Released', 'The customer has been notified and the job is back in the open pool.');
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setReleasingJob(false);
            }
          },
        },
      ],
    );
  };

  const submitMonitoring = async () => {
    if (!monitorForm.yolinkUAID.trim() || !monitorForm.yolinkSecretKey.trim() || !monitorForm.homeName.trim()) {
      setMonitorError('UAID, Secret Key, and a home name are required.');
      return;
    }
    setConnectingMonitor(true);
    setMonitorError('');
    try {
      const res = await yolinkApi.linkHome({
        customerId: job.customerId,
        yolinkUAID: monitorForm.yolinkUAID.trim(),
        yolinkSecretKey: monitorForm.yolinkSecretKey.trim(),
        homeName: monitorForm.homeName.trim(),
        address: monitorForm.address.trim() || undefined,
      });
      setMonitorResult({ deviceCount: res.devices?.length ?? 0 });
    } catch (e: any) {
      setMonitorError(e.message || 'Could not connect — check the UAID and Secret Key.');
    } finally {
      setConnectingMonitor(false);
    }
  };

  if (loading || !job) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const serviceKey = getServiceKey(job);
  const solarConsultationConfirmed = solarConsultation?.status === 'CONFIRMED' || solarConsultation?.status === 'COMPLETED';
  const nextAction = (serviceKey === 'solar' && job.status === 'ACCEPTED' && !solarConsultationConfirmed)
    ? null
    : NEXT_STATUS[job.status];
  const isPendingReview = job.status === 'PENDING_CUSTOMER_REVIEW';
  const canReschedule = !['COMPLETED', 'CANCELLED', 'PENDING_CUSTOMER_REVIEW'].includes(job.status);
  const canReleaseJob = ['ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'].includes(job.status);
  const showChecklist = ['IN_PROGRESS', 'COMPLETED'].includes(job.status);
  const isCompleted = job.status === 'COMPLETED';
  const isService = job.type === 'ADDITIONAL_SERVICE';
  // 'hvac' jobs render through the same generic checklist UI as 'inspection'
  // jobs now — the data differs per job (getChecklist(id) is job-scoped to
  // whichever checklist group applies), not the rendering code.
  const showInspectionChecklist = showChecklist && (serviceKey === 'inspection' || serviceKey === 'hvac');
  const showGutterChecklist = showChecklist && serviceKey === 'gutters';
  const showSolarPanel = serviceKey === 'solar';

  const completedCount = progress?.completed ?? 0;
  const totalCount = progress?.total ?? 0;
  const checklistFraction = totalCount > 0 ? completedCount / totalCount : 0;
  const checklistReady = totalCount > 0 && completedCount >= totalCount;

  const gutterCompletedCount = showGutterChecklist
    ? GUTTER_CHECKLIST.filter((t) => !!taskResults[t.key]).length
    : 0;

  // Gate "I Have Arrived" on GPS proximity — the backend independently
  // auto-advances the job on the same check as location updates come in, so
  // this is mainly about not leaving the button enabled while clearly still
  // far away. Jobs without geocoded coordinates (job.latitude/longitude
  // null — legacy request, or geocoding failed) fail OPEN: never regress
  // today's manual-only behavior for those.
  const jobHasCoords = job.latitude != null && job.longitude != null;
  const withinArrivalRange = !jobHasCoords || (
    vendorCoords != null
    && haversineMeters(vendorCoords.lat, vendorCoords.lng, Number(job.latitude), Number(job.longitude)) <= 150
  );
  const arrivalGateActive = job.status === 'VENDOR_EN_ROUTE' && jobHasCoords && !withinArrivalRange;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Job header */}
        <View style={styles.customerBox}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.customerLabel}>{isService ? 'Service Request' : 'Assessment'}</Text>
            {job.ticketNumber && <Text style={{ fontSize: 11, color: '#a8d5a2', fontFamily: 'monospace' }}>{job.ticketNumber}</Text>}
          </View>
          <Text style={styles.jobTitle}>
            {isService
              ? (job.additionalServices?.[0]?.name || 'Service Request')
              : 'Preventative Home Assessment — HVAC, plumbing, water leak check & bulb replacement'}
          </Text>
          {isService && job.additionalServices?.[0]?.description ? (
            <Text style={styles.jobDescription}>{job.additionalServices[0].description}</Text>
          ) : null}
          {job.customer && <Text style={styles.customerName}>{job.customer.firstName} {job.customer.lastName}</Text>}
          <Text style={styles.customerAddress}>{job.address}</Text>
          <Text style={styles.customerCity}>{job.city}, {job.state} {job.zipCode}</Text>
          {isService && job.customerNotes ? (
            <View style={styles.requestedServicesBox}>
              <Text style={styles.requestedServicesLabel}>Requested Services</Text>
              {job.customerNotes.split('\n').filter(Boolean).map((line: string, i: number) => (
                <Text key={i} style={styles.requestedServicesLine}>• {line}</Text>
              ))}
            </View>
          ) : job.customerNotes ? (
            <Text style={styles.customerNotes}>Note: {job.customerNotes}</Text>
          ) : null}
        </View>

        {job.isMonitoringSetupJob && (
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowMonitorForm((v) => !v)}
            >
              <View style={styles.sectionLeft}>
                <Ionicons name="wifi-outline" size={18} color={colors.lanternDeep} />
                <Text style={styles.sectionLabel}>Connect Home Monitoring</Text>
              </View>
              <Ionicons name={showMonitorForm ? 'chevron-up' : 'chevron-down'} size={18} color={colors.steel} />
            </TouchableOpacity>
            {showMonitorForm && (
              <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                {monitorResult ? (
                  <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '600' }}>
                    ✅ Connected — {monitorResult.deviceCount} device{monitorResult.deviceCount === 1 ? '' : 's'} found on this home.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.sectionHint}>
                      Enter this customer's own Yolink credentials — found in their Yolink app under
                      Account → Advanced Settings → User Access Credentials. Attenteve never needs their Yolink login.
                    </Text>
                    <TextInput
                      style={styles.promptInput}
                      placeholder="UAID (starts with ua_)"
                      value={monitorForm.yolinkUAID}
                      onChangeText={(t) => setMonitorForm((f) => ({ ...f, yolinkUAID: t }))}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={[styles.promptInput, { marginTop: 8 }]}
                      placeholder="Secret Key (starts with sec_)"
                      value={monitorForm.yolinkSecretKey}
                      onChangeText={(t) => setMonitorForm((f) => ({ ...f, yolinkSecretKey: t }))}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={[styles.promptInput, { marginTop: 8 }]}
                      placeholder="Home name"
                      value={monitorForm.homeName}
                      onChangeText={(t) => setMonitorForm((f) => ({ ...f, homeName: t }))}
                    />
                    <TextInput
                      style={[styles.promptInput, { marginTop: 8 }]}
                      placeholder="Address (optional)"
                      value={monitorForm.address}
                      onChangeText={(t) => setMonitorForm((f) => ({ ...f, address: t }))}
                    />
                    {monitorError ? (
                      <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{monitorError}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: connectingMonitor ? colors.steel : colors.lanternDeep, marginTop: 12, marginBottom: 0 }]}
                      onPress={submitMonitoring}
                      disabled={connectingMonitor}
                    >
                      <Text style={styles.actionBtnText}>{connectingMonitor ? 'Verifying…' : 'Verify & Connect'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {job.scheduledDate && (
          <View style={styles.scheduledRow}>
            <Text style={styles.scheduledLabel}>{isPendingReview ? 'Proposed:' : 'Scheduled:'}</Text>
            <Text style={styles.scheduledDate}>
              {new Date(job.scheduledDate).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
              })}
            </Text>
          </View>
        )}

        {isPendingReview && (
          <View style={styles.pendingReviewBanner}>
            <Ionicons name="hourglass-outline" size={20} color="#b45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingReviewTitle}>Waiting for Customer Confirmation</Text>
              <Text style={styles.pendingReviewBody}>
                Your proposed time differs from the customer's preferred date. The job will be confirmed once they accept.
              </Text>
            </View>
          </View>
        )}

        {nextAction && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: (advancingStatus || arrivalGateActive) ? colors.steel : nextAction.color }]}
              onPress={advanceStatus}
              disabled={advancingStatus || arrivalGateActive}
            >
              {advancingStatus
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionBtnText}>{nextAction.label}</Text>
              }
            </TouchableOpacity>
            {arrivalGateActive && (
              <Text style={styles.arrivalGateHint}>
                {vendorCoords ? "Get closer to the address to confirm arrival" : "Waiting for your location…"}
              </Text>
            )}
          </>
        )}

        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>✓ Job Completed</Text>
          </View>
        )}

        {/* ── Materials ── independent of checklist/service type, so it
            works even for general services with no checklist at all. */}
        {job.status === 'IN_PROGRESS' && (
          <View style={styles.sectionCard}>
            <View style={[styles.sectionHeader, { paddingBottom: 8 }]}>
              <Text style={[styles.sectionLabel, { paddingLeft: 4 }]}>Materials Used</Text>
            </View>
            <View style={{ padding: 14, paddingTop: 0 }}>
              {(job.additionalServices || []).filter((s: any) => s.isMaterial).map((s: any) => (
                <View key={s.id} style={[styles.sentSvcCard, styles.sentSvcApproved]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sentSvcName}>{s.description}</Text>
                  </View>
                  {/* Some categories price materials only at job completion
                      (see the "Included in the customer's total" hint above)
                      — price sits at 0 until then, so show a status instead
                      of a misleading $0.00. */}
                  {Number(s.price) > 0
                    ? <Text style={styles.sentSvcPrice}>{fmtUSD(s.price)}</Text>
                    : <Text style={[styles.sentSvcPrice, { color: colors.steel, fontSize: 12 }]}>Pending final price</Text>}
                </View>
              ))}
              <TextInput
                style={[styles.promptInput, { textAlign: 'left', width: '100%' }]}
                placeholder="Material description (e.g. PVC coupling)"
                placeholderTextColor={colors.steel}
                value={materialDescription}
                onChangeText={setMaterialDescription}
              />
              <TextInput
                style={[styles.promptInput, { textAlign: 'left', width: '100%', marginTop: 8 }]}
                placeholder="Cost ($)"
                placeholderTextColor={colors.steel}
                keyboardType="decimal-pad"
                value={materialCost}
                onChangeText={(t) => setMaterialCost(formatCurrencyInput(t))}
              />
              {materialCost !== '' && !isNaN(parseCurrencyRaw(materialCost)) && parseCurrencyRaw(materialCost) > 0 && (
                <Text style={styles.sectionHint}>
                  Included in the customer's total for this visit.
                </Text>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: addingMaterial ? colors.steel : colors.lanternDeep, marginTop: 12, marginBottom: 0 }]}
                onPress={addMaterial}
                disabled={addingMaterial}
              >
                {addingMaterial
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.actionBtnText}>+ Add Material</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Checklist ── */}
        {showInspectionChecklist && (
          <>
            <View style={styles.progressCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.progressLabel}>Checklist Progress</Text>
                <Text style={[styles.progressCount, checklistReady && { color: '#059669' }]}>
                  {completedCount}/{totalCount}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${checklistFraction * 100}%` as any }]} />
              </View>
              {isCompleted
                ? <Text style={[styles.progressHint, { color: '#059669' }]}>Assessment submitted — results are locked</Text>
                : !checklistReady && <Text style={styles.progressHint}>Complete all items to close the job</Text>
              }
            </View>

            {checklist.map((section: any, idx: number) => {
              const secProg = progress?.sections?.find((s: any) => s.key === section.key);
              const expanded = expandedSections.has(section.key);
              const sectionDone = secProg?.completed ?? 0;
              const sectionTotal = secProg?.total ?? section.tasks?.length ?? 0;
              const allDone = sectionDone >= sectionTotal;
              // Sections sharing a subgroupKey are contiguous (see loadChecklist()
              // server-side), so a group header only needs to render once, right
              // before the first section of each new subgroup.
              const showGroupHeader = !!section.subgroupKey && checklist[idx - 1]?.subgroupKey !== section.subgroupKey;
              const groupCollapsed = section.subgroupKey ? collapsedGroups.has(section.subgroupKey) : false;
              return (
                <Fragment key={section.key}>
                  {showGroupHeader && (
                    <TouchableOpacity
                      style={styles.groupHeader}
                      onPress={() => {
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(section.subgroupKey)) next.delete(section.subgroupKey); else next.add(section.subgroupKey);
                          return next;
                        });
                      }}
                    >
                      <Text style={styles.groupHeaderText}>{section.subgroupLabel}</Text>
                      <Ionicons name={groupCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colors.ink} />
                    </TouchableOpacity>
                  )}
                  {!groupCollapsed && (
                    <View style={styles.sectionCard}>
                      <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => {
                          setExpandedSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(section.key)) next.delete(section.key); else next.add(section.key);
                            return next;
                          });
                        }}
                      >
                        <View style={styles.sectionLeft}>
                          <View style={[styles.sectionBadge, allDone && styles.sectionBadgeDone]}>
                            <Text style={[styles.sectionBadgeText, allDone && { color: '#059669' }]}>
                              {sectionDone}/{sectionTotal}
                            </Text>
                          </View>
                          <Text style={styles.sectionLabel}>{section.label}</Text>
                        </View>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.steel} />
                      </TouchableOpacity>

                      {expanded && (
                        <View style={styles.taskList}>
                          {(section.tasks || []).map((task: any) => {
                            const result = taskResults[task.key];
                            const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.key === result?.status);
                            return (
                              <TouchableOpacity
                                key={task.key}
                                style={[
                                  styles.taskRow,
                                  result && { borderLeftColor: statusOpt?.color || colors.border, borderLeftWidth: 3 },
                                  isCompleted && { opacity: 0.75 },
                                ]}
                                onPress={() => openTask(task)}
                                disabled={isCompleted}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.taskRowLabel}>{task.label}</Text>
                                  {result && (
                                    <View style={[styles.taskStatusPill, { backgroundColor: statusOpt?.bg }]}>
                                      <Text style={[styles.taskStatusPillText, { color: statusOpt?.color }]}>
                                        {statusOpt?.label}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Ionicons
                                  name={result ? 'checkmark-circle' : (isCompleted ? 'ellipse-outline' : 'ellipse-outline')}
                                  size={22}
                                  color={result ? (statusOpt?.color || '#059669') : '#d1d5db'}
                                />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}
                </Fragment>
              );
            })}

            {job.additionalServices?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Sent Recommendations</Text>
                {job.additionalServices.map((svc: any) => (
                  <View key={svc.id} style={[styles.sentSvcCard, svc.approved ? styles.sentSvcApproved : styles.sentSvcPending]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sentSvcName}>{svc.name}</Text>
                      <Text style={styles.sentSvcPrice}>{fmtUSD(svc.price)}</Text>
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

            {job.status === 'IN_PROGRESS' && (
              <>
                <View style={styles.completeSeparator} />
                <Text style={styles.sectionTitle}>Complete Job</Text>
                <Text style={styles.sectionHint}>
                  {checklistReady
                    ? 'All items done. Attach a completion photo and close the job.'
                    : `Complete all ${totalCount - completedCount} remaining checklist items first.`}
                </Text>

                {job.additionalServices?.filter((s: any) => s.approved && s.quantity != null).length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.photoLabel}>Confirm final quantity</Text>
                    <Text style={styles.sectionHint}>
                      Enter the actual quantity/hours for each service below. Raising it above what the customer was originally billed increases their final charge.
                    </Text>
                    {job.additionalServices
                      .filter((s: any) => s.approved && s.quantity != null)
                      .map((svc: any) => (
                        <View key={svc.id} style={styles.qtyConfirmRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.qtyConfirmName}>{svc.name}</Text>
                            <Text style={styles.qtyConfirmHint}>Originally billed: {svc.quantity}</Text>
                          </View>
                          <TextInput
                            style={styles.qtyConfirmInput}
                            keyboardType="decimal-pad"
                            value={finalQuantities[svc.id] ?? String(svc.quantity)}
                            onChangeText={(v) => setFinalQuantities((prev) => ({ ...prev, [svc.id]: v }))}
                          />
                        </View>
                      ))}
                  </View>
                )}

                <Text style={styles.photoLabel}>Completion photos <Text style={styles.required}>* min 1</Text></Text>
                <PhotoStrip
                  photos={completionPhotos}
                  onAdd={() => pickAndUpload('completion', completionPhotos, setCompletionPhotos, setUploadingCompletion, 5)}
                  onRemove={(i) => setCompletionPhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingCompletion}
                  maxPhotos={5}
                />
                <TouchableOpacity
                  style={[
                    styles.completeBtn,
                    (!checklistReady || readyKeys(completionPhotos).length === 0 || completingJob) && styles.saveBtnDisabled,
                  ]}
                  onPress={markComplete}
                  disabled={!checklistReady || readyKeys(completionPhotos).length === 0 || completingJob}
                >
                  {completingJob
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}> Mark Job Complete</Text></>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Gutter Checklist ── */}
        {showGutterChecklist && (
          <>
            <View style={styles.progressCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.progressLabel}>Gutter Inspection Checklist</Text>
                <Text style={[styles.progressCount, gutterCompletedCount >= GUTTER_CHECKLIST.length && { color: '#059669' }]}>
                  {gutterCompletedCount}/{GUTTER_CHECKLIST.length}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(gutterCompletedCount / GUTTER_CHECKLIST.length) * 100}%` as any }]} />
              </View>
              {gutterCompletedCount < GUTTER_CHECKLIST.length && <Text style={styles.progressHint}>Complete all items to close the job</Text>}
            </View>

            <View style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { paddingBottom: 8 }]}>
                <Text style={[styles.sectionLabel, { paddingLeft: 4 }]}>Gutter Inspection Tasks</Text>
              </View>
              <View style={styles.taskList}>
                {GUTTER_CHECKLIST.map((task) => {
                  const result = taskResults[task.key];
                  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.key === result?.status);
                  return (
                    <TouchableOpacity
                      key={task.key}
                      style={[
                        styles.taskRow,
                        result && { borderLeftColor: statusOpt?.color || colors.border, borderLeftWidth: 3 },
                        isCompleted && { opacity: 0.75 },
                      ]}
                      onPress={() => openTask(task)}
                      disabled={isCompleted}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskRowLabel}>{task.label}</Text>
                        <Text style={[styles.taskDescText, { marginBottom: 0, marginTop: 2 }]}>{task.description}</Text>
                        {result && (
                          <View style={[styles.taskStatusPill, { backgroundColor: statusOpt?.bg }]}>
                            <Text style={[styles.taskStatusPillText, { color: statusOpt?.color }]}>{statusOpt?.label}</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={result ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={result ? (statusOpt?.color || '#059669') : '#d1d5db'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.progressCard, { marginTop: 0 }]}>
              <Text style={[styles.progressLabel, { marginBottom: 8 }]}>Notes to Document</Text>
              {GUTTER_NOTES_FIELDS.map((note, i) => (
                <Text key={i} style={{ fontSize: 13, color: colors.steel, marginBottom: 4 }}>• {note}</Text>
              ))}
            </View>

            {job.status === 'IN_PROGRESS' && (
              <>
                <View style={styles.completeSeparator} />
                <Text style={styles.sectionTitle}>Complete Job</Text>
                <Text style={styles.sectionHint}>
                  {gutterCompletedCount >= GUTTER_CHECKLIST.length
                    ? 'All items done. Attach before/after photos and close the job.'
                    : `Complete all ${GUTTER_CHECKLIST.length - gutterCompletedCount} remaining checklist items first.`}
                </Text>
                <Text style={styles.photoLabel}>Before / After Photos <Text style={styles.required}>* min 1</Text></Text>
                <PhotoStrip
                  photos={completionPhotos}
                  onAdd={() => pickAndUpload('completion', completionPhotos, setCompletionPhotos, setUploadingCompletion, 5)}
                  onRemove={(i) => setCompletionPhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingCompletion}
                  maxPhotos={5}
                />
                <TouchableOpacity
                  style={[
                    styles.completeBtn,
                    (gutterCompletedCount < GUTTER_CHECKLIST.length || readyKeys(completionPhotos).length === 0 || completingJob) && styles.saveBtnDisabled,
                  ]}
                  onPress={markComplete}
                  disabled={gutterCompletedCount < GUTTER_CHECKLIST.length || readyKeys(completionPhotos).length === 0 || completingJob}
                >
                  {completingJob
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}> Mark Job Complete</Text></>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}


        {/* ── Solar Panel ── */}
        {showSolarPanel && (
          <View style={styles.solarCard}>
            <Text style={styles.sectionTitle}>Solar Quote</Text>

            {/* Quote form or summary */}
            {(!solarQuote || solarQuoteEditing) ? (
              <>
                <Text style={styles.sectionHint}>{solarQuoteEditing ? 'Update your quote below.' : 'Complete the quote. Customer contact is revealed after site visit is confirmed.'}</Text>

                <Text style={styles.fieldLabel}>System Size (kW) *</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" value={solarForm.systemSizeKw} onChangeText={(v) => setSolarForm((p) => ({ ...p, systemSizeKw: v }))} placeholder="e.g. 8.5" placeholderTextColor={colors.steel} />
                <Text style={styles.fieldLabel}>Number of Inverters *</Text>
                <TextInput style={styles.input} keyboardType="number-pad" value={solarForm.numInverters} onChangeText={(v) => setSolarForm((p) => ({ ...p, numInverters: v }))} placeholder="e.g. 1" placeholderTextColor={colors.steel} />
                <Text style={styles.fieldLabel}>Inverter Manufacturer *</Text>
                <TextInput style={styles.input} value={solarForm.inverterManufacturer} onChangeText={(v) => setSolarForm((p) => ({ ...p, inverterManufacturer: v }))} placeholder="e.g. Enphase" placeholderTextColor={colors.steel} />
                <Text style={styles.fieldLabel}>Inverter Model *</Text>
                <TextInput style={styles.input} value={solarForm.inverterModel} onChangeText={(v) => setSolarForm((p) => ({ ...p, inverterModel: v }))} placeholder="e.g. IQ8+" placeholderTextColor={colors.steel} />
                <Text style={styles.fieldLabel}>PV System Price ($) *</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" value={solarForm.pvSystemPrice} onChangeText={(v) => setSolarForm((p) => ({ ...p, pvSystemPrice: formatCurrencyInput(v) }))} placeholder="e.g. $24,000" placeholderTextColor={colors.steel} />

                {!(job.customerNotes || '').includes('Solar Only') && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 16, color: colors.steel }]}>Energy Storage (optional)</Text>
                    <Text style={styles.fieldLabel}>Storage Size (kWh)</Text>
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={solarForm.storageSizeKwh} onChangeText={(v) => setSolarForm((p) => ({ ...p, storageSizeKwh: v }))} placeholder="e.g. 13.5" placeholderTextColor={colors.steel} />
                    <Text style={styles.fieldLabel}>Storage Manufacturer</Text>
                    <TextInput style={styles.input} value={solarForm.storageManufacturer} onChangeText={(v) => setSolarForm((p) => ({ ...p, storageManufacturer: v }))} placeholder="e.g. Tesla" placeholderTextColor={colors.steel} />
                    <Text style={styles.fieldLabel}>Storage Model</Text>
                    <TextInput style={styles.input} value={solarForm.storageModel} onChangeText={(v) => setSolarForm((p) => ({ ...p, storageModel: v }))} placeholder="e.g. Powerwall 3" placeholderTextColor={colors.steel} />
                    <Text style={styles.fieldLabel}>Storage Price ($)</Text>
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={solarForm.storagePrice} onChangeText={(v) => setSolarForm((p) => ({ ...p, storagePrice: formatCurrencyInput(v) }))} placeholder="e.g. $10,000" placeholderTextColor={colors.steel} />
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {solarQuoteEditing && (
                    <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: colors.border }]} onPress={() => setSolarQuoteEditing(false)}>
                      <Text style={[styles.saveBtnText, { color: colors.slate }]}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.saveBtn, { flex: 1, backgroundColor: '#f59e0b' }, submittingSolar && styles.saveBtnDisabled]}
                    disabled={submittingSolar}
                    onPress={async () => {
                      if (!solarForm.systemSizeKw || !solarForm.numInverters || !solarForm.inverterManufacturer || !solarForm.inverterModel || !solarForm.pvSystemPrice) {
                        Alert.alert('Required Fields', 'Please fill in all required system fields.');
                        return;
                      }
                      setSubmittingSolar(true);
                      try {
                        const payload: any = {
                          systemSizeKw: parseFloat(solarForm.systemSizeKw),
                          numInverters: parseInt(solarForm.numInverters),
                          inverterManufacturer: solarForm.inverterManufacturer.trim(),
                          inverterModel: solarForm.inverterModel.trim(),
                          pvSystemPrice: parseCurrencyRaw(solarForm.pvSystemPrice),
                        };
                        if (solarForm.storageSizeKwh) payload.storageSizeKwh = parseFloat(solarForm.storageSizeKwh);
                        if (solarForm.storageManufacturer) payload.storageManufacturer = solarForm.storageManufacturer.trim();
                        if (solarForm.storageModel) payload.storageModel = solarForm.storageModel.trim();
                        if (solarForm.storagePrice) payload.storagePrice = parseCurrencyRaw(solarForm.storagePrice);
                        const q: any = await requestsApi.submitSolarQuote(id, payload);
                        setSolarQuote(q);
                        setSolarQuoteEditing(false);
                        Alert.alert('Quote Submitted', 'The customer has been notified and can now request a site visit.');
                      } catch (e: any) {
                        Alert.alert('Error', e.message);
                      } finally {
                        setSubmittingSolar(false);
                      }
                    }}
                  >
                    {submittingSolar ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveBtnText}>{solarQuoteEditing ? 'Update Quote' : 'Submit Quote'}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Quote summary */}
                <View style={[styles.progressCard, { marginBottom: 8 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669', marginBottom: 6 }}>✓ Quote Submitted</Text>
                  <Text style={{ fontSize: 13, color: colors.slate }}>System: {Number(solarQuote.systemSizeKw).toFixed(1)} kW • {solarQuote.numInverters}x {solarQuote.inverterManufacturer} {solarQuote.inverterModel}</Text>
                  <Text style={{ fontSize: 13, color: colors.slate, marginTop: 3 }}>PV System: <Text style={{ fontWeight: '700' }}>${Number(solarQuote.pvSystemPrice).toLocaleString()}</Text></Text>
                  {solarQuote.storageManufacturer && (
                    <>
                      <Text style={{ fontSize: 13, color: colors.slate, marginTop: 3 }}>Storage: {solarQuote.storageSizeKwh} kWh • {solarQuote.storageManufacturer} {solarQuote.storageModel}</Text>
                      {solarQuote.storagePrice && (
                        <Text style={{ fontSize: 13, color: colors.slate, marginTop: 3 }}>Storage Price: <Text style={{ fontWeight: '700' }}>${Number(solarQuote.storagePrice).toLocaleString()}</Text></Text>
                      )}
                    </>
                  )}
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.lanternDeep }}>
                    Total: ${(Number(solarQuote.pvSystemPrice) + Number(solarQuote.storagePrice || 0)).toLocaleString()}
                  </Text>
                  {(!solarConsultation || ['REQUESTED', 'VENDOR_COUNTER'].includes(solarConsultation?.status)) && (
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: colors.border, marginTop: 10 }]}
                      onPress={() => {
                        setSolarForm({
                          systemSizeKw: String(solarQuote.systemSizeKw),
                          numInverters: String(solarQuote.numInverters),
                          inverterManufacturer: solarQuote.inverterManufacturer,
                          inverterModel: solarQuote.inverterModel,
                          pvSystemPrice: String(solarQuote.pvSystemPrice),
                          storageSizeKwh: solarQuote.storageSizeKwh ? String(solarQuote.storageSizeKwh) : '',
                          storageManufacturer: solarQuote.storageManufacturer || '',
                          storageModel: solarQuote.storageModel || '',
                          storagePrice: solarQuote.storagePrice ? String(solarQuote.storagePrice) : '',
                        });
                        setSolarQuoteEditing(true);
                      }}
                    >
                      <Text style={[styles.saveBtnText, { color: colors.slate }]}>Edit Quote</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Consultation section */}
                {!solarConsultation ? (
                  <View style={[styles.progressCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                    <Text style={[styles.progressLabel, { color: '#92400e' }]}>Waiting for Customer</Text>
                    <Text style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>The customer has been notified and will request a site visit when ready.</Text>
                  </View>
                ) : solarConsultation.status === 'REQUESTED' ? (
                  <View style={[styles.progressCard, { backgroundColor: '#eff6ff', borderColor: '#93c5fd' }]}>
                    <Text style={[styles.progressLabel, { color: '#1d4ed8' }]}>Site Visit Requested</Text>
                    <Text style={{ fontSize: 13, color: '#1e40af', marginTop: 4 }}>
                      Preferred: {new Date(solarConsultation.customerProposedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        style={[styles.saveBtn, { flex: 1 }, consultationBusy && styles.saveBtnDisabled]}
                        disabled={consultationBusy}
                        onPress={async () => {
                          setConsultationBusy(true);
                          try {
                            const c: any = await requestsApi.updateConsultation(id, 'ACCEPT');
                            setSolarConsultation(c);
                            setShowCustomerContact(true);
                          } catch (e: any) { Alert.alert('Error', e.message); }
                          finally { setConsultationBusy(false); }
                        }}
                      >
                        <Text style={styles.saveBtnText}>Accept Date</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveBtn, { flex: 1, backgroundColor: colors.border }, consultationBusy && styles.saveBtnDisabled]}
                        disabled={consultationBusy}
                        onPress={() => { setCounterDate(new Date(solarConsultation.customerProposedDate)); setShowCounterDatePicker(true); }}
                      >
                        <Text style={[styles.saveBtnText, { color: colors.slate }]}>Propose New Date</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : solarConsultation.status === 'VENDOR_COUNTER' ? (
                  <View style={[styles.progressCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                    <Text style={[styles.progressLabel, { color: '#92400e' }]}>New Date Proposed</Text>
                    <Text style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>
                      Your date: {new Date(solarConsultation.vendorProposedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>Waiting for customer to confirm...</Text>
                  </View>
                ) : solarConsultation.status === 'CONFIRMED' ? (
                  <>
                    <View style={[styles.progressCard, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
                      <Text style={[styles.progressLabel, { color: '#059669' }]}>✓ Site Visit Confirmed</Text>
                      <Text style={{ fontSize: 13, color: '#065f46', marginTop: 4 }}>
                        {new Date(solarConsultation.confirmedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={[styles.progressCard, { backgroundColor: colors.mist, borderColor: colors.lanternDeep }]}>
                      <Text style={styles.progressLabel}>Customer Contact</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.lanternDeep, marginTop: 4 }}>{job.customer?.firstName} {job.customer?.lastName}</Text>
                      {job.customer?.phone && <Text style={{ fontSize: 14, color: colors.slate }}>{job.customer.phone}</Text>}
                      {job.customer?.email && <Text style={{ fontSize: 14, color: colors.slate }}>{job.customer.email}</Text>}
                    </View>
                  </>
                ) : solarConsultation.status === 'DECLINED' ? (
                  <View style={[styles.progressCard, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
                    <Text style={[styles.progressLabel, { color: '#dc2626' }]}>Customer Declined</Text>
                    <Text style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4 }}>The customer has declined the consultation. This request is now closed.</Text>
                  </View>
                ) : null}

                {/* Counter date picker */}
                {showCounterDatePicker && (
                  <Modal visible transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={styles.pickerCard}>
                        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Propose New Date</Text>
                        <DateTimeField value={counterDate} onChange={setCounterDate} />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: colors.border }]} onPress={() => setShowCounterDatePicker(false)}>
                            <Text style={[styles.saveBtnText, { color: colors.slate }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.saveBtn, { flex: 1 }, consultationBusy && styles.saveBtnDisabled]}
                            disabled={consultationBusy}
                            onPress={async () => {
                              setConsultationBusy(true);
                              try {
                                const c: any = await requestsApi.updateConsultation(id, 'COUNTER', counterDate.toISOString());
                                setSolarConsultation(c);
                                setShowCounterDatePicker(false);
                              } catch (e: any) { Alert.alert('Error', e.message); }
                              finally { setConsultationBusy(false); }
                            }}
                          >
                            <Text style={styles.saveBtnText}>Send Proposal</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </>
            )}
          </View>
        )}

        {canReschedule && (serviceKey !== 'solar' || solarConsultationConfirmed) && (
          <TouchableOpacity style={styles.rescheduleBtn}
            onPress={() => { setNewDate(job.scheduledDate ? new Date(job.scheduledDate) : new Date()); setRescheduleModal(true); }}>
            <Text style={styles.rescheduleBtnText}>{serviceKey === 'solar' ? 'Reschedule Consultation' : 'Reschedule Visit'}</Text>
          </TouchableOpacity>
        )}

        {canReleaseJob && (
          <TouchableOpacity style={styles.releaseJobBtn} onPress={handleReleaseJob} disabled={releasingJob}>
            <Text style={styles.releaseJobBtnText}>{releasingJob ? 'Releasing…' : "Can't Make It"}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.chatBtn}
          onPress={() => router.push(`/chat/${id}?recipientId=${job.customerId}&recipientName=${job.customer ? job.customer.firstName : 'Customer'}`)}>
          <Text style={styles.chatBtnText}>💬 Message Customer</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Task entry modal ── */}
      <Modal visible={taskModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
            <View style={[styles.modal, { maxHeight: '94%' }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={[styles.modalTitle, { flex: 1 }]}>{activeTask?.label}</Text>
                  <TouchableOpacity onPress={() => setTaskModalVisible(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={colors.steel} />
                  </TouchableOpacity>
                </View>
                {activeTask?.description && (
                  <Text style={styles.taskDescText}>{activeTask.description}</Text>
                )}

                {/* Status selection — tapping OK auto-saves and closes */}
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.statusGrid}>
                  {TASK_STATUS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.statusBtn,
                        { borderColor: opt.border, backgroundColor: taskStatus === opt.key ? opt.bg : '#fff' },
                      ]}
                      onPress={() => {
                        setTaskStatus(opt.key);
                        if (opt.key === 'OK') quickSaveOK(activeTask);
                      }}
                    >
                      <View style={[styles.statusDot, { backgroundColor: opt.color }]} />
                      <Text style={[styles.statusBtnText, taskStatus === opt.key && { color: opt.color, fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                      {taskStatus === opt.key && <Ionicons name="checkmark-circle" size={16} color={opt.color} />}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Static prompt fields */}
                {activeTask?.promptFields?.length > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>Checklist Details</Text>
                    {activeTask.promptFields.map((field: any) => (
                      <PromptField
                        key={field.key}
                        field={field}
                        value={taskStructured[field.key]}
                        onChange={(v) => setTaskStructured((prev) => ({ ...prev, [field.key]: v }))}
                        readOnly={false}
                      />
                    ))}
                  </>
                )}

                {/* Dynamic groups (e.g. per-AC-unit, per-toilet, per-sink) */}
                {activeTask?.dynamicGroups && (() => {
                  const dg = activeTask.dynamicGroups;
                  const count = Math.min(parseInt(taskStructured[dg.countKey]) || 0, 10);
                  if (count <= 0) return null;
                  return (
                    <>
                      {Array.from({ length: count }, (_, i) => {
                        const gNum = i + 1;
                        const gPrefix = `${dg.prefix}_${gNum}`;
                        return (
                          <View key={gPrefix} style={styles.dynamicGroup}>
                            <Text style={styles.dynamicGroupLabel}>{dg.label} {gNum}</Text>
                            {dg.fields.map((field: any) => {
                              const fKey = `${gPrefix}_${field.key}`;
                              const fieldNode = (
                                <PromptField
                                  key={fKey}
                                  field={{ ...field, key: fKey }}
                                  value={taskStructured[fKey]}
                                  onChange={(v) => setTaskStructured((prev) => ({ ...prev, [fKey]: v }))}
                                  readOnly={false}
                                />
                              );
                              // After rendering the sub-count field, render sub-groups
                              if (dg.subGroups && field.key === dg.subGroups.countKey) {
                                const sg = dg.subGroups;
                                const subCount = Math.min(parseInt(taskStructured[fKey]) || 0, 20);
                                return (
                                  <View key={fKey + '_wrap'}>
                                    {fieldNode}
                                    {subCount > 0 && Array.from({ length: subCount }, (__, j) => {
                                      const sNum = j + 1;
                                      const sPrefix = `${gPrefix}_${sg.prefix}_${sNum}`;
                                      return (
                                        <View key={sPrefix} style={styles.subGroup}>
                                          <Text style={styles.subGroupLabel}>{sg.label} {sNum}</Text>
                                          {sg.fields.map((sf: any) => {
                                            const sfKey = `${sPrefix}_${sf.key}`;
                                            return (
                                              <PromptField
                                                key={sfKey}
                                                field={{ ...sf, key: sfKey }}
                                                value={taskStructured[sfKey]}
                                                onChange={(v) => setTaskStructured((prev) => ({ ...prev, [sfKey]: v }))}
                                                readOnly={false}
                                              />
                                            );
                                          })}
                                        </View>
                                      );
                                    })}
                                  </View>
                                );
                              }
                              return fieldNode;
                            })}
                          </View>
                        );
                      })}
                    </>
                  );
                })()}

                {/* Findings note */}
                <Text style={styles.fieldLabel}>Findings / Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe what you found or performed..."
                  placeholderTextColor={colors.steel}
                  value={taskFindings}
                  onChangeText={setTaskFindings}
                  multiline
                />

                {/* Photos */}
                <Text style={styles.fieldLabel}>
                  Photos {taskStatus && taskStatus !== 'OK' && <Text style={styles.required}>* required</Text>}
                </Text>
                <PhotoStrip
                  photos={taskPhotos}
                  onAdd={() => pickAndUpload('tasks', taskPhotos, setTaskPhotos, setUploadingTaskPhoto, 5)}
                  onRemove={(i) => setTaskPhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingTaskPhoto}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, (!taskStatus || savingTask) && styles.saveBtnDisabled]}
                  onPress={saveTask}
                  disabled={!taskStatus || savingTask}
                >
                  {savingTask
                    ? <ActivityIndicator color={colors.ink} />
                    : <Text style={styles.saveBtnText}>Save</Text>}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Upsell modal ── */}
      <Modal visible={upsellModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create a Quote?</Text>
            <Text style={styles.modalSubtitle}>
              This item needs attention. Send the customer a quote to fix it?
            </Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {upsellTask?.catalogLinks?.map((name: string) => {
                const item = catalogItems.find((c) => c.name === name);
                if (!item) return null;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.recOption, upsellSelectedId === item.id && styles.recOptionSelected]}
                    onPress={() => { setUpsellSelectedId(item.id); setUpsellCustomName(''); setUpsellCustomPrice(''); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recOptionName}>{item.name}</Text>
                      <Text style={styles.recOptionPrices}>{item.priceDisplay || fmtUSD(item.basePrice)}</Text>
                    </View>
                    {upsellSelectedId === item.id && <Ionicons name="checkmark-circle" size={20} color={colors.lanternDeep} />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.recOption, upsellSelectedId === 'other' && styles.recOptionSelected]}
                onPress={() => setUpsellSelectedId('other')}
              >
                <Text style={styles.recOptionName}>Custom recommendation</Text>
                {upsellSelectedId === 'other' && <Ionicons name="checkmark-circle" size={20} color={colors.lanternDeep} />}
              </TouchableOpacity>
              {upsellSelectedId === 'other' && (
                <View style={{ marginTop: 8 }}>
                  <TextInput style={styles.input} placeholder="Service name" placeholderTextColor={colors.steel}
                    value={upsellCustomName} onChangeText={setUpsellCustomName} />
                  <TextInput style={styles.input} placeholder="e.g. $1,200" placeholderTextColor={colors.steel}
                    keyboardType="decimal-pad" value={upsellCustomPrice} onChangeText={(v) => setUpsellCustomPrice(formatCurrencyInput(v))} />
                </View>
              )}
            </ScrollView>
            {upsellSelectedId && (
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#7c3aed', marginTop: 12 }]}
                onPress={sendUpsell} disabled={sendingUpsell}>
                {sendingUpsell ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveBtnText}>Send Quote to Customer</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setUpsellModalVisible(false)}>
              <Text style={styles.cancelText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reschedule modal */}
      <Modal visible={rescheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reschedule Visit</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16 },
  customerBox: { backgroundColor: colors.ink, borderRadius: 16, padding: 20, marginBottom: 12 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  jobTitle: { fontSize: 19, fontWeight: '800', color: colors.mist, marginBottom: 4 },
  jobDescription: { fontSize: 13, color: '#c8e6c0', marginBottom: 6 },
  customerName: { fontSize: 18, fontWeight: '700', color: colors.mist, marginBottom: 4 },
  customerAddress: { fontSize: 14, color: '#c8e6c0', marginBottom: 2 },
  customerCity: { fontSize: 14, color: '#c8e6c0', marginBottom: 8 },
  customerNotes: { fontSize: 13, color: '#a8d5a2', fontStyle: 'italic' },
  requestedServicesBox: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 10 },
  requestedServicesLabel: { fontSize: 11, color: '#a8d5a2', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  requestedServicesLine: { fontSize: 13, color: '#fff', lineHeight: 20 },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  scheduledLabel: { fontSize: 13, fontWeight: '600', color: colors.steel },
  scheduledDate: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep, flex: 1 },
  pendingReviewBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fffbeb', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#fde68a' },
  pendingReviewTitle: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  pendingReviewBody: { fontSize: 13, color: '#78350f', lineHeight: 19 },
  actionBtn: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  arrivalGateHint: { fontSize: 13, color: colors.steel, textAlign: 'center', marginTop: -8, marginBottom: 12 },
  completedBadge: { backgroundColor: '#c6f6d5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  completedText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 16 },
  progressCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: colors.slate },
  progressCount: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.lanternDeep, borderRadius: 99 },
  progressHint: { fontSize: 12, color: colors.steel, marginTop: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 10, marginTop: 12, marginBottom: 4 },
  groupHeaderText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sectionBadge: { backgroundColor: colors.border, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  sectionBadgeDone: { backgroundColor: '#dcfce7' },
  sectionBadgeText: { fontSize: 12, fontWeight: '700', color: colors.steel },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, flex: 1 },
  taskList: { borderTopWidth: 1, borderTopColor: colors.border },
  taskRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  taskRowLabel: { fontSize: 14, color: colors.slate, lineHeight: 20, marginBottom: 4 },
  taskStatusPill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  taskStatusPillText: { fontSize: 11, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.slate, marginBottom: 8, marginTop: 12 },
  taskDescText: { fontSize: 13, color: colors.steel, lineHeight: 19, marginBottom: 4 },
  statusGrid: { gap: 6 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, borderWidth: 1.5 },
  statusDot: { width: 8, height: 8, borderRadius: 99 },
  statusBtnText: { fontSize: 14, color: colors.slate, flex: 1 },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  promptLabel: { fontSize: 13, color: colors.slate, flex: 1, paddingRight: 8 },
  promptInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 13, color: colors.ink, minWidth: 100, textAlign: 'right' },
  generalNotesInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.ink, minHeight: 72, textAlignVertical: 'top',
  },
  selectChip: { backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  selectChipActive: { backgroundColor: colors.mist, borderColor: colors.lanternDeep },
  selectChipText: { fontSize: 11, color: colors.steel, fontWeight: '600' },
  selectChipTextActive: { color: colors.lanternDeep },
  dynamicGroup: { backgroundColor: colors.mist, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#b7d5ce' },
  dynamicGroupLabel: { fontSize: 13, fontWeight: '800', color: colors.lanternDeep, marginBottom: 8 },
  subGroup: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  subGroupLabel: { fontSize: 12, fontWeight: '700', color: colors.steel, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4, marginTop: 16 },
  sectionHint: { fontSize: 13, color: colors.steel, marginBottom: 12 },
  photoLabel: { fontSize: 13, fontWeight: '600', color: colors.slate, marginBottom: 6 },
  required: { color: '#c53030' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10, color: colors.ink },
  textArea: { height: 90, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnDisabled: { backgroundColor: colors.steel },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  completeSeparator: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
  completeBtn: { flexDirection: 'row', backgroundColor: '#059669', borderRadius: 14, padding: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  qtyConfirmRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  qtyConfirmName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  qtyConfirmHint: { fontSize: 12, color: colors.steel, marginTop: 2 },
  qtyConfirmInput: {
    width: 70, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, padding: 10, fontSize: 15, color: colors.ink, textAlign: 'center',
  },
  sentSvcCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1.5 },
  sentSvcApproved: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  sentSvcPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  sentSvcName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  sentSvcPrice: { fontSize: 13, color: colors.steel, marginTop: 2 },
  sentSvcBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeOrange: { backgroundColor: '#fef3c7' },
  sentSvcBadgeText: { fontSize: 12, fontWeight: '700' },
  solarCard: { marginBottom: 8 },
  recOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#f8fafc' },
  recOptionSelected: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  recOptionName: { fontSize: 14, fontWeight: '600', color: colors.ink, flex: 1 },
  recOptionPrices: { fontSize: 12, color: colors.steel, marginTop: 2 },
  rescheduleBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 10, borderWidth: 1.5, borderColor: colors.lanternDeep },
  rescheduleBtnText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 15 },
  releaseJobBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#dc2626' },
  releaseJobBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 32 },
  chatBtnText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: colors.steel, marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateBtnText: { fontSize: 15, color: colors.ink, fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel },
});

