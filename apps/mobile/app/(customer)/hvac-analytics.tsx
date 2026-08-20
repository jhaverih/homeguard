import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hvacAnalyticsApi, HvacAnalytics, HvacFinding } from '../../src/services/api';
import { colors } from '../../src/theme';

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border?: string }> = {
  CRITICAL: { color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
  HIGH_ATTENTION: { color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
  ATTENTION: { color: '#DC2626', bg: '#FEF2F2' },
  WATCH: { color: '#D97706', bg: '#FFFBEB' },
  INFO: { color: '#2563EB', bg: '#EFF6FF' },
};

function FindingCard({ item, onResolve, onDismiss }: { item: HvacFinding; onResolve: () => void; onDismiss: () => void }) {
  const style = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.WATCH;
  const isCritical = item.severity === 'CRITICAL';
  return (
    <View style={[styles.findingCard, { backgroundColor: style.bg }, style.border ? { borderWidth: 1, borderColor: style.border } : null]}>
      <View style={styles.findingTop}>
        <View style={[styles.findingBadge, { backgroundColor: isCritical ? '#DC2626' : style.color + '22' }]}>
          <Text style={[styles.findingBadgeText, { color: isCritical ? '#fff' : style.color }]}>{item.severity.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={[styles.findingMsg, { color: style.color }]}>{item.message}</Text>
      {item.recommendedActions.length > 0 && (
        <View style={styles.findingActions}>
          {item.recommendedActions.includes('I_FIXED_IT') && (
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onResolve}>
              <Text style={styles.btnPrimaryText}>I Fixed It</Text>
            </TouchableOpacity>
          )}
          {item.recommendedActions.includes('GET_ATTENTEVE_HELP') && (
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.push('/(customer)/hvac-analytics' as any)}
            >
              <Text style={[styles.btnGhostText, { color: style.color }]}>Get Attenteve Help</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnQuiet} onPress={onDismiss}>
            <Text style={[styles.btnQuietText, { color: style.color }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function HvacAnalyticsScreen() {
  const [data, setData] = useState<HvacAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const load = async () => {
    try {
      const res = await hvacAnalyticsApi.getMine();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleResolve = async (id: string) => {
    await hvacAnalyticsApi.resolveFinding(id).catch(() => {});
    setData((prev) => prev ? { ...prev, findings: prev.findings.filter((f) => f.id !== id) } : prev);
  };

  const handleDismiss = async (id: string) => {
    await hvacAnalyticsApi.dismissFinding(id).catch(() => {});
    setData((prev) => prev ? { ...prev, findings: prev.findings.filter((f) => f.id !== id) } : prev);
  };

  const handleRequestVisit = async () => {
    setRequesting(true);
    try {
      await hvacAnalyticsApi.requestContractorVisit();
      Alert.alert('Request received', "We've received your request — an Attenteve specialist will be in touch shortly.");
    } catch {
      Alert.alert('Something went wrong', 'Please try again in a moment.');
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  if (!data) {
    return (
      <View style={styles.emptyInner}>
        <Ionicons name="cloud-offline-outline" size={48} color="#fca5a5" />
        <Text style={styles.emptyTitle}>Couldn't load your HVAC analytics</Text>
      </View>
    );
  }

  const notIncluded = data.healthState === 'NOT_INCLUDED';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {!notIncluded && (
        <View style={styles.scoreCard}>
          <View style={styles.scoreTop}>
            <Text style={styles.scoreLabel}>HVAC Health</Text>
            <View style={styles.scorePill}><Text style={styles.scorePillText}>Learning</Text></View>
          </View>
          <Text style={styles.scoreBig}>Learning your home's normal HVAC behavior</Text>
          <View style={styles.scoreBarTrack}><View style={[styles.scoreBarFill, { width: data.healthState === 'AWAITING_SENSORS' ? '6%' : '22%' }]} /></View>
          <Text style={styles.scoreFoot}>
            {data.healthState === 'AWAITING_SENSORS'
              ? 'Return and Supply Air sensors are needed before cooling/heating trend detection can start learning.'
              : "Day 3 of 14 · once enough cooling cycles are recorded, you'll get a 0–100 health score compared against your own system's normal pattern."}
          </Text>
        </View>
      )}

      {data.findings.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Active Findings</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {data.findings.map((f) => (
              <FindingCard key={f.id} item={f} onResolve={() => handleResolve(f.id)} onDismiss={() => handleDismiss(f.id)} />
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={styles.sectionLabel}>Sensor Coverage</Text>
        <View style={styles.card}>
          {data.sensorCoverage.map((s) => (
            <View key={s.role} style={styles.sensorRow}>
              <View style={[styles.sensorDot, s.connected ? styles.dotOk : styles.dotOff]} />
              <Text style={styles.sensorName}>{s.label}</Text>
              <Text style={[styles.sensorState, s.connected ? styles.stateOk : styles.stateOff]}>{s.connected ? 'Connected' : 'Not Connected'}</Text>
            </View>
          ))}
          {!notIncluded && (
            <Text style={styles.coverageNote}>Cooling &amp; heating performance analytics are paused until your Return and Supply air sensors are installed — we won't guess at a reading we don't have.</Text>
          )}
        </View>
      </View>

      {notIncluded && (
        <View style={styles.lockCard}>
          <View style={styles.lockIcon}><Ionicons name="lock-closed" size={16} color={colors.steel} /></View>
          <Text style={styles.lockTitle}>HVAC Performance Analytics</Text>
          <Text style={styles.lockSub}>Cooling &amp; heating trend detection, runtime analysis, and your HVAC Health Score are included with the Proactive plan.</Text>
          <TouchableOpacity style={styles.lockBtn} onPress={() => router.push('/(customer)/subscribe')}>
            <Text style={styles.lockBtnText}>Upgrade to Proactive</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.ctaCard}>
        <View style={styles.ctaIcon}><Text style={{ fontSize: 16 }}>🔧</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaHeadline}>Something not right?</Text>
          <Text style={styles.ctaSub}>Request an Attenteve HVAC contractor to take a look on-site.</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.ctaBtn} onPress={handleRequestVisit} disabled={requesting}>
        {requesting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ctaBtnText}>Request HVAC Contractor Visit</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.steel, textAlign: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.steel },

  scoreCard: { borderRadius: 16, padding: 16, backgroundColor: colors.slate },
  scoreTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#8FA0A5' },
  scorePill: { backgroundColor: 'rgba(242,169,60,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  scorePillText: { fontSize: 9.5, fontWeight: '700', color: colors.lantern },
  scoreBig: { fontSize: 14, fontWeight: '700', color: '#EDF1F0', marginTop: 8 },
  scoreBarTrack: { marginTop: 10, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  scoreBarFill: { height: '100%', backgroundColor: colors.lantern, borderRadius: 3 },
  scoreFoot: { marginTop: 8, fontSize: 10.5, color: '#8FA0A5', lineHeight: 15 },

  findingCard: { borderRadius: 16, padding: 14 },
  findingTop: { flexDirection: 'row', marginBottom: 6 },
  findingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  findingBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  findingMsg: { fontSize: 13.5, fontWeight: '700', lineHeight: 19, marginBottom: 10 },
  findingActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#DC2626' },
  btnPrimaryText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FCA5A5' },
  btnGhostText: { fontSize: 10.5, fontWeight: '700' },
  btnQuiet: { paddingHorizontal: 4, paddingVertical: 7 },
  btnQuietText: { fontSize: 10.5, fontWeight: '600', textDecorationLine: 'underline' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 8 },
  sensorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.canvas },
  sensorDot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: '#059669' },
  dotOff: { backgroundColor: '#dc2626' },
  sensorName: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.ink },
  sensorState: { fontSize: 10.5, fontWeight: '700' },
  stateOk: { color: '#059669' },
  stateOff: { color: '#dc2626' },
  coverageNote: { fontSize: 11, color: colors.steel, lineHeight: 15, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.canvas },

  lockCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  lockIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  lockTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  lockSub: { fontSize: 11.5, color: colors.steel, textAlign: 'center', lineHeight: 17, marginBottom: 12 },
  lockBtn: { backgroundColor: colors.lantern, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  lockBtnText: { fontSize: 12, fontWeight: '700', color: colors.ink },

  ctaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 16, padding: 14 },
  ctaIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  ctaHeadline: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  ctaSub: { fontSize: 11, color: colors.steel, lineHeight: 15 },
  ctaBtn: { backgroundColor: colors.lanternDeep, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: -4 },
  ctaBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
});
