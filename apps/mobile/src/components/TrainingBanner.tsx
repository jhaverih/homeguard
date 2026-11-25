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
  const left = s.modules.filter((m) => m.status !== 'DONE');
  const coreLeft = left.filter((m) => m.core);
  const minutesOf = (ms: typeof left) => ms.reduce((n, m) => n + m.minutes, 0);
  const started = s.doneCount > 0;
  const title = blocked
    ? 'Finish your training to see jobs'
    : grace
      ? `Finish your training by ${formatDay(s.graceUntil)}`
      : 'Finish your training for all your services';
  const body = blocked
    ? 'Open jobs show once the core training is done.'
    : grace
      ? "New jobs stop showing after that date until it's done."
      : 'Jobs for a service show once you finish its module.';
  // The time it takes, shown on its own line: how long until jobs unlock when
  // they're blocked, otherwise everything still to do. Module minutes come
  // from apps/api/training/modules.json (measured: narration plus questions).
  const time = blocked && coreLeft.length < left.length
    ? `About ${formatMinutes(minutesOf(coreLeft))} to unlock jobs · ${formatMinutes(s.minutesLeft)} in all`
    : `About ${formatMinutes(s.minutesLeft)} · ${left.length} short ${left.length === 1 ? 'module' : 'modules'}`;

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
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color={blocked ? colors.ink : colors.warningText} />
          <Text style={[styles.time, !blocked && { color: colors.warningText }]}>{time}</Text>
        </View>
        <Text style={[styles.hint, !blocked && { color: colors.warningText }]}>
          {started ? `${s.doneCount} of ${s.requiredCount} done. ` : ''}You can stop any time and pick up where you left off.
        </Text>
        <View style={[styles.button, !blocked && { backgroundColor: colors.warningText }]}>
          <Text style={[styles.buttonText, !blocked && { color: colors.surface }]}>
            {started ? 'Continue training' : 'Start training'}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={blocked ? colors.lantern : colors.surface} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** "45 minutes", "1 hour", "1 hour 10 minutes". */
function formatMinutes(n: number): string {
  if (n < 60) return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${m} minutes` : ''}`;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 14, borderWidth: 1 },
  blocked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  soft: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  body: { fontSize: 13.5, color: colors.ink, lineHeight: 19, marginTop: 3 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  time: { fontSize: 14.5, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  hint: { fontSize: 12.5, color: colors.ink, lineHeight: 17, marginTop: 4 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginTop: 10,
  },
  buttonText: { fontSize: 14, fontWeight: '800', color: colors.lantern },
});
