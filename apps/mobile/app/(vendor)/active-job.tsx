import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Platform, Image,
  KeyboardAvoidingView, Switch, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, pricingApi, uploadsApi, yolinkApi } from '../../src/services/api';
import { enqueueTaskResult, flushQueue } from '../../src/services/taskQueue';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

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

const EQUIP_COLS = [
  { key: 'make', label: 'Make/Brand' },
  { key: 'model_num', label: 'Model #' },
  { key: 'serial_num', label: 'Serial #' },
  { key: 'install_year', label: 'Install Year' },
];

const HVAC_SECTIONS = [
  {
    key: 'system_id', num: 1, title: 'System Identification',
    infoFields: [
      { key: 'equipment_location', label: 'Equipment Location', type: 'text', placeholder: 'e.g. Basement, attic' },
      { key: 'unit_age', label: 'Unit Age (years)', type: 'number', placeholder: 'e.g. 8' },
      { key: 'warranty_status', label: 'Warranty Status', type: 'select', options: ['Under warranty', 'Out of warranty', 'Unknown'] },
      { key: 'service_history', label: 'Service History / Notes', type: 'textarea', placeholder: 'Prior service records...' },
    ],
    equipmentRows: [
      { key: 'air_handler', label: 'Air Handler / Furnace' },
      { key: 'condenser', label: 'Condenser / Heat Pump' },
      { key: 'thermostat', label: 'Thermostat' },
      { key: 'humidifier', label: 'Humidifier / Dehumidifier' },
    ],
    checks: [] as { key: string; label: string }[],
  },
  {
    key: 'thermostat_ctrl', num: 2, title: 'Thermostat & Controls',
    infoFields: [
      { key: 'type', label: 'Thermostat Type', type: 'select', options: ['Manual', 'Programmable', 'Smart/WiFi'] },
      { key: 'brand_model', label: 'Brand / Model', type: 'text', placeholder: 'e.g. Ecobee SmartThermostat' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Main hallway' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'display', label: 'Thermostat display functional' },
      { key: 'temp_response', label: 'Temperature setting responds correctly' },
      { key: 'heat_mode', label: 'Heating mode tested' },
      { key: 'cool_mode', label: 'Cooling mode tested' },
      { key: 'fan_mode', label: 'Fan mode tested (Auto/On)' },
      { key: 'schedule', label: 'Schedule / programming verified' },
      { key: 'smart_features', label: 'Smart features connected (if applicable)' },
      { key: 'wiring', label: 'Wiring connections secure' },
    ],
  },
  {
    key: 'air_filter', num: 3, title: 'Air Filter & Airflow',
    infoFields: [
      { key: 'filter_size', label: 'Filter Size', type: 'text', placeholder: 'e.g. 16x20x1' },
      { key: 'filter_type', label: 'Filter Type', type: 'text', placeholder: 'e.g. Pleated, HEPA' },
      { key: 'filter_merv', label: 'MERV Rating', type: 'number', placeholder: 'e.g. 8' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'filter_clean', label: 'Filter in clean / acceptable condition' },
      { key: 'airflow_normal', label: 'Airflow normal — no restriction' },
      { key: 'filter_access', label: 'Filter slot accessible and sealed' },
      { key: 'return_air', label: 'Return air registers unobstructed' },
    ],
  },
  {
    key: 'heating', num: 4, title: 'Heating System',
    infoFields: [
      { key: 'fuel_type', label: 'Fuel Type', type: 'select', options: ['Natural gas', 'Propane', 'Electric', 'Heat pump', 'Oil'] },
      { key: 'temp_rise', label: 'Temperature Rise', type: 'text', placeholder: 'e.g. 45°F (normal 35–70°F)' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'heat_exchanger', label: 'Heat exchanger — no cracks or corrosion' },
      { key: 'burner_flame', label: 'Burner flame — blue, stable (N/A: heat pump)' },
      { key: 'ignition', label: 'Ignition sequence normal' },
      { key: 'flue_venting', label: 'Flue / venting — no damage or improper clearance' },
      { key: 'gas_valve', label: 'Gas valve and supply line — no corrosion or leaks' },
      { key: 'blower_operation', label: 'Blower operates normally — no noise' },
      { key: 'combustion_residue', label: 'No soot or scorch marks observed' },
    ],
  },
  {
    key: 'cooling', num: 5, title: 'Cooling System',
    infoFields: [
      { key: 'refrigerant_type', label: 'Refrigerant Type', type: 'select', options: ['R-22', 'R-410A', 'R-32', 'Unknown'] },
      { key: 'temp_diff', label: 'Temperature Differential', type: 'text', placeholder: 'e.g. 18°F (normal 14–22°F)' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'condenser_unit', label: 'Condenser unit — clean, no damage' },
      { key: 'evap_coil', label: 'Evaporator coil — clean, no frost' },
      { key: 'compressor_op', label: 'Compressor operates normally' },
      { key: 'refrigerant_level', label: 'Refrigerant level — normal (no signs of leak)' },
      { key: 'line_insulation', label: 'Refrigerant line insulation — intact' },
      { key: 'condenser_fan', label: 'Condenser fan operates normally' },
    ],
  },
  {
    key: 'electrical', num: 6, title: 'Electrical System',
    infoFields: [
      { key: 'voltage', label: 'Voltage Reading', type: 'text', placeholder: 'e.g. 240V' },
      { key: 'amperage', label: 'Amperage Reading', type: 'text', placeholder: 'e.g. 14A' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'wiring_condition', label: 'Wiring — no loose connections or corrosion' },
      { key: 'disconnect_box', label: 'Disconnect box accessible and in good condition' },
      { key: 'breaker_sizing', label: 'Breaker correctly sized for equipment' },
      { key: 'safety_switches', label: 'Safety shutoffs functional' },
      { key: 'control_board', label: 'Control board — no error codes or burn marks' },
    ],
  },
  {
    key: 'ductwork', num: 7, title: 'Air Distribution & Ductwork',
    infoFields: [
      { key: 'duct_material', label: 'Duct Material', type: 'select', options: ['Flex duct', 'Sheet metal', 'Fiberglass board', 'Mixed'] },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'duct_condition', label: 'Ducts — no significant leakage or disconnection' },
      { key: 'duct_insulation', label: 'Duct insulation intact in unconditioned areas' },
      { key: 'airflow_balance', label: 'Supply / return balance acceptable' },
      { key: 'supply_registers', label: 'Supply registers unobstructed and functional' },
      { key: 'duct_noise', label: 'No unusual duct noise or vibration' },
    ],
  },
  {
    key: 'condensate', num: 8, title: 'Condensate Management',
    infoFields: [] as { key: string; label: string; type: string; placeholder?: string; options?: string[] }[],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'drain_line', label: 'Condensate drain line — clear, draining properly' },
      { key: 'condensate_pump', label: 'Condensate pump functional (if present)' },
      { key: 'drip_pan', label: 'Drip pan — clean, no rust or standing water' },
      { key: 'safety_float', label: 'Safety float switch installed and functional' },
    ],
  },
  {
    key: 'safety', num: 9, title: 'Safety & Compliance',
    infoFields: [
      { key: 'emergency_shutoff', label: 'Emergency Shutoff Location', type: 'text', placeholder: 'Describe location' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'co_detector', label: 'CO detector present near equipment' },
      { key: 'high_limit', label: 'High-limit safety controls functional' },
      { key: 'clearances', label: 'Equipment clearances adequate' },
      { key: 'combustion_air', label: 'Combustion air supply adequate (N/A: electric)' },
      { key: 'pressure_relief', label: 'Pressure relief devices in place' },
    ],
  },
  {
    key: 'performance', num: 10, title: 'Operational Performance',
    infoFields: [
      { key: 'summary_notes', label: 'Defects & Findings Summary', type: 'textarea', placeholder: 'Summarize all findings...' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [
      { key: 'heating_cycle', label: 'Heating cycle completes normally' },
      { key: 'cooling_cycle', label: 'Cooling cycle completes normally' },
      { key: 'noise_level', label: 'System noise — within normal range' },
      { key: 'no_odors', label: 'No unusual odors during operation' },
      { key: 'system_functional', label: 'System fully functional at time of inspection' },
    ],
  },
  {
    key: 'photos', num: 11, title: 'Photo Documentation',
    infoFields: [
      { key: 'photo_notes', label: 'Photo Notes', type: 'textarea', placeholder: 'Describe what each photo shows (data plate, filter, heat exchanger, condenser, electrical, ductwork issues)' },
    ],
    equipmentRows: [] as { key: string; label: string }[],
    checks: [] as { key: string; label: string }[],
  },
];

function getServiceKey(job: any): 'inspection' | 'gutters' | 'solar' | 'hvac' | 'other' {
  const name = (job.additionalServices?.[0]?.name || '').toLowerCase();
  if (name.includes('gutter')) return 'gutters';
  if (name.includes('hvac') || name.includes('heating') || name.includes('air conditioning') || name.includes('furnace')) return 'hvac';
  if (job.type === 'SCHEDULED_INSPECTION') return 'inspection';
  if (name.includes('inspection')) return 'inspection';
  if (name.includes('solar')) return 'solar';
  return 'other';
}

const TASK_STATUS_OPTIONS = [
  { key: 'OK', label: 'OK', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
  { key: 'NEEDS_ATTENTION', label: 'Needs Attention', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'URGENT', label: 'Urgent', color: '#dc2626', bg: '#fff5f5', border: '#fca5a5' },
  { key: 'NOT_ACCESSIBLE', label: 'Not Accessible', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
];

function PhotoStrip({
  photos, onAdd, onRemove, maxPhotos = 5, uploading, readOnly = false,
}: {
  photos: { uri: string; key?: string }[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  maxPhotos?: number;
  uploading: boolean;
  readOnly?: boolean;
}) {
  return (
    <View style={ps.row}>
      {photos.map((p, i) => (
        <View key={i} style={ps.thumb}>
          <Image source={{ uri: p.uri }} style={ps.img} />
          {!readOnly && (
            <TouchableOpacity style={ps.removeBtn} onPress={() => onRemove(i)}>
              <Ionicons name="close-circle" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {!p.key && <ActivityIndicator style={ps.spinner} size="small" color="#fff" />}
        </View>
      ))}
      {!readOnly && photos.length < maxPhotos && (
        <TouchableOpacity style={ps.addBtn} onPress={onAdd} disabled={uploading}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.lanternDeep} />
            : <><Ionicons name="camera" size={22} color={colors.lanternDeep} /><Text style={ps.addText}>Photo</Text></>}
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

  // HVAC inspection report
  const [hvacData, setHvacData] = useState<Record<string, string>>({});
  const [hvacActiveTab, setHvacActiveTab] = useState('system_id');
  const [hvacSaved, setHvacSaved] = useState(false);
  const [savingHvac, setSavingHvac] = useState(false);
  const [hvacRecNotes, setHvacRecNotes] = useState('');
  const [hvacRecPrice, setHvacRecPrice] = useState('');
  const [sendingHvacRec, setSendingHvacRec] = useState(false);

  // Location tracking
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Status advance guard
  const [advancingStatus, setAdvancingStatus] = useState(false);

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
      inspectionsApi.getChecklist().catch(() => []),
      inspectionsApi.getTasks(id).catch(() => []),
      inspectionsApi.getProgress(id).catch(() => null),
    ]);
    setChecklist((cl as any[]) || []);
    const map: Record<string, any> = {};
    for (const r of ((results as any[]) || [])) map[r.taskKey] = r;
    setTaskResults(map);
    setProgress((prog as any) || null);
    const hvacTask = (results as any[])?.find((r) => r.taskKey === 'hvac_report');
    if (hvacTask?.structuredData) { setHvacData(hvacTask.structuredData); setHvacSaved(true); }
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

  const openTask = (task: any) => {
    if (isCompleted) return; // submitted inspections are locked
    const existing = taskResults[task.key];
    setActiveTask(task);
    setTaskStatus(existing?.status || '');
    setTaskFindings(existing?.findings || '');
    setTaskStructured(existing?.structuredData || {});
    setTaskPhotos(existing?.photoUrls?.map((u: string) => ({ uri: u, key: '_saved' })) || []);
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
      description = `Recommendation from inspection task: ${upsellTask?.label}`;
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
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await requestsApi.updateLocation(id, loc.coords.latitude, loc.coords.longitude).catch(() => {});
        locationIntervalRef.current = setInterval(async () => {
          try {
            const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            await requestsApi.updateLocation(id, l.coords.latitude, l.coords.longitude);
          } catch {}
        }, 90000);
      } catch {}
    }

    if (next.next === 'IN_PROGRESS' && locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
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
    if (job && getServiceKey(job) === 'hvac' && !hvacSaved) {
      Alert.alert('HVAC Report required', 'Please save the HVAC inspection report before completing the job.');
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
  const showInspectionChecklist = showChecklist && serviceKey === 'inspection';
  const showGutterChecklist = showChecklist && serviceKey === 'gutters';
  const showHvacForm = showChecklist && serviceKey === 'hvac';
  const showSolarPanel = serviceKey === 'solar';

  const completedCount = progress?.completed ?? 0;
  const totalCount = progress?.total ?? 0;
  const checklistFraction = totalCount > 0 ? completedCount / totalCount : 0;
  const checklistReady = totalCount > 0 && completedCount >= totalCount;

  const gutterCompletedCount = showGutterChecklist
    ? GUTTER_CHECKLIST.filter((t) => !!taskResults[t.key]).length
    : 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Job header */}
        <View style={styles.customerBox}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.customerLabel}>{isService ? 'Service Request' : 'Inspection'}</Text>
            {job.ticketNumber && <Text style={{ fontSize: 11, color: '#a8d5a2', fontFamily: 'monospace' }}>{job.ticketNumber}</Text>}
          </View>
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
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: advancingStatus ? colors.steel : nextAction.color }]}
            onPress={advanceStatus}
            disabled={advancingStatus}
          >
            {advancingStatus
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.actionBtnText}>{nextAction.label}</Text>
            }
          </TouchableOpacity>
        )}

        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>✓ Job Completed</Text>
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
                ? <Text style={[styles.progressHint, { color: '#059669' }]}>Inspection submitted — results are locked</Text>
                : !checklistReady && <Text style={styles.progressHint}>Complete all items to close the job</Text>
              }
            </View>

            {checklist.map((section: any) => {
              const secProg = progress?.sections?.find((s: any) => s.key === section.key);
              const expanded = expandedSections.has(section.key);
              const sectionDone = secProg?.completed ?? 0;
              const sectionTotal = secProg?.total ?? section.tasks?.length ?? 0;
              const allDone = sectionDone >= sectionTotal;
              return (
                <View key={section.key} style={styles.sectionCard}>
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

        {/* ── HVAC Inspection Form ── */}
        {showHvacForm && (
          <>
            <View style={styles.completeSeparator} />
            <Text style={styles.sectionTitle}>HVAC Inspection Report</Text>
            {hvacSaved
              ? <Text style={[styles.sectionHint, { color: '#059669' }]}>✓ Report saved. You can update and re-save at any time.</Text>
              : <Text style={styles.sectionHint}>Complete all sections and tap Save Report when done.</Text>
            }

            {/* Section tab bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={hvacSt.tabBar} contentContainerStyle={{ paddingVertical: 4, gap: 8 }}>
              {HVAC_SECTIONS.map((sec) => (
                <TouchableOpacity
                  key={sec.key}
                  style={[hvacSt.tab, hvacActiveTab === sec.key && hvacSt.tabActive]}
                  onPress={() => setHvacActiveTab(sec.key)}
                >
                  <Text style={[hvacSt.tabText, hvacActiveTab === sec.key && hvacSt.tabTextActive]}>{sec.num}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {HVAC_SECTIONS.map((section) => {
              if (section.key !== hvacActiveTab) return null;
              return (
                <View key={section.key}>
                  {/* Dark navy header with orange badge */}
                  <View style={hvacSt.secHeader}>
                    <View style={hvacSt.badge}><Text style={hvacSt.badgeText}>{section.num}</Text></View>
                    <Text style={hvacSt.secTitle}>{section.title}</Text>
                  </View>

                  {/* Equipment table (System ID section only) */}
                  {section.equipmentRows.length > 0 && (
                    <View style={hvacSt.tableWrap}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                        <View>
                          <View style={hvacSt.tableHeaderRow}>
                            <View style={[hvacSt.tableFirstCol, { backgroundColor: colors.slate }]}>
                              <Text style={hvacSt.tableHeaderText}>Equipment</Text>
                            </View>
                            {EQUIP_COLS.map((col) => (
                              <View key={col.key} style={[hvacSt.tableCol, { backgroundColor: colors.slate }]}>
                                <Text style={hvacSt.tableHeaderText}>{col.label}</Text>
                              </View>
                            ))}
                          </View>
                          {section.equipmentRows.map((row, rIdx) => (
                            <View key={row.key} style={[hvacSt.tableDataRow, rIdx % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                              <View style={hvacSt.tableFirstCol}>
                                <Text style={hvacSt.tableRowLabelText}>{row.label}</Text>
                              </View>
                              {EQUIP_COLS.map((col) => {
                                const fKey = `equip_${row.key}_${col.key}`;
                                return (
                                  <View key={col.key} style={hvacSt.tableCol}>
                                    <TextInput
                                      style={hvacSt.tableCellInput}
                                      placeholder="—"
                                      placeholderTextColor="#cbd5e0"
                                      value={hvacData[fKey] || ''}
                                      onChangeText={(v) => setHvacData((p) => ({ ...p, [fKey]: v }))}
                                    />
                                  </View>
                                );
                              })}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Info fields */}
                  {section.infoFields.map((field) => {
                    const fKey = section.key + '_' + field.key;
                    const val = hvacData[fKey] || '';
                    return (
                      <View key={fKey} style={hvacSt.fieldBlock}>
                        <Text style={hvacSt.fieldLabel}>{field.label}</Text>
                        {(field as any).type === 'select' ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {((field as any).options || []).map((opt: string) => (
                              <TouchableOpacity
                                key={opt}
                                style={[hvacSt.chip, val === opt && hvacSt.chipActive]}
                                onPress={() => setHvacData((p) => ({ ...p, [fKey]: opt }))}
                              >
                                <Text style={[hvacSt.chipText, val === opt && hvacSt.chipTextActive]}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <TextInput
                            style={[(field as any).type === 'textarea' ? hvacSt.textArea : hvacSt.textInput]}
                            placeholder={(field as any).placeholder || ''}
                            placeholderTextColor={colors.steel}
                            keyboardType={(field as any).type === 'number' ? 'decimal-pad' : 'default'}
                            multiline={(field as any).type === 'textarea'}
                            numberOfLines={(field as any).type === 'textarea' ? 3 : 1}
                            value={val}
                            onChangeText={(v) => setHvacData((p) => ({ ...p, [fKey]: v }))}
                          />
                        )}
                      </View>
                    );
                  })}

                  {/* Check items with PASS / FAIL / N/A */}
                  {section.checks.length > 0 && (
                    <View style={hvacSt.checksCard}>
                      {section.checks.map((check, cIdx) => {
                        const statusKey = section.key + '_' + check.key + '_status';
                        const notesKey = section.key + '_' + check.key + '_notes';
                        const status = hvacData[statusKey] || '';
                        const notes = hvacData[notesKey] || '';
                        return (
                          <View key={check.key} style={[hvacSt.checkRow, cIdx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                            <Text style={hvacSt.checkLabel}>{check.label}</Text>
                            <View style={hvacSt.checkControls}>
                              {(['PASS', 'FAIL', 'N/A'] as const).map((opt) => (
                                <TouchableOpacity
                                  key={opt}
                                  style={[
                                    hvacSt.pfnBtn,
                                    opt === 'PASS' && status === opt && hvacSt.pfnPass,
                                    opt === 'FAIL' && status === opt && hvacSt.pfnFail,
                                    opt === 'N/A' && status === opt && hvacSt.pfnNA,
                                  ]}
                                  onPress={() => setHvacData((p) => ({ ...p, [statusKey]: opt }))}
                                >
                                  <Text style={[hvacSt.pfnText, status === opt && { color: '#fff' }]}>{opt}</Text>
                                </TouchableOpacity>
                              ))}
                              <TextInput
                                style={hvacSt.checkNotes}
                                placeholder="Notes..."
                                placeholderTextColor={colors.steel}
                                value={notes}
                                onChangeText={(v) => setHvacData((p) => ({ ...p, [notesKey]: v }))}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Prev / Next navigation */}
                  <View style={hvacSt.navRow}>
                    {section.num > 1 && (
                      <TouchableOpacity style={hvacSt.navBtnPrev} onPress={() => setHvacActiveTab(HVAC_SECTIONS[section.num - 2].key)}>
                        <Text style={hvacSt.navPrevText}>← Previous</Text>
                      </TouchableOpacity>
                    )}
                    {section.num < HVAC_SECTIONS.length && (
                      <TouchableOpacity style={hvacSt.navBtnNext} onPress={() => setHvacActiveTab(HVAC_SECTIONS[section.num].key)}>
                        <Text style={hvacSt.navNextText}>Next →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Recommended Actions */}
            <View style={[styles.sectionCard, { marginBottom: 8 }]}>
              <Text style={[styles.sectionLabel, { paddingLeft: 4, paddingBottom: 8 }]}>Recommended Actions</Text>
              <Text style={styles.fieldLabel}>Recommendation Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe recommended repairs or replacements..."
                placeholderTextColor={colors.steel}
                multiline
                numberOfLines={3}
                value={hvacRecNotes}
                onChangeText={setHvacRecNotes}
              />
              <Text style={styles.fieldLabel}>Estimated Price ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. $850"
                placeholderTextColor={colors.steel}
                keyboardType="decimal-pad"
                value={hvacRecPrice}
                onChangeText={(v) => setHvacRecPrice(formatCurrencyInput(v))}
              />
              {hvacRecNotes.trim() && hvacRecPrice.trim() && (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#7c3aed', marginTop: 4 }, sendingHvacRec && styles.saveBtnDisabled]}
                  disabled={sendingHvacRec}
                  onPress={async () => {
                    const price = parseCurrencyRaw(hvacRecPrice);
                    if (isNaN(price) || price < 0) { Alert.alert('Invalid price', 'Enter a valid amount (0 or more).'); return; }
                    setSendingHvacRec(true);
                    try {
                      await requestsApi.recommendService(id, { name: 'HVAC Recommended Service', description: hvacRecNotes.trim(), price });
                      setHvacRecNotes('');
                      setHvacRecPrice('');
                      Alert.alert('Sent', 'Recommendation sent to customer for approval.');
                      loadJob();
                    } catch (e: any) { Alert.alert('Error', e.message); }
                    finally { setSendingHvacRec(false); }
                  }}
                >
                  {sendingHvacRec ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveBtnText}>Send to Customer</Text>}
                </TouchableOpacity>
              )}
            </View>

            {/* Save report button */}
            <TouchableOpacity
              style={[styles.saveBtn, savingHvac && styles.saveBtnDisabled]}
              disabled={savingHvac}
              onPress={async () => {
                setSavingHvac(true);
                const dto = { status: 'OK', structuredData: hvacData };
                try {
                  await inspectionsApi.upsertTask(id, 'hvac_report', dto);
                  setHvacSaved(true);
                  Alert.alert('Saved', 'HVAC inspection report saved.');
                } catch {
                  await enqueueTaskResult(id, 'hvac_report', dto);
                  setHvacSaved(true);
                  Alert.alert('Saved offline', 'Report will sync when connection is restored.');
                } finally { setSavingHvac(false); }
              }}
            >
              {savingHvac ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveBtnText}>Save HVAC Report</Text>}
            </TouchableOpacity>

            {job.status === 'IN_PROGRESS' && (
              <>
                <View style={styles.completeSeparator} />
                <Text style={styles.sectionTitle}>Complete Job</Text>
                <Text style={styles.sectionHint}>
                  {hvacSaved ? 'Attach before/after photos and close the job.' : 'Save the HVAC report first, then attach completion photos.'}
                </Text>
                <Text style={styles.photoLabel}>Completion Photos <Text style={styles.required}>* min 1</Text></Text>
                <PhotoStrip
                  photos={completionPhotos}
                  onAdd={() => pickAndUpload('completion', completionPhotos, setCompletionPhotos, setUploadingCompletion, 5)}
                  onRemove={(i) => setCompletionPhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingCompletion}
                  maxPhotos={5}
                />
                <TouchableOpacity
                  style={[styles.completeBtn, (!hvacSaved || readyKeys(completionPhotos).length === 0 || completingJob) && styles.saveBtnDisabled]}
                  onPress={markComplete}
                  disabled={!hvacSaved || readyKeys(completionPhotos).length === 0 || completingJob}
                >
                  {completingJob ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}> Mark Job Complete</Text></>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Generic service completion ── */}
        {showChecklist && serviceKey === 'other' && (
          <>
            <View style={styles.completeSeparator} />
            <Text style={styles.sectionTitle}>Notes (optional)</Text>
            <Text style={styles.sectionHint}>Visible to the homeowner.</Text>
            <TextInput
              style={styles.generalNotesInput}
              placeholder="Any notes about the work done..."
              placeholderTextColor={colors.steel}
              value={generalNotes}
              onChangeText={setGeneralNotes}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: savingNotes ? colors.steel : colors.lanternDeep, marginTop: 8 }]}
              onPress={saveGeneralNotes}
              disabled={savingNotes}
            >
              <Text style={styles.actionBtnText}>{savingNotes ? 'Saving…' : 'Save Notes'}</Text>
            </TouchableOpacity>

            <View style={styles.completeSeparator} />
            <Text style={styles.sectionTitle}>Complete Job</Text>
            <Text style={styles.sectionHint}>Attach completion photos to close the job.</Text>
            <Text style={styles.photoLabel}>Completion Photos <Text style={styles.required}>* min 1</Text></Text>
            <PhotoStrip
              photos={completionPhotos}
              onAdd={() => pickAndUpload('completion', completionPhotos, setCompletionPhotos, setUploadingCompletion, 5)}
              onRemove={(i) => setCompletionPhotos((p) => p.filter((_, idx) => idx !== i))}
              uploading={uploadingCompletion}
              maxPhotos={5}
            />
            <TouchableOpacity
              style={[styles.completeBtn, (readyKeys(completionPhotos).length === 0 || completingJob) && styles.saveBtnDisabled]}
              onPress={markComplete}
              disabled={readyKeys(completionPhotos).length === 0 || completingJob}
            >
              {completingJob ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}> Mark Job Complete</Text></>}
            </TouchableOpacity>
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
            <Text style={styles.rescheduleBtnText}>{serviceKey === 'solar' ? 'Reschedule Consultation' : 'Reschedule Inspection'}</Text>
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
    </KeyboardAvoidingView>
  );
}

const ps = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  img: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10 },
  spinner: { position: 'absolute', bottom: 4, left: 4 },
  addBtn: { width: 76, height: 76, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lanternDeep, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  addText: { fontSize: 11, color: colors.lanternDeep, marginTop: 2, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16 },
  customerBox: { backgroundColor: colors.ink, borderRadius: 16, padding: 20, marginBottom: 12 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
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
  completedBadge: { backgroundColor: '#c6f6d5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  completedText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 16 },
  progressCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: colors.slate },
  progressCount: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.lanternDeep, borderRadius: 99 },
  progressHint: { fontSize: 12, color: colors.steel, marginTop: 6 },
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

const hvacSt = StyleSheet.create({
  tabBar: { marginBottom: 12 },
  tab: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.steel },
  tabTextActive: { color: colors.mist },
  secHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: 12, padding: 14, marginBottom: 12, gap: 10 },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.lantern, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  secTitle: { fontSize: 15, fontWeight: '700', color: colors.mist, flex: 1 },
  tableWrap: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row' },
  tableDataRow: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  tableFirstCol: { width: 140, padding: 8, justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.slate },
  tableCol: { width: 100, padding: 8, borderRightWidth: 1, borderRightColor: colors.border, justifyContent: 'center' },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: colors.mist },
  tableRowLabelText: { fontSize: 11, fontWeight: '600', color: colors.slate },
  tableCellInput: { fontSize: 12, color: colors.ink, padding: 0, minHeight: 24 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.slate, marginBottom: 6 },
  textInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.ink },
  textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.ink, height: 80, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#f8fafc' },
  chipActive: { backgroundColor: colors.mist, borderColor: colors.lanternDeep },
  chipText: { fontSize: 12, color: colors.steel, fontWeight: '600' },
  chipTextActive: { color: colors.lanternDeep, fontWeight: '700' },
  checksCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  checkRow: { padding: 12 },
  checkLabel: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep, marginBottom: 8 },
  checkControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pfnBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#f8fafc' },
  pfnPass: { backgroundColor: '#059669', borderColor: '#059669' },
  pfnFail: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  pfnNA: { backgroundColor: '#6b7280', borderColor: '#6b7280' },
  pfnText: { fontSize: 11, fontWeight: '700', color: colors.steel },
  checkNotes: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: colors.slate, minHeight: 30 },
  navRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  navBtnPrev: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border },
  navBtnNext: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: colors.lantern },
  navPrevText: { fontSize: 14, fontWeight: '700', color: colors.slate },
  navNextText: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
