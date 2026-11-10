import { useState, ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Platform, ActivityIndicator,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { US_STATES } from '../AddressPicker';
import { colors } from '../../theme';

// Small building blocks shared by the vendor application screens in
// app/(vendor-onboarding).

export const LICENSE_LABEL: Record<string, string> = {
  HVAC: 'HVAC (Mechanical)',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  ROOFING: 'Roofing',
  GENERAL_CONTRACTOR: 'General Contractor',
  NABCEP: 'NABCEP PV Installer (Solar)',
  PEST_CONTROL: 'Pest Control',
  LANDSCAPING: 'Landscaping',
  PAINTING: 'Painting',
  POOL: 'Pool & Spa',
  OTHER: 'Other',
};

const STATE_OPTIONS =Object.entries(US_STATES).map(([name, code]) => ({ name, code }));

export function StatePicker({ value, onChange, placeholder = 'State' }: { value: string; onChange: (code: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = STATE_OPTIONS.find((s) => s.code === value);
  return (
    <>
      <TouchableOpacity style={ui.input} onPress={() => setOpen(true)}>
        <Text style={[ui.inputText, !selected && { color: colors.steel }]}>{selected ? `${selected.name} (${selected.code})` : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.steel} />
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={ui.sheetOverlay}>
          <View style={ui.sheet}>
            <View style={ui.sheetHeader}>
              <Text style={ui.sheetTitle}>Choose a state</Text>
              <TouchableOpacity onPress={() => setOpen(false)}><Ionicons name="close" size={24} color={colors.steel} /></TouchableOpacity>
            </View>
            <FlatList
              data={STATE_OPTIONS}
              keyExtractor={(s) => s.code}
              renderItem={({ item }) => (
                <TouchableOpacity style={ui.sheetRow} onPress={() => { onChange(item.code); setOpen(false); }}>
                  <Text style={ui.sheetRowText}>{item.name}</Text>
                  {item.code === value && <Ionicons name="checkmark" size={18} color={colors.lanternDeep} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// Starts empty — an untouched picker must never submit "today" as an expiry.
export function FutureDateField({ value, onChange, placeholder }: { value: Date | null; onChange: (d: Date) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return (
    <>
      <TouchableOpacity style={ui.input} onPress={() => setShow(true)}>
        <Text style={[ui.inputText, !value && { color: colors.steel }]}>{value ? value.toLocaleDateString() : placeholder}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.steel} />
      </TouchableOpacity>
      {show && (
        <RNDateTimePicker
          value={value ?? tomorrow}
          mode="date"
          minimumDate={tomorrow}
          onChange={(event, d) => {
            setShow(Platform.OS === 'ios');
            if (event.type === 'set' && d) onChange(d);
          }}
        />
      )}
    </>
  );
}

export function ReviewerNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  return (
    <View style={ui.noteBox}>
      <Ionicons name="chatbox-ellipses-outline" size={18} color="#1d4ed8" />
      <View style={{ flex: 1 }}>
        <Text style={ui.noteTitle}>Reviewer's note</Text>
        <Text style={ui.noteText}>{note}</Text>
      </View>
    </View>
  );
}

export function LockedNotice({ text = 'This item is locked while your application is under review.' }: { text?: string }) {
  return (
    <View style={ui.lockedBox}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.steel} />
      <Text style={ui.lockedText}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[ui.button, (disabled || loading) && ui.buttonDisabled]} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={ui.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={ui.section}>
      <Text style={ui.sectionTitle}>{title}</Text>
      {hint && <Text style={ui.sectionHint}>{hint}</Text>}
      {children}
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.steel, lineHeight: 20, marginBottom: 16 },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sectionHint: { fontSize: 13, color: colors.steel, lineHeight: 18, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.steel, marginBottom: 6, marginTop: 4 },
  input: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10,
  },
  inputText: { fontSize: 15, color: colors.ink, flex: 1 },
  textInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.ink, marginBottom: 10,
  },
  button: { backgroundColor: colors.lantern, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.lanternDeep, borderRadius: 12, padding: 13, marginBottom: 10 },
  secondaryBtnText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '700' },
  onFile: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#86efac' },
  onFileText: { flex: 1, fontSize: 13, color: '#065f46', fontWeight: '600' },
  link: { fontSize: 13, color: colors.lanternDeep, fontWeight: '700' },
  warnBox: { flexDirection: 'row', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#fde68a' },
  warnText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  noteBox: { flexDirection: 'row', gap: 10, backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#bfdbfe' },
  noteTitle: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginBottom: 2 },
  noteText: { fontSize: 14, color: '#1e3a8a', lineHeight: 20 },
  lockedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.mist, borderRadius: 10, padding: 12, marginBottom: 14 },
  lockedText: { flex: 1, fontSize: 13, color: colors.steel },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetRowText: { fontSize: 15, color: colors.ink },
});
