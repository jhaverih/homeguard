import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Switch,
} from 'react-native';
import { colors } from '../theme';
import { propertyCharacteristicsApi, PropertyCharacteristics } from '../services/api';

const DEFAULTS: PropertyCharacteristics = {
  squareFootage: 0, hvacCount: 2, waterHeaterCount: 1, bathroomCount: 3, kitchenCount: 1, hasDetachedGarage: false,
};

type Props = {
  visible: boolean;
  // CarePlus shows its own recurring surcharge; Assessment shows the
  // customer's one-time surcharge on top of the $249 base — same form,
  // different quote fields since the two are priced independently.
  mode: 'careplus' | 'assessment';
  initial?: PropertyCharacteristics | null;
  onClose: () => void;
  onSaved: (data: PropertyCharacteristics) => void;
};

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(Math.max(min, value - 1))}>
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(value + 1)}>
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeCharacteristicsModal({ visible, mode, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<PropertyCharacteristics>(initial ?? DEFAULTS);
  const [quote, setQuote] = useState<{ carePlusSurcharge: number; assessmentCustomerSurcharge: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (visible) setForm(initial ?? DEFAULTS);
  }, [visible, initial]);

  useEffect(() => {
    if (!visible || !form.squareFootage) { setQuote(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      propertyCharacteristicsApi.quote(form).then(setQuote).catch(() => setQuote(null));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [visible, form]);

  const set = (patch: Partial<PropertyCharacteristics>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.squareFootage || form.squareFootage <= 0) return;
    setSaving(true);
    try {
      const saved = await propertyCharacteristicsApi.upsertMine(form);
      onSaved(saved);
    } catch (e: any) {
      // Left on-screen — the field-level required-square-footage check
      // above covers the common case; anything else is rare enough not to
      // need its own alert plumbing here.
      console.warn('Failed to save home characteristics', e);
    } finally {
      setSaving(false);
    }
  };

  const base = mode === 'careplus' ? 149 : 249;
  const surcharge = mode === 'careplus' ? quote?.carePlusSurcharge : quote?.assessmentCustomerSurcharge;
  const total = surcharge != null ? base + surcharge : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Tell Us About Your Home</Text>
            <Text style={styles.subtitle}>
              {mode === 'careplus'
                ? 'A few details about your home so we can price CarePlus accurately.'
                : 'A few details about your home so we can price your Preventative Home Assessment accurately.'}
            </Text>

            <Text style={styles.fieldLabel}>Square Footage</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2400"
              placeholderTextColor={colors.steel}
              keyboardType="number-pad"
              value={form.squareFootage ? String(form.squareFootage) : ''}
              onChangeText={(t) => set({ squareFootage: parseInt(t, 10) || 0 })}
            />

            <NumberField label="HVAC Units" value={form.hvacCount} onChange={(n) => set({ hvacCount: n })} />
            <NumberField label="Water Heaters" value={form.waterHeaterCount} onChange={(n) => set({ waterHeaterCount: n })} min={1} />
            <NumberField label="Bathrooms" value={form.bathroomCount} onChange={(n) => set({ bathroomCount: n })} min={1} />
            {mode === 'assessment' && (
              <NumberField label="Kitchens" value={form.kitchenCount} onChange={(n) => set({ kitchenCount: n })} min={1} />
            )}

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Detached Garage</Text>
              <Switch
                value={form.hasDetachedGarage}
                onValueChange={(v) => set({ hasDetachedGarage: v })}
                trackColor={{ true: colors.lantern }}
              />
            </View>

            {total != null && (
              <View style={styles.breakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Base</Text>
                  <Text style={styles.breakdownValue}>${base}</Text>
                </View>
                {surcharge! > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Home details surcharge</Text>
                    <Text style={styles.breakdownValue}>+${surcharge}</Text>
                  </View>
                )}
                <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
                  <Text style={styles.breakdownTotalLabel}>Total{mode === 'careplus' ? '/yr' : ''}</Text>
                  <Text style={styles.breakdownTotalValue}>${total}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!form.squareFootage || saving) && styles.saveBtnDisabled]}
              onPress={save}
              disabled={!form.squareFootage || saving}
            >
              {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>Save & Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  title: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.steel, lineHeight: 20, marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
    fontSize: 14, color: colors.ink, marginBottom: 14,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.mist,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  stepperBtnText: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep },
  stepperValue: { fontSize: 15, fontWeight: '700', color: colors.ink, minWidth: 20, textAlign: 'center' },
  breakdown: { backgroundColor: colors.canvas, borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  breakdownLabel: { fontSize: 13, color: colors.steel },
  breakdownValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  breakdownTotalRow: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 0 },
  breakdownTotalLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  breakdownTotalValue: { fontSize: 15, fontWeight: '800', color: colors.lanternDeep },
  saveBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel, fontWeight: '600' },
});
