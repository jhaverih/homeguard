import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hvacAnalyticsApi, HvacAnalytics, HvacFinding, ComponentHealthResult, ComponentHealthStatus } from '../../src/services/api';
import { colors } from '../../src/theme';

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border?: string }> = {
  CRITICAL: { color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
  HIGH_ATTENTION: { color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
  ATTENTION: { color: '#DC2626', bg: '#FEF2F2' },
  WATCH: { color: '#D97706', bg: '#FFFBEB' },
  INFO: { color: '#2563EB', bg: '#EFF6FF' },
};

const SNOOZE_OPTIONS: { label: string; minutes: 30 | 60 | 240 }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '4 hrs', minutes: 240 },
];

function snoozeLabel(snoozedUntil: string | null): string | null {
  if (!snoozedUntil) return null;
  const ms = new Date(snoozedUntil).getTime() - Date.now();
  if (ms <= 0) return null;
  return `Snoozed until ${new Date(snoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const COMPONENT_STATUS_STYLE: Record<ComponentHealthStatus, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  GOOD: { color: '#059669', bg: 'rgba(5,150,105,0.10)', icon: 'checkmark-circle', label: 'Good' },
  ATTENTION: { color: '#B45309', bg: 'rgba(217,119,6,0.12)', icon: 'alert-circle', label: 'Attention' },
  CRITICAL: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', icon: 'warning', label: 'Critical' },
  NOT_MONITORED: { color: colors.steel, bg: 'rgba(91,107,112,0.08)', icon: 'remove-circle-outline', label: 'Not Monitored' },
};

const OVERALL_HERO_STYLE: Record<ComponentHealthStatus, { icon: keyof typeof Ionicons.glyphMap; iconColor: string; pillLabel: string; headline: string }> = {
  GOOD: { icon: 'checkmark-circle', iconColor: '#34D399', pillLabel: 'Good', headline: 'Your HVAC system appears healthy' },
  ATTENTION: { icon: 'alert-circle', iconColor: '#F2A93C', pillLabel: 'Attention', headline: 'Something needs a look' },
  CRITICAL: { icon: 'warning', iconColor: '#F87171', pillLabel: 'Critical', headline: 'A monitored component needs attention now' },
  NOT_MONITORED: { icon: 'remove-circle-outline', iconColor: '#8FA0A5', pillLabel: 'Not Monitored', headline: 'Add sensors to start monitoring your HVAC system' },
};

function ComponentHealthRow({ item }: { item: ComponentHealthResult }) {
  const s = COMPONENT_STATUS_STYLE[item.status];
  return (
    <View style={styles.compRow}>
      <View style={[styles.compIcon, { backgroundColor: s.bg }]}>
        <Ionicons name={s.icon} size={16} color={s.color} />
      </View>
      <Text style={styles.compName}>{item.label}</Text>
      <View style={[styles.compPill, { backgroundColor: s.bg }]}>
        <Text style={[styles.compPillText, { color: s.color }]}>{s.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.border} />
    </View>
  );
}

function FindingCard({ item, onResolve, onDismiss, onSnooze }: { item: HvacFinding; onResolve: () => void; onDismiss: () => void; onSnooze: (minutes: 30 | 60 | 240) => void }) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const style = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.WATCH;
  const isCritical = item.severity === 'CRITICAL';
  const activeSnooze = snoozeLabel(item.snoozedUntil);
  return (
    <View style={[styles.findingCard, { backgroundColor: style.bg }, style.border ? { borderWidth: 1, borderColor: style.border } : null]}>
      <View style={styles.findingTop}>
        <View style={[styles.findingBadge, { backgroundColor: isCritical ? '#DC2626' : style.color + '22' }]}>
          <Text style={[styles.findingBadgeText, { color: isCritical ? '#fff' : style.color }]}>{item.severity.replace('_', ' ')}</Text>
        </View>
        {activeSnooze && (
          <View style={styles.snoozePill}>
            <Ionicons name="moon" size={10} color={colors.steel} />
            <Text style={styles.snoozePillText}>{activeSnooze}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.findingMsg, { color: style.color }]}>{item.message}</Text>
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
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setSnoozeOpen((o) => !o)}>
          <Text style={[styles.btnGhostText, { color: style.color }]}>Snooze</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnQuiet} onPress={onDismiss}>
          <Text style={[styles.btnQuietText, { color: style.color }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
      {snoozeOpen && (
        <View style={styles.snoozeRow}>
          {SNOOZE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.minutes}
              style={styles.snoozeOption}
              onPress={() => { onSnooze(opt.minutes); setSnoozeOpen(false); }}
            >
              <Text style={[styles.snoozeOptionText, { color: style.color }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
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

  const handleSnooze = async (id: string, minutes: 30 | 60 | 240) => {
    try {
      const res = await hvacAnalyticsApi.snoozeFinding(id, minutes);
      setData((prev) => prev ? { ...prev, findings: prev.findings.map((f) => f.id === id ? { ...f, snoozedUntil: res.snoozedUntil } : f) } : prev);
    } catch {
      Alert.alert('Something went wrong', 'Please try again in a moment.');
    }
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
      {(() => {
        const ch = data.componentHealth;
        const hero = OVERALL_HERO_STYLE[ch.overall.status];
        return (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <Text style={styles.heroEyebrow}>HVAC Health Overview</Text>
                <View style={[styles.heroPill, { backgroundColor: hero.iconColor + '2E' }]}>
                  <Text style={[styles.heroPillText, { color: hero.iconColor }]}>{hero.pillLabel}</Text>
                </View>
              </View>
              <View style={styles.heroMain}>
                <View style={[styles.heroBadge, { backgroundColor: hero.iconColor + '26' }]}>
                  <Ionicons name={hero.icon} size={26} color={hero.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroHeadline}>{hero.headline}</Text>
                  <Text style={styles.heroSub}>{ch.overall.monitoredCount} of {ch.overall.totalCount} components monitored</Text>
                </View>
              </View>
              <Text style={styles.heroFoot}>Last updated: {new Date(ch.overall.lastUpdated).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </View>

            <View>
              <Text style={styles.sectionLabel}>Component Health</Text>
              <View style={styles.card}>
                {ch.components.map((c) => <ComponentHealthRow key={c.id} item={c} />)}
              </View>
            </View>

            {ch.overall.monitoredCount < ch.overall.totalCount && (
              <View style={styles.monitorBanner}>
                <View style={styles.monitorDot}><Text style={styles.monitorDotText}>{ch.overall.monitoredCount}/{ch.overall.totalCount}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.monitorTxt}>{ch.overall.monitoredCount} of {ch.overall.totalCount} components monitored</Text>
                  <Text style={styles.monitorSub}>Add more sensors to unlock deeper HVAC insights</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.lanternDeep} />
              </View>
            )}
          </>
        );
      })()}

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
              <FindingCard key={f.id} item={f} onResolve={() => handleResolve(f.id)} onDismiss={() => handleDismiss(f.id)} onSnooze={(m) => handleSnooze(f.id, m)} />
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

  heroCard: { borderRadius: 18, padding: 16, backgroundColor: colors.slate },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEyebrow: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#8FA0A5' },
  heroPill: { paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 999 },
  heroPillText: { fontSize: 10.5, fontWeight: '800' },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  heroBadge: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  heroHeadline: { fontSize: 13.5, fontWeight: '800', color: '#F4F7F6', lineHeight: 18 },
  heroSub: { fontSize: 11, color: '#9DACB1', marginTop: 2 },
  heroFoot: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', fontSize: 10, color: '#7C8B90' },

  compRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.canvas },
  compIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  compName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.ink },
  compPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  compPillText: { fontSize: 9.5, fontWeight: '800' },

  monitorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(201,127,31,0.08)', borderWidth: 1, borderColor: 'rgba(201,127,31,0.22)', borderRadius: 14, padding: 12 },
  monitorDot: { width: 30, height: 30, borderRadius: 999, backgroundColor: 'rgba(201,127,31,0.16)', alignItems: 'center', justifyContent: 'center' },
  monitorDotText: { fontSize: 10, fontWeight: '800', color: colors.lanternDeep },
  monitorTxt: { fontSize: 12, fontWeight: '700', color: colors.ink },
  monitorSub: { fontSize: 10.5, color: colors.steel, marginTop: 1 },

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
  findingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
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

  snoozePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  snoozePillText: { fontSize: 9.5, fontWeight: '700', color: colors.steel },
  snoozeRow: { flexDirection: 'row', gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  snoozeOption: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  snoozeOptionText: { fontSize: 11, fontWeight: '700' },

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
