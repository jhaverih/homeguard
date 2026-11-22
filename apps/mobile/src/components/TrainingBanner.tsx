import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { trainingApi, TrainingSummary } from '../services/api';
import { formatDay } from './onboarding/LicenseStatus';
import { colors } from '../theme';

// Tells a vendor user about training they still owe, on the dashboard and
// Open Jobs. Jobs are hidden until the core training is done (apps/api
// training-access.ts), so without this an empty job list would be a mystery.
// Shows nothing once everything assigned is done, or if the check fails.
export function TrainingBanner({ onSummary }: { onSummary?: (s: TrainingSummary | null) => void }) {
  const [s, setS] = useState<TrainingSummary | null>(null);

  useFocusEffect(useCallback(() => {
    trainingApi.getMine()
      .then((r) => { setS(r); onSummary?.(r); })
      .catch(() => { setS(null); onSummary?.(null); });
  }, []));

  if (!s || s.allDone) return null;

  const grace = !!s.graceUntil && new Date(s.graceUntil).getTime() > Date.now();
  const blocked = !s.coreDone && !grace;
  const title = blocked
    ? 'Finish your training to see jobs'
    : grace
      ? `Finish your training by ${formatDay(s.graceUntil)}`
      : 'Finish your training for all your services';
  const body = blocked
    ? `Open jobs show once the core training is done. ${s.doneCount} of ${s.requiredCount} done, about ${s.minutesLeft} minutes left.`
    : grace
      ? `New jobs stop showing after that date until it's done. ${s.doneCount} of ${s.requiredCount} done, about ${s.minutesLeft} minutes left.`
      : `Jobs for a service show once you finish its module. ${s.doneCount} of ${s.requiredCount} done.`;

  return (
    <TouchableOpacity
      style={[styles.card, blocked ? styles.blocked : styles.soft]}
      onPress={() => router.push('/(vendor)/training')}
      accessibilityRole="button"
    >
      <Ionicons name="school" size={26} color={blocked ? colors.ink : colors.warningText} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, !blocked && { color: colors.warningText }]}>{title}</Text>
        <Text style={[styles.body, !blocked && { color: colors.warningText }]}>{body}</Text>
        <Text style={[styles.link, !blocked && { color: colors.warningText }]}>Open My Training ›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 14, borderWidth: 1 },
  blocked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  soft: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  body: { fontSize: 13.5, color: colors.ink, lineHeight: 19, marginTop: 3 },
  link: { fontSize: 13.5, fontWeight: '800', color: colors.ink, marginTop: 6 },
});
