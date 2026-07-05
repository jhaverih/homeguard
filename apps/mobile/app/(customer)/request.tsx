import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, userApi, subscriptionsApi } from '../../src/services/api';

function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
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
        <Text style={styles.label}>{label}</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
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
    </View>
  );
}

export default function RequestInspectionScreen() {
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [addonConfirmModal, setAddonConfirmModal] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [preferredDate, setPreferredDate] = useState(tomorrow);
  const { prefilledNotes } = useLocalSearchParams<{ prefilledNotes?: string }>();
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  useEffect(() => {
    if (prefilledNotes) setNotes(prefilledNotes);
  }, [prefilledNotes]);

  useEffect(() => {
    userApi.getMe().then((res: any) => {
      const p = res?.customerProfile;
      if (p) {
        if (p.address) setAddress(p.address);
        if (p.city) setCity(p.city);
        if (p.state) setState(p.state);
        if (p.zipCode) setZipCode(p.zipCode);
      }
    }).catch(() => {});
    subscriptionsApi.getMySubscription().then((s: any) => setSubscription(s)).catch(() => {});
  }, []);

  const inspectionsRemaining = subscription
    ? Math.max(0, (subscription.plan?.inspectionsPerYear ?? 0) - (subscription.inspectionsUsed ?? 0))
    : null;
  const limitReached = inspectionsRemaining !== null && inspectionsRemaining <= 0;
  const addonPrice = subscription?.plan?.addonInspectionPrice
    ? parseFloat(subscription.plan.addonInspectionPrice)
    : 79;

  const validateForm = () => {
    if (!address || !city || !state || !zipCode) {
      Alert.alert('Missing Info', 'Please fill in the property address.');
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    if (limitReached) {
      setAddonConfirmModal(true);
    } else {
      doSubmit(false);
    }
  };

  const doSubmit = async (isPaidAddon: boolean) => {
    setAddonConfirmModal(false);
    setLoading(true);
    try {
      await requestsApi.create({
        preferredDate: preferredDate.toISOString(),
        customerNotes: notes,
        address,
        city,
        state,
        zipCode,
        isPaidAddon,
      });
      Alert.alert(
        'Request Sent!',
        isPaidAddon
          ? `Your additional inspection has been requested. You will be billed $${addonPrice.toFixed(2)} upon completion.`
          : 'We are finding available vendors. You will be notified when one accepts.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Gate: require active subscription before requesting services
  if (subscription === null && !loading) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={styles.container} contentContainerStyle={[styles.content, { alignItems: 'center', paddingTop: 60 }]}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8f0fe', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Ionicons name="shield-outline" size={38} color="#1e3a5f" />
          </View>
          <Text style={[styles.title, { textAlign: 'center' }]}>Subscription Required</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            A HomeGuard plan is required to request inspection services. Choose a plan to get started.
          </Text>
          <TouchableOpacity
            style={[styles.button, { marginTop: 16, width: '100%' }]}
            onPress={() => router.push('/(customer)/subscribe')}
          >
            <Text style={styles.buttonText}>View Plans & Subscribe</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Request an Inspection</Text>
      <Text style={styles.subtitle}>
        Tell us when works best. An available vendor will accept and confirm.
      </Text>

      {/* Quota banner */}
      {subscription && (
        <View style={[styles.quotaBanner, limitReached ? styles.quotaBannerWarn : styles.quotaBannerOk]}>
          <Ionicons
            name={limitReached ? 'alert-circle-outline' : 'shield-checkmark-outline'}
            size={18}
            color={limitReached ? '#92400e' : '#065f46'}
          />
          <Text style={[styles.quotaText, limitReached ? styles.quotaTextWarn : styles.quotaTextOk]}>
            {limitReached
              ? `All ${subscription.plan?.inspectionsPerYear} plan inspections used. Additional inspections available for $${addonPrice.toFixed(2)} each.`
              : `${inspectionsRemaining} inspection${inspectionsRemaining === 1 ? '' : 's'} remaining on your plan.`
            }
          </Text>
        </View>
      )}

      <DateTimeField label="Preferred Date & Time" value={preferredDate} onChange={setPreferredDate} />

      <Text style={styles.label}>Property Address</Text>
      <TextInput style={styles.input} placeholder="Street address" placeholderTextColor="#94a3b8" value={address} onChangeText={setAddress} />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.flex2]} placeholder="City" placeholderTextColor="#94a3b8" value={city} onChangeText={setCity} />
        <TextInput
          style={[styles.input, styles.flex1, styles.ml8]}
          placeholder="State" placeholderTextColor="#94a3b8" value={state} onChangeText={setState}
          autoCapitalize="characters" maxLength={2}
        />
        <TextInput
          style={[styles.input, styles.flex1, styles.ml8]}
          placeholder="ZIP" placeholderTextColor="#94a3b8" value={zipCode} onChangeText={setZipCode}
          keyboardType="number-pad" maxLength={5}
        />
      </View>

      <Text style={styles.label}>Notes for the Vendor (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Any special instructions..."
        placeholderTextColor="#94a3b8"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
      />

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>What's included in your inspection:</Text>
        <Text style={styles.infoItem}>✓ AC visual inspection & filter replacement</Text>
        <Text style={styles.infoItem}>✓ Toilet water leakage check</Text>
        <Text style={styles.infoItem}>✓ Light bulb replacement</Text>
        <Text style={styles.infoItem}>✓ Full checklist report after inspection</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>
              {limitReached ? `Book Additional Inspection ($${addonPrice.toFixed(2)})` : 'Send Request'}
            </Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      {/* Addon confirmation modal */}
      <Modal visible={addonConfirmModal} transparent animationType="fade">
        <View style={styles.addonOverlay}>
          <View style={styles.addonCard}>
            <Ionicons name="calendar-outline" size={40} color="#1e3a5f" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.addonTitle}>Book Additional Inspection</Text>
            <Text style={styles.addonBody}>
              You've used all inspections included in your {subscription?.plan?.name}. This additional
              inspection will be billed separately.
            </Text>
            <View style={styles.addonPriceRow}>
              <Text style={styles.addonPriceLabel}>Additional Inspection Fee</Text>
              <Text style={styles.addonPrice}>${addonPrice.toFixed(2)}</Text>
            </View>
            <Text style={styles.addonNote}>Payment will be processed upon completion of the inspection.</Text>
            <TouchableOpacity style={styles.addonConfirmBtn} onPress={() => doSubmit(true)}>
              <Text style={styles.addonConfirmText}>Confirm & Book — ${addonPrice.toFixed(2)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addonCancelBtn} onPress={() => setAddonConfirmModal(false)}>
              <Text style={styles.addonCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 22, marginBottom: 16 },
  quotaBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1 },
  quotaBannerOk: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  quotaBannerWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  quotaText: { fontSize: 13, lineHeight: 20, flex: 1 },
  quotaTextOk: { color: '#065f46' },
  quotaTextWarn: { color: '#92400e' },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: '#1e3a5f', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16, color: '#0f172a' },
  textArea: { height: 100, textAlignVertical: 'top' },
  infoBox: { backgroundColor: '#e8f0fe', borderRadius: 12, padding: 16, marginBottom: 24 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  infoItem: { fontSize: 14, color: '#2c5282', lineHeight: 24 },
  button: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888', fontSize: 14 },
  row: { flexDirection: 'row', marginBottom: 0 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  ml8: { marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  doneBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  addonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  addonCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  addonTitle: { fontSize: 20, fontWeight: '700', color: '#1e3a5f', textAlign: 'center', marginBottom: 12 },
  addonBody: { fontSize: 14, color: '#64748b', lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  addonPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0f4ff', borderRadius: 12, padding: 16, marginBottom: 12 },
  addonPriceLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  addonPrice: { fontSize: 22, fontWeight: '800', color: '#1e3a5f' },
  addonNote: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  addonConfirmBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 },
  addonConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  addonCancelBtn: { alignItems: 'center', padding: 12 },
  addonCancelText: { color: '#888', fontSize: 14 },
});
