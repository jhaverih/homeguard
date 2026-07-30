import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { disputesApi, uploadsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const CATEGORIES = [
  { key: 'WORK_NOT_COMPLETED', label: 'Work not completed', icon: 'close-circle-outline' },
  { key: 'QUALITY_ISSUE', label: 'Quality issue', icon: 'thumbs-down-outline' },
  { key: 'WRONG_PRICE', label: 'Wrong price charged', icon: 'cash-outline' },
  { key: 'SERVICE_NOT_AS_DESCRIBED', label: 'Not as described', icon: 'document-text-outline' },
  { key: 'OTHER', label: 'Other', icon: 'help-circle-outline' },
] as const;

export default function DisputeScreen() {
  const { serviceRequestId, vendorId, stripePaymentIntentId, amount } =
    useLocalSearchParams<{ serviceRequestId: string; vendorId: string; stripePaymentIntentId?: string; amount?: string }>();

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; key?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert('Limit reached', 'Maximum 3 evidence photos allowed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setPhotos((prev) => [...prev, { uri }]);
    setUploading(true);
    try {
      const res: any = await uploadsApi.uploadPhoto(uri, 'disputes');
      setPhotos((prev) => prev.map((p) => (p.uri === uri && !p.key ? { uri, key: res.key } : p)));
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
      setPhotos((prev) => prev.filter((p) => !(p.uri === uri && !p.key)));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!category) { Alert.alert('Required', 'Please select a reason for your dispute.'); return; }
    if (description.trim().length < 20) { Alert.alert('Required', 'Please describe the issue in at least 20 characters.'); return; }
    if (photos.some((p) => !p.key)) { Alert.alert('Please wait', 'Photos are still uploading.'); return; }

    setSubmitting(true);
    try {
      await disputesApi.open({
        serviceRequestId,
        vendorId,
        stripePaymentIntentId,
        category,
        description: description.trim(),
        photoKeys: photos.map((p) => p.key!).filter(Boolean),
      });
      Alert.alert(
        'Dispute Submitted',
        'Your dispute has been received and the payment is on hold. Attenteve will review and contact you within 2 business days.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not submit dispute. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Ionicons name="shield-half" size={28} color={colors.mist} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Raise a Dispute</Text>
          <Text style={styles.headerSub}>
            {amount ? `Payment of $${amount} is on hold` : 'Payment will be frozen during review'}
          </Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={18} color={colors.lanternDeep} />
        <Text style={styles.infoText}>
          Attenteve will review your dispute within 2 business days. Both you and your vendor will be notified of the outcome.
        </Text>
      </View>

      <Text style={styles.label}>Reason <Text style={styles.required}>*</Text></Text>
      {CATEGORIES.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[styles.categoryRow, category === c.key && styles.categoryRowActive]}
          onPress={() => setCategory(c.key)}
        >
          <Ionicons name={c.icon as any} size={20} color={category === c.key ? colors.lanternDeep : colors.steel} />
          <Text style={[styles.categoryText, category === c.key && styles.categoryTextActive]}>{c.label}</Text>
          {category === c.key && <Ionicons name="checkmark-circle" size={18} color={colors.lanternDeep} />}
        </TouchableOpacity>
      ))}

      <Text style={[styles.label, { marginTop: 16 }]}>Description <Text style={styles.required}>*</Text></Text>
      <TextInput
        style={styles.textArea}
        placeholder="Please describe the issue in detail. What did you expect and what actually happened?"
        placeholderTextColor={colors.steel}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <Text style={styles.charCount}>{description.length}/1000</Text>

      <Text style={[styles.label, { marginTop: 8 }]}>Evidence photos <Text style={styles.optional}>(optional, up to 3)</Text></Text>
      <View style={styles.photoRow}>
        {photos.map((p, i) => (
          <View key={i} style={styles.photoThumb}>
            <Image source={{ uri: p.uri }} style={styles.photoImg} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
              <Ionicons name="close-circle" size={18} color="#fff" />
            </TouchableOpacity>
            {!p.key && <ActivityIndicator style={styles.photoSpinner} size="small" color="#fff" />}
          </View>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto} disabled={uploading}>
            {uploading
              ? <ActivityIndicator size="small" color={colors.lanternDeep} />
              : <><Ionicons name="camera" size={24} color={colors.lanternDeep} /><Text style={styles.addPhotoText}>Add photo</Text></>
            }
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, (!category || description.trim().length < 20 || submitting) && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={!category || description.trim().length < 20 || submitting}
      >
        {submitting
          ? <ActivityIndicator color={colors.ink} />
          : <><Ionicons name="shield-checkmark" size={18} color={colors.ink} /><Text style={styles.submitBtnText}> Submit Dispute</Text></>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()}>
        <Text style={styles.cancelLinkText}>Cancel — keep payment pending</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: 14, padding: 18, marginBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.mist },
  headerSub: { fontSize: 12, color: colors.mistDim, marginTop: 2 },
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.mist, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  infoText: { flex: 1, fontSize: 13, color: colors.lanternDeep, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  required: { color: '#c53030' },
  optional: { fontSize: 12, fontWeight: '400', color: colors.steel },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: colors.border },
  categoryRowActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  categoryText: { flex: 1, fontSize: 14, color: colors.steel },
  categoryTextActive: { fontWeight: '600', color: colors.lanternDeep },
  textArea: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 14, color: colors.ink, height: 120, textAlignVertical: 'top', lineHeight: 21 },
  charCount: { fontSize: 11, color: colors.steel, textAlign: 'right', marginTop: 4, marginBottom: 4 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  photoThumb: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10 },
  photoSpinner: { position: 'absolute', bottom: 6, left: 6 },
  addPhotoBtn: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.steel, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 4 },
  addPhotoText: { fontSize: 11, color: colors.lanternDeep, fontWeight: '600' },
  submitBtn: { flexDirection: 'row', backgroundColor: colors.lantern, borderRadius: 14, padding: 17, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: colors.steel },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cancelLink: { alignItems: 'center', marginTop: 16 },
  cancelLinkText: { fontSize: 13, color: colors.steel },
});
