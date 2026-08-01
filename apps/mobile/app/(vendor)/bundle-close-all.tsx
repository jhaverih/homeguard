import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, uploadsApi } from '../../src/services/api';
import { PhotoStrip } from '../../src/components/vendor/PhotoStrip';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

type MemberState = {
  job: any;
  ready: boolean; // checklist complete (or none required)
  photos: { uri: string; key?: string }[];
  uploading: boolean;
  finalQuantities: Record<string, string>;
};

// "Close All" — batches whichever bundle members are already checklist-ready
// into ONE combined Stripe charge instead of one per service (see
// PaymentsService.chargeForCompletedBundle). Deliberately does NOT re-render
// the full inspection/gutter checklist UI here — a member still needs its
// own checklist finished via the existing active-job.tsx screen first (that
// per-task work already saves live, independent of this screen); this
// screen only handles the final step (photos + submit) for whatever's ready,
// so it can stay simple and never risks the working single-job screen.
export default function BundleCloseAllScreen() {
  const { bookingGroupId } = useLocalSearchParams<{ bookingGroupId: string }>();
  const [members, setMembers] = useState<MemberState[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const all: any = await requestsApi.getVendorJobs();
    const inProgress = (all || []).filter((j: any) => j.bookingGroupId === bookingGroupId && j.status === 'IN_PROGRESS');

    const next: MemberState[] = await Promise.all(inProgress.map(async (job: any) => {
      let ready = true;
      if (job.checklistGroupKey) {
        const progress: any = await inspectionsApi.getProgress(job.id).catch(() => null);
        ready = !!progress && progress.total > 0 && progress.completed >= progress.total;
      }
      const finalQuantities: Record<string, string> = {};
      for (const svc of (job.additionalServices || [])) {
        if (svc.approved && svc.quantity != null) finalQuantities[svc.id] = String(svc.quantity);
      }
      return { job, ready, photos: [], uploading: false, finalQuantities };
    }));
    setMembers(next);
    setLoading(false);
  }, [bookingGroupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateMember = (jobId: string, patch: Partial<MemberState>) => {
    setMembers((prev) => prev.map((m) => (m.job.id === jobId ? { ...m, ...patch } : m)));
  };

  const pickPhotos = (jobId: string, current: { uri: string; key?: string }[]) => {
    if (current.length >= 5) { Alert.alert('Limit', 'Max 5 photos'); return; }
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
          if (!result.canceled && result.assets?.length) await uploadPhotos(jobId, result.assets.map((a) => a.uri), current);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: false,
            allowsMultipleSelection: true, selectionLimit: 5 - current.length,
          });
          if (!result.canceled && result.assets?.length) await uploadPhotos(jobId, result.assets.map((a) => a.uri), current);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhotos = async (jobId: string, uris: string[], current: { uri: string; key?: string }[]) => {
    const toAdd = uris.slice(0, 5 - current.length);
    updateMember(jobId, { photos: [...current, ...toAdd.map((uri) => ({ uri }))], uploading: true });
    try {
      await Promise.all(toAdd.map(async (uri) => {
        const res = await uploadsApi.uploadPhoto(uri, 'completion');
        setMembers((prev) => prev.map((m) => (m.job.id === jobId
          ? { ...m, photos: m.photos.map((p) => (p.uri === uri && !p.key ? { uri, key: res.key } : p)) }
          : m)));
      }));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Unknown error');
      setMembers((prev) => prev.map((m) => (m.job.id === jobId ? { ...m, photos: m.photos.filter((p) => !toAdd.includes(p.uri) || p.key) } : m)));
    } finally {
      updateMember(jobId, { uploading: false });
    }
  };

  const readyToSubmit = members.filter((m) => m.ready && m.photos.length > 0 && m.photos.every((p) => p.key));
  const total = readyToSubmit.reduce((sum, m) => sum + (m.job.additionalServices || []).reduce((s: number, svc: any) => (svc.approved ? s + Number(svc.price) : s), 0), 0);
  const estimatedSavings = readyToSubmit.length > 1 ? (readyToSubmit.length - 1) * 0.30 : 0;

  const submit = async () => {
    if (readyToSubmit.length === 0) return;
    setSubmitting(true);
    try {
      const items = readyToSubmit.map((m) => {
        const finalQtyPayload: Record<string, number> = {};
        for (const [svcId, val] of Object.entries(m.finalQuantities)) {
          const n = parseFloat(val);
          if (!isNaN(n)) finalQtyPayload[svcId] = n;
        }
        return {
          serviceRequestId: m.job.id,
          completionPhotoKeys: m.photos.filter((p) => p.key).map((p) => p.key!),
          finalQuantities: finalQtyPayload,
        };
      });
      await requestsApi.completeBundle(items);
      Alert.alert('Closed', `${readyToSubmit.length} service(s) closed and charged together.`);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.pageTitle}>Close All Remaining</Text>
      <Text style={styles.subtitle}>
        Attach a completion photo for each service below, then submit once — you'll be charged in one combined payment instead of one per service.
      </Text>

      {members.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing left to close in this visit.</Text>
        </View>
      )}

      {members.map((m) => {
        const serviceName = m.job.type === 'ADDITIONAL_SERVICE' ? (m.job.additionalServices?.[0]?.name || 'Service Request') : 'Home Inspection';
        return (
          <View key={m.job.id} style={styles.memberCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.memberName}>{serviceName}</Text>
              {!m.ready && (
                <View style={styles.notReadyBadge}>
                  <Text style={styles.notReadyText}>Checklist incomplete</Text>
                </View>
              )}
            </View>

            {!m.ready ? (
              <TouchableOpacity onPress={() => router.push(`/(vendor)/active-job?id=${m.job.id}`)}>
                <Text style={styles.finishLink}>Finish this job's checklist first →</Text>
              </TouchableOpacity>
            ) : (
              <>
                {(m.job.additionalServices || []).filter((s: any) => s.approved && s.quantity != null).map((svc: any) => (
                  <View key={svc.id} style={styles.qtyRow}>
                    <Text style={styles.qtyLabel}>{svc.name} — qty</Text>
                    <TextInput
                      style={styles.qtyInput}
                      keyboardType="decimal-pad"
                      value={m.finalQuantities[svc.id] ?? String(svc.quantity)}
                      onChangeText={(v) => updateMember(m.job.id, { finalQuantities: { ...m.finalQuantities, [svc.id]: v } })}
                    />
                  </View>
                ))}
                <Text style={styles.photoLabel}>Completion photo <Text style={styles.required}>* min 1</Text></Text>
                <PhotoStrip
                  photos={m.photos}
                  onAdd={() => pickPhotos(m.job.id, m.photos)}
                  onRemove={(i) => updateMember(m.job.id, { photos: m.photos.filter((_, idx) => idx !== i) })}
                  uploading={m.uploading}
                  maxPhotos={5}
                />
              </>
            )}
          </View>
        );
      })}

      {members.length > 0 && (
        <View style={styles.summary}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.summaryLabel}>Ready to close</Text>
            <Text style={styles.summaryValue}>{readyToSubmit.length} of {members.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{fmtUSD(total)}</Text>
          </View>
          {estimatedSavings > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.summarySavings}>Estimated fee savings</Text>
              <Text style={styles.summarySavings}>~{fmtUSD(estimatedSavings)}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.submitBtn, (readyToSubmit.length === 0 || submitting) && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={readyToSubmit.length === 0 || submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="checkmark-done-circle" size={20} color="#fff" /><Text style={styles.submitBtnText}> Close All & Charge</Text></>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.steel, marginBottom: 16 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: colors.steel },
  memberCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  memberName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  notReadyBadge: { backgroundColor: '#fffbeb', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  notReadyText: { fontSize: 11, fontWeight: '700', color: '#d97706' },
  finishLink: { fontSize: 13, color: colors.lanternDeep, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  qtyLabel: { flex: 1, fontSize: 13, color: colors.steel },
  qtyInput: { width: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, textAlign: 'right', fontSize: 14 },
  photoLabel: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  required: { color: '#dc2626', fontWeight: '400' },
  summary: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 4, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { fontSize: 14, color: colors.steel, marginBottom: 6 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  summarySavings: { fontSize: 13, fontWeight: '700', color: '#059669', marginBottom: 6 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lanternDeep, borderRadius: 12, padding: 16, marginTop: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
