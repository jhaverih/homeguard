import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { trainingApi, TrainingSummary, TrainingModuleSummary, TeamMemberTraining } from '../../src/services/api';
import { formatDay } from '../../src/components/onboarding/LicenseStatus';
import { ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

// "My Training": every module assigned to this vendor user, with status, and
// for a company admin the team's progress. Jobs stay hidden until core
// training is done (apps/api training-access.ts), so this is where the
// dashboard banner and the Open Jobs empty state send people.
type Tone = { bg: string; border: string; text: string };
const PILL: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: { bg: colors.mist, border: colors.border, text: colors.steel } },
  UPDATE_NEEDED: { label: 'Updated · take again', tone: { bg: colors.warningSoft, border: colors.warningBorder, text: colors.warningText } },
  DONE: { label: 'Done', tone: { bg: colors.successSoft, border: colors.successBorder, text: colors.successText } },
};

export default function TrainingScreen() {
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [team, setTeam] = useState<TeamMemberTraining[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await trainingApi.getMine());
      // Only a company admin gets the team view; anyone else gets a 403.
      setTeam(await trainingApi.getTeam().catch(() => null));
    } catch (e: any) {
      setError(e.message === 'NETWORK_ERROR' ? 'Could not reach Attenteve. Check your connection.' : e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!summary && !error) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const core = summary?.modules.filter((m) => m.core) ?? [];
  const services = summary?.modules.filter((m) => !m.core) ?? [];
  const graceActive = !!summary?.graceUntil && new Date(summary.graceUntil).getTime() > Date.now();
  const pct = summary && summary.requiredCount ? summary.doneCount / summary.requiredCount : 0;

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={ui.title}>My Training</Text>
      <Text style={ui.subtitle}>Short lessons with pictures and audio, then three quick questions. Turn your sound on.</Text>

      {error && <View style={ui.warnBox}><Text style={ui.warnText}>{error}</Text></View>}

      {summary && (
        <>
          {summary.allDone ? (
            <View style={styles.doneCard}>
              <Ionicons name="ribbon" size={34} color={colors.successText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Training complete</Text>
                <Text style={styles.doneText}>
                  You finished all {summary.requiredCount} modules{summary.completedAt ? ` on ${formatDay(summary.completedAt)}` : ''}. Jobs for your services show in Open Jobs.
                </Text>
              </View>
            </View>
          ) : (
            <View style={ui.section}>
              <View style={styles.progressHead}>
                <Text style={styles.progressText}>{summary.doneCount} of {summary.requiredCount} done</Text>
                <Text style={styles.progressMuted}>about {summary.minutesLeft} min left</Text>
              </View>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} /></View>
              <Text style={styles.progressHint}>
                {graceActive
                  ? `Finish by ${formatDay(summary.graceUntil)} to keep seeing new jobs.`
                  : summary.coreDone
                    ? 'Jobs for a service show once you finish its module.'
                    : 'Jobs show in Open Jobs once you finish the core training.'}
              </Text>
            </View>
          )}

          <Text style={styles.groupTitle}>Core training</Text>
          <Text style={styles.groupHint}>Required before any job shows.</Text>
          {core.map((m) => <ModuleRow key={m.key} m={m} />)}

          {services.length > 0 && (
            <>
              <Text style={[styles.groupTitle, { marginTop: 18 }]}>For your work</Text>
              <Text style={styles.groupHint}>Each one unlocks the jobs for that kind of work.</Text>
              {services.map((m) => <ModuleRow key={m.key} m={m} />)}
            </>
          )}
        </>
      )}

      {team && team.length > 0 && (
        <>
          <Text style={[styles.groupTitle, { marginTop: 22 }]}>Your team</Text>
          <Text style={styles.groupHint}>Everyone in your company takes the training, including you.</Text>
          {team.map((t) => (
            <View key={t.userId} style={styles.teamRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t.name || t.email || 'Team member'}{t.isCompanyAdmin ? ' · Admin' : ''}</Text>
                <Text style={styles.rowMeta}>
                  {t.allDone
                    ? `Finished ${formatDay(t.completedAt)}`
                    : `${t.doneCount} of ${t.requiredCount} done${t.graceUntil && new Date(t.graceUntil).getTime() > Date.now() ? ` · due ${formatDay(t.graceUntil)}` : ''}`}
                </Text>
              </View>
              <Ionicons
                name={t.allDone ? 'checkmark-circle' : t.coreDone ? 'ellipse-outline' : 'alert-circle-outline'}
                size={22}
                color={t.allDone ? colors.success : t.coreDone ? colors.steel : colors.warning}
              />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function ModuleRow({ m }: { m: TrainingModuleSummary }) {
  const pill = PILL[m.status] ?? PILL.NOT_STARTED;
  return (
    <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/(vendor)/training-module', params: { key: m.key } })}>
      <View style={[styles.icon, m.status === 'DONE' && { backgroundColor: colors.successSoft }]}>
        <Ionicons
          name={m.status === 'DONE' ? 'checkmark' : 'play'}
          size={18}
          color={m.status === 'DONE' ? colors.successText : colors.lanternDeep}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{m.title}</Text>
        <Text style={styles.rowMeta}>
          {m.minutes} min{m.status === 'DONE' && m.completedAt ? ` · finished ${formatDay(m.completedAt)}` : ''}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: pill.tone.bg, borderColor: pill.tone.border }]}>
        <Text style={[styles.pillText, { color: pill.tone.text }]}>{pill.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.successSoft,
    borderColor: colors.successBorder, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16,
  },
  doneTitle: { fontSize: 17, fontWeight: '800', color: colors.successText },
  doneText: { fontSize: 14, color: colors.successText, lineHeight: 20, marginTop: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressText: { fontSize: 16, fontWeight: '800', color: colors.ink },
  progressMuted: { fontSize: 13, color: colors.steel },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.mist, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.lantern },
  progressHint: { fontSize: 13, color: colors.steel, marginTop: 10, lineHeight: 18 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: colors.steel, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  groupHint: { fontSize: 13, color: colors.steel, marginBottom: 8, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.steel, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8,
  },
});
