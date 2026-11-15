import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { uploadsApi } from '../../services/api';
import { pickDocument, PickedFile } from '../../utils/pickDocument';
import { PrimaryButton, ui } from './OnboardingUI';
import { colors } from '../../theme';

// Upload card for any vendor document that Attenteve reads automatically
// (trade license, state business registration, certificate of insurance):
//   1. choose a PDF (up to 10 MB) or take/choose a photo,
//   2. it uploads to Attenteve's file storage, with a progress bar,
//   3. `submit` tells the server about it; the AI laptop then reads the
//      document in the background, and it shows "Reading…" until it's done.

type Props = {
  title: string;                                  // e.g. "Upload your TN business registration"
  hint: string;                                   // what we read from it
  what: string;                                   // e.g. "registration", used in messages
  buttonLabel: string;                            // e.g. "Upload Registration"
  folder: 'vendor-licenses' | 'vendor-applications';
  submit: (documentKey: string) => Promise<void>; // tells the server about the uploaded file
};

export function DocumentUpload({ title, hint, what, buttonLabel, folder, submit }: Props) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState<number | null>(null); // 0–1 while uploading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    const f = await pickDocument(title);
    if (f) { setFile(f); setError(null); }
  };

  const upload = async () => {
    if (!file) { setError(`Choose a PDF or photo of the ${what} first.`); return; }
    setSaving(true);
    setError(null);
    setProgress(0);
    try {
      const { key } = await uploadsApi.uploadDocument(file.uri, folder, file.mimeType, file.name, undefined, setProgress);
      setProgress(1);
      await submit(key);
      setFile(null);
    } catch (e: any) {
      // Plain-English errors for the common cases.
      const status = e?.response?.status;
      const msg = status === 413 ? 'The file is larger than 10 MB. Choose a smaller PDF, or take a photo instead.'
        : e?.message === 'Network Error' ? 'Upload failed. Check your connection and try again.'
        : e?.message || 'Upload failed. Please try again.';
      setError(msg);
      Alert.alert(`${what[0].toUpperCase()}${what.slice(1)} not uploaded`, `${msg}\n\nNothing was saved.`);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>

      <TouchableOpacity style={ui.secondaryBtn} onPress={choose} disabled={saving}>
        <Ionicons name={file ? 'checkmark-circle' : 'document-attach-outline'} size={18} color={colors.lanternDeep} />
        <Text style={ui.secondaryBtnText} numberOfLines={1}>{file ? `Selected: ${file.name}` : 'Choose PDF or photo'}</Text>
      </TouchableOpacity>

      {progress !== null && (
        <View style={styles.progressWrap} accessibilityLabel={`Uploading, ${Math.round(progress * 100)} percent`}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Uploaded. Sending for reading…'}</Text>
        </View>
      )}

      {!!error && (
        <View style={styles.error}>
          <Ionicons name="alert-circle" size={16} color={colors.dangerText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <PrimaryButton label={buttonLabel} onPress={upload} loading={saving} disabled={!file} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.canvas, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  hint: { fontSize: 13, color: colors.steel, lineHeight: 18, marginBottom: 10 },
  progressWrap: { marginTop: 4, marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.mistDim, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.lantern },
  progressText: { fontSize: 12, color: colors.steel, marginTop: 4 },
  error: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 },
  errorText: { flex: 1, fontSize: 13, color: colors.dangerText },
});
