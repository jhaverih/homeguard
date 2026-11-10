import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { vendorApi, uploadsApi } from '../../src/services/api';
import { pickDocument } from '../../src/utils/pickDocument';
import { FutureDateField } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW: '#b45309',
  APPROVED: '#059669',
  REJECTED: '#dc2626',
  NEEDS_INFO: '#635bff',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  NEEDS_INFO: 'More Information Needed',
};

type DocKey = 'stateRegistrationDocKey' | 'coiDocumentKey';

function DocUploadRow({
  label, onFile, replaced, uploading, onPress,
}: { label: string; onFile: boolean; replaced: boolean; uploading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.docBtn} onPress={onPress} disabled={uploading}>
      {uploading ? (
        <ActivityIndicator color={colors.lanternDeep} />
      ) : (
        <Text style={styles.docBtnText}>
          {replaced ? `✓ New ${label} attached — tap Save to keep it` : onFile ? `✓ ${label} on file — tap to replace` : `Upload ${label} (photo or PDF)`}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// Approved companies keeping their documents current (a renewed insurance
// certificate, for example). Updating documents here doesn't change the
// company's approval; new applications go through app/(vendor-onboarding).
export default function CompanyApplicationScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState<any>(null);

  const [ein, setEin] = useState('');
  const [newKeys, setNewKeys] = useState<Partial<Record<DocKey, string>>>({});
  const [uploadingKey, setUploadingKey] = useState<DocKey | null>(null);
  const [coiExpirationDate, setCoiExpirationDate] = useState<Date | null>(null);

  const load = useCallback(() => {
    vendorApi.getApplication().then((res: any) => {
      setApplication(res);
      setEin(res?.ein || '');
      setNewKeys({});
      setCoiExpirationDate(res?.coiExpirationDate && new Date(res.coiExpirationDate) > new Date() ? new Date(res.coiExpirationDate) : null);
    }).catch((e: any) => Alert.alert('Error', e.message)).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upload = async (key: DocKey) => {
    const file = await pickDocument(key === 'coiDocumentKey' ? 'Certificate of Insurance' : 'State Registration');
    if (!file) return;
    setUploadingKey(key);
    try {
      const res = await uploadsApi.uploadDocument(file.uri, 'vendor-applications', file.mimeType, file.name);
      setNewKeys((prev) => ({ ...prev, [key]: res.key }));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingKey(null);
    }
  };

  const submit = async () => {
    if (newKeys.coiDocumentKey && !coiExpirationDate) {
      Alert.alert('Expiry date needed', 'Enter the expiry date printed on the new certificate.');
      return;
    }
    setSubmitting(true);
    try {
      await vendorApi.submitApplication({
        ein: ein.trim() || undefined,
        stateRegistrationDocKey: newKeys.stateRegistrationDocKey,
        coiDocumentKey: newKeys.coiDocumentKey,
        coiExpirationDate: coiExpirationDate ? coiExpirationDate.toISOString() : undefined,
      });
      Alert.alert('Saved', 'Your company documents have been updated.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Company Documents</Text>
      <Text style={styles.subtitle}>Keep your registration and insurance current.</Text>

      {application?.applicationStatus && (
        <View style={styles.statusCard}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[application.applicationStatus] }]}>
            {STATUS_LABEL[application.applicationStatus] || application.applicationStatus}
          </Text>
          {application.reviewNotes && <Text style={styles.reviewNote}>{application.reviewNotes}</Text>}
        </View>
      )}

      <Text style={styles.formLabel}>EIN</Text>
      <TextInput
        style={styles.input}
        placeholder="12-3456789"
        placeholderTextColor={colors.steel}
        value={ein}
        onChangeText={setEin}
      />

      <Text style={styles.formLabel}>State Registration Document</Text>
      <DocUploadRow
        label="state registration"
        onFile={!!application?.stateRegistrationDocKey}
        replaced={!!newKeys.stateRegistrationDocKey}
        uploading={uploadingKey === 'stateRegistrationDocKey'}
        onPress={() => upload('stateRegistrationDocKey')}
      />

      <Text style={styles.formLabel}>Certificate of Insurance (COI)</Text>
      <DocUploadRow
        label="certificate"
        onFile={!!application?.coiDocumentKey}
        replaced={!!newKeys.coiDocumentKey}
        uploading={uploadingKey === 'coiDocumentKey'}
        onPress={() => upload('coiDocumentKey')}
      />
      <Text style={styles.formLabel}>Insurance expiry date</Text>
      <FutureDateField value={coiExpirationDate} onChange={setCoiExpirationDate} placeholder="Expiry date on the certificate" />

      <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  title: { fontSize: 22, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  statusCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  statusText: { fontSize: 14, fontWeight: '700' },
  reviewNote: { fontSize: 13, color: colors.steel, marginTop: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.ink, marginBottom: 12,
  },
  docBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  docBtnText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  submitBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
