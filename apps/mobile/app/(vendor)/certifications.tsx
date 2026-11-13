import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { vendorApi, userApi } from '../../src/services/api';
import { LicenseUpload } from '../../src/components/onboarding/LicenseUpload';
import { ExpiryText, formatDay, LICENSE_STATUS, LicenseStatusBadge } from '../../src/components/onboarding/LicenseStatus';
import { colors } from '../../src/theme';

const CERT_TYPES = [
  { value: 'HVAC', label: 'HVAC (Mechanical)' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'GENERAL_CONTRACTOR', label: 'General Contractor' },
  { value: 'NABCEP', label: 'NABCEP (Solar)' },
];

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Fetched fresh (not from the auth store) on every focus, matching profile.tsx's
  // own isCompanyAdmin pattern — admin status can change after login/app-install,
  // and this gates read/write access to compliance data so it shouldn't go stale.
  const [isCompanyAdmin, setIsCompanyAdmin] = useState<boolean | null>(null);
  const [certType, setCertType] = useState('HVAC');

  const load = useCallback(() => {
    userApi.getMe().then((res: any) => {
      const admin = !!res?.vendorProfile?.isCompanyAdmin;
      setIsCompanyAdmin(admin);
      if (!admin) { setCerts([]); return; }
      return vendorApi.getMyCertifications().then((r: any) => setCerts(r || []));
    }).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // While a license is being read by the AI, check back every 10 seconds.
  const reading = certs.some((c) => c.status === 'READING');
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [reading, load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  if (!isCompanyAdmin) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={styles.subtitle}>Only your company's Vendor Admin can view or manage trade certifications.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Team Certifications</Text>
      <Text style={styles.subtitle}>Every license on your team. Upload a license and we read its details for you; Attenteve then verifies it to unlock licensed-trade jobs.</Text>

      {certs.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.cardTitle}>{CERT_TYPES.find((t) => t.value === c.certificationType)?.label || c.certificationType}</Text>
          <LicenseStatusBadge status={c.status} />
          {c.status === 'READING' ? (
            <Text style={styles.cardSub}>{LICENSE_STATUS.READING.hint}</Text>
          ) : (
            <>
              <Text style={styles.cardSub}>
                {[c.licenseNumber ? `License #${c.licenseNumber}` : 'License number not found', c.issuingState].filter(Boolean).join(' · ')}
              </Text>
              {(c.holderName || c.businessName) && <Text style={styles.cardSub}>{[c.holderName, c.businessName].filter(Boolean).join(' · ')}</Text>}
              {c.issueDate && <Text style={styles.cardSub}>Issued {formatDay(c.issueDate)}</Text>}
              <ExpiryText date={c.expirationDate} status={c.status} />
            </>
          )}
          {c.user?.name && <Text style={styles.cardSub}>Submitted by {c.user.name}</Text>}
          {(c.status === 'REJECTED' || c.status === 'EXPIRED') && (
            <Text style={styles.rejectNote}>{c.reviewNotes || LICENSE_STATUS[c.status]?.hint}</Text>
          )}
          {c.status === 'NEEDS_REVIEW' && (c.reviewReasons ?? []).map((r: string) => <Text key={r} style={styles.reason}>• {r}</Text>)}
          {c.documentUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(c.documentUrl)} style={{ marginTop: 8 }}>
              <Text style={styles.cardLink}>View Document</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>License Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
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
          <LicenseUpload
            key={certType}
            type={certType}
            submit={async (documentKey) => {
              await vendorApi.uploadCertification({ certificationType: certType, documentKey });
              setShowForm(false);
              load();
            }}
          />
          <TouchableOpacity onPress={() => setShowForm(false)} style={styles.cancelBtn}>
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
  subtitle: { fontSize: 14, color: colors.steel, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardSub: { fontSize: 13, color: colors.steel, marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: '700' },
  rejectNote: { fontSize: 12, color: colors.dangerText, marginTop: 6 },
  reason: { fontSize: 12, color: colors.warningText, marginTop: 2 },
  cardLink: { fontSize: 12, fontWeight: '700', color: colors.lanternDeep },
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
