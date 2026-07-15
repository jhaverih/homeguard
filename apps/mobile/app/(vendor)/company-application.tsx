import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { vendorApi, uploadsApi } from '../../src/services/api';
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

type DocKey = 'stateRegistrationDocKey' | 'businessTaxLicenseDocKey' | 'coiDocumentKey';

function DocUploadRow({
  label, uploaded, uploading, onPress,
}: { label: string; uploaded: boolean; uploading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.docBtn} onPress={onPress} disabled={uploading}>
      {uploading ? (
        <ActivityIndicator color={colors.lanternDeep} />
      ) : (
        <Text style={styles.docBtnText}>{uploaded ? `✓ ${label} uploaded — tap to replace` : `📷 Upload ${label}`}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function CompanyApplicationScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState<any>(null);

  const [ein, setEin] = useState('');
  const [docKeys, setDocKeys] = useState<Partial<Record<DocKey, string>>>({});
  const [uploadingKey, setUploadingKey] = useState<DocKey | null>(null);
  const [businessTaxLicenseState, setBusinessTaxLicenseState] = useState('');
  const [coiExpirationDate, setCoiExpirationDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(() => {
    vendorApi.getApplication().then((res: any) => {
      setApplication(res);
      setEin(res?.ein || '');
      setBusinessTaxLicenseState(res?.businessTaxLicenseState || '');
      if (res?.coiExpirationDate) setCoiExpirationDate(new Date(res.coiExpirationDate));
    }).catch((e: any) => Alert.alert('Error', e.message)).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickDocument = (key: DocKey) => {
    Alert.alert('Upload Document', 'Choose source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!result.canceled && result.assets?.length) await uploadDocument(key, result.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
          if (!result.canceled && result.assets?.length) await uploadDocument(key, result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadDocument = async (key: DocKey, uri: string) => {
    setUploadingKey(key);
    try {
      const res: any = await uploadsApi.uploadPhoto(uri, 'vendor-applications');
      setDocKeys((prev) => ({ ...prev, [key]: res.key }));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingKey(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await vendorApi.submitApplication({
        ein: ein.trim() || undefined,
        stateRegistrationDocKey: docKeys.stateRegistrationDocKey,
        businessTaxLicenseDocKey: docKeys.businessTaxLicenseDocKey,
        businessTaxLicenseState: businessTaxLicenseState.trim() || undefined,
        coiDocumentKey: docKeys.coiDocumentKey,
        coiExpirationDate: docKeys.coiDocumentKey ? coiExpirationDate.toISOString() : undefined,
      });
      Alert.alert('Submitted', 'Your application has been updated and is pending review.');
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
      <Text style={styles.title}>Company Application</Text>
      <Text style={styles.subtitle}>Submit your company's documents for admin review.</Text>

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
        uploaded={!!docKeys.stateRegistrationDocKey}
        uploading={uploadingKey === 'stateRegistrationDocKey'}
        onPress={() => pickDocument('stateRegistrationDocKey')}
      />

      <Text style={styles.formLabel}>Business Tax License</Text>
      <TextInput
        style={styles.input}
        placeholder="Issuing state (e.g. TN)"
        placeholderTextColor={colors.steel}
        value={businessTaxLicenseState}
        onChangeText={setBusinessTaxLicenseState}
        maxLength={2}
        autoCapitalize="characters"
      />
      <DocUploadRow
        label="business tax license"
        uploaded={!!docKeys.businessTaxLicenseDocKey}
        uploading={uploadingKey === 'businessTaxLicenseDocKey'}
        onPress={() => pickDocument('businessTaxLicenseDocKey')}
      />

      <Text style={styles.formLabel}>Certificate of Insurance (COI)</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateBtnText}>Expires: {coiExpirationDate.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <RNDateTimePicker
          value={coiExpirationDate}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, d) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (d) setCoiExpirationDate(d);
          }}
        />
      )}
      <DocUploadRow
        label="COI"
        uploaded={!!docKeys.coiDocumentKey}
        uploading={uploadingKey === 'coiDocumentKey'}
        onPress={() => pickDocument('coiDocumentKey')}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Submit Application</Text>}
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
  dateBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: colors.ink },
  docBtn: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  docBtnText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  submitBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
