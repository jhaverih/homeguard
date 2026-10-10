import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChartRange, FaultMarker, HealthStatus, HvacComponentDetail, hvacAnalyticsApi } from '../../src/services/api';
import { TimeSeriesChart, clockLabel } from '../../src/components/hvac/TimeSeriesChart';
import { colors } from '../../src/theme';

const RANGES: { key: ChartRange; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const COMPONENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  PERFORMANCE: 'snow-outline', REFRIGERANT: 'thermometer-outline', HUMIDITY: 'water-outline', CONDENSATE: 'beaker-outline',
  CONTROLS: 'options-outline', AIRFLOW: 'swap-horizontal-outline', BLOWER: 'sync-outline', COMPRESSOR: 'hardware-chip-outline', ELECTRICAL: 'flash-outline',
};

const STATUS: Record<HealthStatus, { label: string; color: string; bg: string }> = {
  HEALTHY: { label: 'Healthy', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  BASELINE_COLLECTING: { label: 'Baseline collecting', color: '#0369A1', bg: 'rgba(3,105,161,0.12)' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', color: colors.steel, bg: 'rgba(91,107,112,0.12)' },
  MONITOR: { label: 'Monitor', color: '#B45309', bg: 'rgba(217,119,6,0.14)' },
  MAINTENANCE_RECOMMENDED: { label: 'Maintenance recommended', color: '#C2410C', bg: 'rgba(234,88,12,0.14)' },
  CRITICAL: { label: 'Critical', color: '#DC2626', bg: 'rgba(220,38,38,0.14)' },
  NOT_MONITORED: { label: 'Not Monitored', color: colors.steel, bg: 'rgba(91,107,112,0.08)' },
};

const OUTCOME: Record<string, { label: string; color: string }> = {
  CLEAR: { label: 'Normal', color: '#059669' },
  TRIGGERED: { label: 'Condition detected', color: '#DC2626' },
  BASELINE_COLLECTING: { label: 'Baseline collecting', color: '#0369A1' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', color: colors.steel },
};

const UNIT_TITLE: Record<string, string> = { '°F': 'Temperature (°F)', '%': 'Relative humidity (%)' };

// A finding's evidence, in plain words — only the fields a homeowner can
// read meaningfully; anything else stays in the admin view.
function observations(m: FaultMarker): string[] {
  const e = m.evidence ?? {};
  const out: string[] = [];
  if (e.activeMinutes != null) out.push(`Cooling had been running for ${e.activeMinutes} minutes`);
  if (e.currentErrorF != null && e.coolSetpointF != null) out.push(`Indoor temperature ${e.currentErrorF}°F above the ${e.coolSetpointF}°F setpoint`);
  if (e.progressF != null) out.push(`Dropped only ${Math.max(0, e.progressF)}°F in the last hour`);
  if (e.decreaseF != null) out.push(`Dropped ${Math.max(0, e.decreaseF)}°F since cooling started`);
  if (e.currentF != null && e.baselineF != null) out.push(`Reading ${e.currentF}°F vs. about ${e.baselineF}°F normally during stable cooling`);
  if (e.sustainedMinutes != null && e.direction) out.push(`Stayed ${e.direction} its normal pattern for ${e.sustainedMinutes}+ minutes`);
  if (e.coolingStarts != null) out.push(`${e.coolingStarts} cooling starts in ${e.windowMinutes} minutes`);
  if (e.recentCycleMinutes && e.baselineMedianMinutes != null) out.push(`Recent cycles: ${e.recentCycleMinutes.join(', ')} min (usually ~${e.baselineMedianMinutes} min)`);
  if (e.currentHumidity != null) out.push(`Humidity ${e.currentHumidity}% (lowest ${e.minHumidity}% over ${e.windowMinutes} min) while cooling`);
  if (e.drainPanWater) out.push('The drain-pan sensor also detected water');
  if (e.coolingCallObserved === false) out.push(`No cooling call reported for ${e.windowMinutes} minutes`);
  if (Array.isArray(e.symptoms)) out.push(`${e.symptoms.length} related indicators at the same time`);
  return out.length ? out : [m.message];
}

function FaultCard({ marker }: { marker: FaultMarker }) {
  const checks = marker.recommendedActions.filter((a) => a.actionType === 'HOMEOWNER_ACTION');
  const pro = marker.recommendedActions.filter((a) => a.actionType === 'SERVICE_REQUEST');
  const active = marker.status === 'ACTIVE';
  return (
    <View style={styles.faultCard}>
      <View style={styles.faultHead}>
        <Text style={styles.faultTitle}>{marker.label}</Text>
        <Text style={[styles.faultState, { color: active ? '#DC2626' : '#059669' }]}>{active ? 'Active' : 'Resolved'}</Text>
      </View>
      <View style={styles.faultCols}>
        <View style={styles.faultCol}>
          <View style={styles.faultColHead}><Ionicons name="time-outline" size={15} color={colors.ink} /><Text style={styles.faultColTitle}>Detection time</Text></View>
          <Text style={styles.faultBig}>{clockLabel(marker.detectedAt)}</Text>
          <Text style={styles.faultSmall}>{new Date(marker.detectedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · dashed line on the chart</Text>
          {marker.resolvedAt && <Text style={styles.faultSmall}>Resolved {clockLabel(marker.resolvedAt)}</Text>}
        </View>
        <View style={styles.faultCol}>
          <View style={styles.faultColHead}><Ionicons name="warning-outline" size={15} color={colors.ink} /><Text style={styles.faultColTitle}>Observed condition</Text></View>
          {observations(marker).map((o) => <Text key={o} style={styles.bullet}>• {o}</Text>)}
        </View>
      </View>
      {checks.length > 0 && (
        <View style={styles.faultSection}>
          <View style={styles.faultColHead}><Ionicons name="bulb-outline" size={15} color={colors.ink} /><Text style={styles.faultColTitle}>What you can check</Text></View>
          {checks.map((a) => <Text key={a.actionCode} style={styles.bullet}>• <Text style={styles.bold}>{a.title}.</Text> {a.description}</Text>)}
        </View>
      )}
      {pro.length > 0 && (
        <View style={styles.faultSection}>
          <View style={styles.faultColHead}><Ionicons name="construct-outline" size={15} color={colors.ink} /><Text style={styles.faultColTitle}>When to call a pro</Text></View>
          {pro.map((a) => <Text key={a.actionCode} style={styles.bullet}>• {a.description}</Text>)}
        </View>
      )}
    </View>
  );
}

export default function HvacComponentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [range, setRange] = useState<ChartRange>('day');
  const [data, setData] = useState<HvacComponentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async (r: ChartRange) => {
    try {
      setFailed(false);
      setData(await hvacAnalyticsApi.getComponent(String(id), r));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(range); }, [id, range]));

  if (loading && !data) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  if (failed && !data) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={44} color="#fca5a5" />
        <Text style={styles.emptyText}>Couldn't load this component</Text>
      </View>
    );
  }
  if (!data) return null;

  const status = STATUS[data.component.healthStatus ?? 'NOT_MONITORED'];
  const activeFaults = data.markers.filter((m) => m.status === 'ACTIVE');
  const headline = activeFaults[0]?.message ?? data.component.reason ?? (data.component.healthStatus === 'HEALTHY' ? 'No issues detected' : '');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(range); }} />}
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons name={COMPONENT_ICON[data.component.id] ?? 'pulse-outline'} size={24} color="#2563EB" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{data.component.label}</Text>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
        </View>
      </View>

      {activeFaults.length > 0 ? (
        <View style={styles.issueCard}>
          <Ionicons name="warning" size={22} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={styles.issueTitle}>Potential issue</Text>
            <Text style={styles.issueText}>{headline}</Text>
          </View>
        </View>
      ) : !!headline && <Text style={styles.subtitle}>{headline}</Text>}
      {(data.component.limitations ?? []).map((l) => <Text key={l} style={styles.limitation}>{l}</Text>)}

      <View style={styles.segment}>
        {RANGES.map((r) => (
          <TouchableOpacity key={r.key} style={[styles.segmentBtn, range === r.key && styles.segmentActive]} onPress={() => { setLoading(true); setRange(r.key); }}>
            <Text style={[styles.segmentText, range === r.key && styles.segmentTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {data.charts.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>No readings recorded for this period yet.</Text></View>
      ) : data.charts.map((c) => (
        <View key={c.unit} style={styles.card}>
          <Text style={styles.chartTitle}>{UNIT_TITLE[c.unit] ?? c.unit}</Text>
          <Text style={styles.chartHint}>Touch and drag across the chart to see each sensor's reading.</Text>
          <TimeSeriesChart series={c.series} unit={c.unit} bands={data.bands} markers={data.markers} from={data.from} to={data.to} range={data.range} />
        </View>
      ))}

      {data.markers.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={styles.section}>Conditions detected</Text>
          {[...data.markers].reverse().map((m) => <FaultCard key={m.id} marker={m} />)}
        </View>
      )}

      {data.conditions.length > 0 && (
        <View>
          <Text style={styles.section}>What we're checking</Text>
          <View style={styles.card}>
            {data.conditions.map((c) => {
              const o = OUTCOME[c.outcome] ?? OUTCOME.INSUFFICIENT_DATA;
              return (
                <View key={`${c.ruleId}${c.evaluatedAt}`} style={styles.condRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.condLabel}>{c.label}</Text>
                    {c.reason && c.outcome !== 'CLEAR' && <Text style={styles.condReason}>{c.reason}</Text>}
                  </View>
                  <Text style={[styles.condOutcome, { color: o.color }]}>{o.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: colors.steel, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.10)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 14, color: colors.slate },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  issueCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12 },
  issueTitle: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 2 },
  issueText: { fontSize: 13, color: colors.slate, lineHeight: 18 },
  limitation: { fontSize: 12, color: '#B45309' },
  segment: { flexDirection: 'row', backgroundColor: colors.mistDim, borderRadius: 10, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.steel },
  segmentTextActive: { color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  chartTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  chartHint: { fontSize: 11, color: colors.steel, marginBottom: 6 },
  muted: { color: colors.steel, fontSize: 13 },
  section: { fontSize: 12, fontWeight: '800', color: colors.steel, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  faultCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  faultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faultTitle: { fontSize: 14, fontWeight: '800', color: colors.ink, flex: 1 },
  faultState: { fontSize: 12, fontWeight: '700' },
  faultCols: { flexDirection: 'row', gap: 12 },
  faultCol: { flex: 1, gap: 3 },
  faultColHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  faultColTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  faultBig: { fontSize: 18, fontWeight: '800', color: colors.ink },
  faultSmall: { fontSize: 11, color: colors.steel },
  faultSection: { gap: 3, borderTopWidth: 1, borderTopColor: colors.canvas, paddingTop: 8 },
  bullet: { fontSize: 12, color: colors.slate, lineHeight: 17 },
  bold: { fontWeight: '700', color: colors.ink },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.canvas },
  condLabel: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  condReason: { fontSize: 11, color: colors.steel, marginTop: 2 },
  condOutcome: { fontSize: 12, fontWeight: '700' },
});
