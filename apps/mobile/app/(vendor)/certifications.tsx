import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { vendorApi, uploadsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const CERT_TYPES = [
  { value: 'HVAC', label: 'HVAC (Mechanical)' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'GENERAL_CONTRACTOR', label: 'General Contractor' },
  { value: 'NABCEP', label: 'NABCEP (Solar)' },
];

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW: '#b45309',
  APPROVED: '#059669',
  REJECTED: '#dc2626',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [certType, setCertType] = useState('HVAC');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [expirationDate, setExpirationDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [document, setDocument] = useState<{ uri: string; key?: string } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const load = useCallback(() => {
    vendorApi.getMyCertifications().then((res: any) => setCerts(res || [])).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickDocument = () => {
    Alert.alert('License Photo', 'Choose source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!result.canceled && result.assets?.length) await uploadDocument(result.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
          if (!result.canceled && result.assets?.length) await uploadDocument(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadDocument = async (uri: string) => {
    setDocument({ uri });
    setUploadingDoc(true);
    try {
      const res: any = await uploadsApi.uploadPhoto(uri, 'certifications');
      setDocument({ uri, key: res.key });
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
      setDocument(null);
    } finally {
      setUploadingDoc(false);
    }
  };

  const resetForm = () => {
    setCertType('HVAC');
    setLicenseNumber('');
    setIssuingState('');
    setExpirationDate(new Date());
    setDocument(null);
    setShowForm(false);
  };

  const submit = async () => {
    if (!licenseNumber.trim()) { Alert.alert('Required', 'Enter the license number.'); return; }
    if (!issuingState.trim()) { Alert.alert('Required', 'Enter the issuing state.'); return; }
    if (!document?.key) { Alert.alert('Required', 'Upload a photo of your license.'); return; }
    setSubmitting(true);
    try {
      await vendorApi.submitCertification({
        certificationType: certType,
        licenseNumber: licenseNumber.trim(),
        issuingState: issuingState.trim().toUpperCase().slice(0, 2),
        expirationDate: expirationDate.toISOString(),
        documentKey: document.key,
      });
      resetForm();
      load();
      Alert.alert('Submitted', 'Your certification is now pending admin review.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>My Certifications</Text>
      <Text style={styles.subtitle}>Submit trade licenses for admin review to unlock licensed-trade jobs.</Text>

      {certs.map((c) => (
        <View key={c.id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={styles.cardTitle}>{CERT_TYPES.find((t) => t.value === c.certificationType)?.label || c.certificationType}</Text>
            <Text style={[styles.statusBadge, { color: STATUS_COLOR[c.status] }]}>{STATUS_LABEL[c.status] || c.status}</Text>
          </View>
          <Text style={styles.cardSub}>License #{c.licenseNumber} · {c.issuingState}</Text>
          <Text style={styles.cardSub}>Expires {new Date(c.expirationDate).toLocaleDateString()}</Text>
          {c.status === 'REJECTED' && c.reviewNotes && (
            <Text style={styles.rejectNote}>{c.reviewNotes}</Text>
          )}
        </View>
      ))}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>License Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {CERT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, certType === t.value && styles.typeChipActive]}
                onPress={() => setCertType(t.value)}
              >
                <Text style={[styles.typeChipText, certType === t.value && styles.typeChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            style={styles.input}
            placeholder="License number"
            placeholderTextColor={colors.steel}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
          />
          <TextInput
            style={styles.input}
            placeholder="Issuing state (e.g. TN)"
            placeholderTextColor={colors.steel}
            value={issuingState}
            onChangeText={setIssuingState}
            maxLength={2}
            autoCapitalize="characters"
          />

          <Text style={styles.formLabel}>Expiration Date</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateBtnText}>{expirationDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <RNDateTimePicker
              value={expirationDate}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, d) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (d) setExpirationDate(d);
              }}
            />
          )}

          <Text style={styles.formLabel}>License Photo</Text>
          <TouchableOpacity style={styles.docBtn} onPress={pickDocument} disabled={uploadingDoc}>
            {uploadingDoc ? (
              <ActivityIndicator color={colors.lanternDeep} />
            ) : (
              <Text style={styles.docBtnText}>{document?.key ? '✓ Photo uploaded — tap to replace' : '📷 Take or choose a photo'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Submit Certification</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={resetForm} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Add Certification</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  title: { fontSize: 22, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardSub: { fontSize: 13, color: '#666', marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: '700' },
  rejectNote: { fontSize: 12, color: '#dc2626', marginTop: 6, fontStyle: 'italic' },
  addBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.lanternDeep, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  addBtnText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 15 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep, marginBottom: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.mist, marginRight: 8 },
  typeChipActive: { backgroundColor: colors.lantern },
  typeChipText: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  typeChipTextActive: { color: colors.ink },
  input: {
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.ink, marginBottom: 12,
  },
  dateBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: colors.ink },
  docBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  docBtnText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  submitBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 8 },
  cancelBtnText: { color: colors.steel },
});
