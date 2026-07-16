import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
} from 'react-native';
import { colors } from '../theme';
import { cancellationFeedbackApi } from '../services/api';

const REASONS: { code: string; label: string }[] = [
  { code: 'TOO_EXPENSIVE', label: 'Too expensive' },
  { code: 'NOT_USING_ENOUGH', label: 'Not using it enough' },
  { code: 'FOUND_ALTERNATIVE', label: 'Found another provider' },
  { code: 'SERVICE_QUALITY', label: 'Service quality issues' },
  { code: 'MOVING', label: 'Moving' },
  { code: 'OTHER', label: 'Other' },
];

type Props = {
  visible: boolean;
  type: 'SUBSCRIPTION' | 'SERVICE_REQUEST';
  subscriptionId?: string;
  serviceRequestId?: string;
  stopTimingMessage: string;
  onDone: () => void;
};

export default function CancellationFeedbackModal({
  visible, type, subscriptionId, serviceRequestId, stopTimingMessage, onDone,
}: Props) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReasonCode(null);
    setComment('');
    setSubmitting(false);
  };

  const skip = () => {
    reset();
    onDone();
  };

  const submit = async () => {
    if (!reasonCode) return;
    setSubmitting(true);
    try {
      await cancellationFeedbackApi.submit({
        type, subscriptionId, serviceRequestId, reasonCode, comment: comment.trim() || undefined,
      });
    } catch (e) {
      console.warn('Failed to submit cancellation feedback', e);
    }
    reset();
    onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Before you go</Text>
          <Text style={styles.subtitle}>{stopTimingMessage} Help us improve — why are you cancelling?</Text>

          <View style={styles.chipRow}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r.code}
                onPress={() => setReasonCode(r.code)}
                style={[styles.chip, reasonCode === r.code && styles.chipSelected]}
              >
                <Text style={[styles.chipText, reasonCode === r.code && styles.chipTextSelected]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Anything else? How could we do better?"
            placeholderTextColor={colors.steel}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.submitBtn, !reasonCode && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!reasonCode || submitting}
          >
            <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Feedback'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={skip} style={styles.skipBtn} disabled={submitting}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.steel, lineHeight: 20, marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.canvas,
  },
  chipSelected: { borderColor: colors.lantern, backgroundColor: colors.lantern },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.steel },
  chipTextSelected: { color: colors.ink },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
    fontSize: 14, color: colors.ink, minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
  },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  skipBtn: { alignItems: 'center', padding: 12 },
  skipText: { color: colors.steel, fontWeight: '600' },
});
