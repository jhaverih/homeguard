import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { alertsApi, subscriptionsApi, yolinkApi, MonitoringDevice } from '../../src/services/api';
import { useAlertsStore } from '../../src/store/alerts.store';
import { useLaunchFeatures } from '../../src/hooks/useLaunchFeatures';
import { colors } from '../../src/theme';

// MEDIUM/LOW are relabeled "Alert"/"Info" here rather than their raw severity
// names — for Home Sensors specifically (see YolinkService's EVENT_CONFIG),
// MEDIUM means an actual threshold was crossed (low/high temp, flooding) and
// LOW means device-health noise (battery, disconnect, routine status), so the
// badge should read as that distinction, not an internal priority tier.
const SEVERITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', icon: 'warning' as const, label: 'Critical' },
  HIGH:     { color: '#ea580c', bg: '#fff7ed', icon: 'alert-circle' as const, label: 'High' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', icon: 'notifications' as const, label: 'Alert' },
  LOW:      { color: '#2563eb', bg: '#eff6ff', icon: 'information-circle' as const, label: 'Info' },
};

function AlertCard({ item, onRead, onDispatch }: { item: any; onRead: () => void; onDispatch: () => void }) {
  const cfg = SEVERITY_CONFIG[item.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.MEDIUM;
  const isNew = item.status === 'NEW';
  const isResolved = item.status === 'RESOLVED';
  const hasDispatch = !!item.emergencyDispatchRequestedAt;

  return (
    <TouchableOpacity
      style={[styles.card, isNew && styles.cardUnread, isResolved && styles.cardResolved]}
      onPress={onRead}
      activeOpacity={0.85}
    >
      <View style={[styles.cardIcon, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {isNew && <View style={styles.newDot} />}
          <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        <Text style={styles.message}>{item.message}</Text>
        {item.deviceName && <Text style={styles.device}>{item.deviceName}</Text>}
        {isResolved ? (
          <View style={styles.dispatchedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.dispatchedText}>Resolved: back to normal{hasDispatch ? ' · dispatch was requested' : ''}</Text>
          </View>
        ) : hasDispatch ? (
          <View style={styles.dispatchedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.dispatchedText}>Emergency dispatch requested</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.dispatchBtn} onPress={onDispatch}>
            <Ionicons name="call" size={14} color="#dc2626" />
            <Text style={styles.dispatchBtnText}>Request Emergency Dispatch</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Only two device types exist today (temperature + water leak) — matches
// the backend's own MONITORED_DEVICE_TYPES filter in YolinkService, so
// anything else simply never appears rather than needing an "other" fallback.
const DEVICE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  THSensor: 'thermometer-outline',
  LeakSensor: 'water-outline',
};

function DeviceTile({ item }: { item: MonitoringDevice }) {
  return (
    <View style={styles.deviceTile}>
      <View style={styles.deviceTileTop}>
        <Ionicons name={DEVICE_ICONS[item.deviceType] ?? 'radio-outline'} size={16} color={colors.ink} />
        {/* The dot reflects connectivity only (streaming or not) — a leak
            sensor actively reporting a leak is still green; the reading text
            below is where that shows up. */}
        <View style={[styles.dot, item.isStreaming ? styles.dotOk : styles.dotOffline]} />
      </View>
      <Text style={styles.deviceName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.deviceState} numberOfLines={1}>
        {item.reading ?? (item.isStreaming ? 'Online' : 'Not streaming')}
      </Text>
    </View>
  );
}

export default function MonitoringScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [unread, setUnread] = useState(0);
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const { setUnreadCount, decrement: decrementBadge } = useAlertsStore();
  const { proactive } = useLaunchFeatures();

  const load = async () => {
    try {
      const [sub, alertsRes, devicesRes] = await Promise.all([
        subscriptionsApi.getMySubscription().catch(() => null),
        alertsApi.getMyAlerts(1, 50) as Promise<any>,
        yolinkApi.getDevices().catch(() => [] as MonitoringDevice[]),
      ]);
      setSubscription(sub);
      setAlerts(alertsRes.alerts ?? []);
      // Active (unresolved) alerts for the dashboard; an older server
      // without the endpoint falls back to everything not resolved.
      const active = await (alertsApi.getActiveAlerts() as Promise<any>).catch(() => null);
      setActiveAlerts(Array.isArray(active) ? active : (alertsRes.alerts ?? []).filter((a: any) => a.status !== 'RESOLVED'));
      setUnread(alertsRes.unread ?? 0);
      setUnreadCount(alertsRes.unread ?? 0);
      setDevices(devicesRes ?? []);
      setLoadError(false);
    } catch {
      // Previously unhandled — a network/auth failure silently rendered as
      // "All Clear" with no indication anything went wrong.
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleRead = async (id: string) => {
    const wasNew = [...alerts, ...activeAlerts].find((a) => a.id === id)?.status === 'NEW';
    await alertsApi.markRead(id).catch(() => {});
    // Resolved alerts stay resolved; only NEW ones become READ.
    const markRead = (a: any) => (a.id === id && a.status === 'NEW' ? { ...a, status: 'READ' } : a);
    setAlerts((prev) => prev.map(markRead));
    setActiveAlerts((prev) => prev.map(markRead));
    if (wasNew) {
      setUnread((n) => Math.max(0, n - 1));
      decrementBadge();
    }
  };

  const handleMarkAllRead = async () => {
    await alertsApi.markAllRead().catch(() => {});
    const markRead = (a: any) => (a.status === 'NEW' ? { ...a, status: 'READ' } : a);
    setAlerts((prev) => prev.map(markRead));
    setActiveAlerts((prev) => prev.map(markRead));
    setUnread(0);
    setUnreadCount(0);
  };

  const handleDispatch = (item: any) => {
    Alert.alert(
      '🚨 Request Emergency Dispatch?',
      `This will alert our response team immediately for:\n\n"${item.message}"\n\nOnly use for genuine emergencies.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Request Dispatch',
          style: 'destructive',
          onPress: async () => {
            try {
              await alertsApi.requestDispatch(item.id);
            } catch (e: any) {
              // e.g. the alert resolved meanwhile (sensor back to normal)
              Alert.alert('Not sent', e?.message || 'Could not request dispatch.');
              load();
              return;
            }
            const dispatched = (a: any) => (a.id === item.id ? { ...a, emergencyDispatchRequestedAt: new Date().toISOString(), status: 'READ' } : a);
            setAlerts((prev) => prev.map(dispatched));
            setActiveAlerts((prev) => prev.map(dispatched));
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  // Monitoring is included on every paid plan (CarePlus/BASIC and up) —
  // only the FREE tier (or no subscription at all) is gated out.
  const noMonitoringPlan = !subscription || subscription?.plan?.tier === 'FREE';
  const streamingCount = devices.filter((d) => d.isStreaming).length;

  return (
    <View style={styles.container}>
      {unread > 0 && !loadError && !noMonitoringPlan && (
        <View style={styles.topBar}>
          <Text style={styles.topBarText}>{unread} unread alert{unread !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={loadError || noMonitoringPlan ? styles.empty : { padding: 16, gap: 20 }}
      >
        {loadError ? (
          <View style={styles.emptyInner}>
            <Ionicons name="cloud-offline-outline" size={56} color="#fca5a5" />
            <Text style={styles.emptyTitle}>Couldn't load monitoring</Text>
            <Text style={styles.emptyText}>Pull down to try again.</Text>
          </View>
        ) : noMonitoringPlan ? (
          <View style={styles.emptyInner}>
            <Ionicons name="shield-outline" size={56} color={colors.lantern} />
            <Text style={styles.emptyTitle}>{proactive ? 'Home Monitoring Available' : 'Home Monitoring'}</Text>
            {proactive ? (
              <>
                <Text style={styles.emptyText}>Real-time sensor monitoring and alerts are included with the Proactive plan — upgrade to start monitoring your home.</Text>
                <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/(customer)/subscribe')}>
                  <Text style={styles.upgradeBtnText}>View Plans</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.ink} />
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyText}>Real-time sensor monitoring and alerts are coming soon.</Text>
            )}
          </View>
        ) : (
          <>
            <View>
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionLabel}>Home Sensors</Text>
                {devices.length > 0 && <Text style={styles.sectionCount}>{streamingCount} connected</Text>}
              </View>
              {devices.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>No sensors linked yet.</Text>
                </View>
              ) : (
                <View style={styles.deviceGrid}>
                  {devices.map((d) => <DeviceTile key={d.id} item={d} />)}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.analyticsCard}
              activeOpacity={0.85}
              onPress={() => router.push('/(customer)/hvac-analytics' as any)}
            >
              <View style={styles.analyticsIconWrap}>
                <Ionicons name="pulse-outline" size={20} color={colors.lanternDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.analyticsHeadline}>HVAC Analytics</Text>
                <Text style={styles.analyticsSub}>Trends, findings, and recommendations from your sensors</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.steel} />
            </TouchableOpacity>

            <View>
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionLabel}>{showHistory ? 'Alert History' : 'Active Alerts'}</Text>
                {!showHistory && unread > 0 && <Text style={styles.sectionCount}>{unread} unread</Text>}
              </View>
              {(showHistory ? alerts : activeAlerts).length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="shield-checkmark-outline" size={36} color="#a7f3d0" />
                  <Text style={styles.emptyCardTitle}>All Clear</Text>
                  <Text style={styles.emptyCardText}>
                    {showHistory ? 'No alerts from your home sensors yet.' : 'No active alerts. Your sensors are reporting normally.'}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.alertsScroll}
                  contentContainerStyle={{ gap: 12 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={(showHistory ? alerts : activeAlerts).length > 3}
                >
                  {(showHistory ? alerts : activeAlerts).map((item) => (
                    <AlertCard
                      key={item.id}
                      item={item}
                      onRead={() => handleRead(item.id)}
                      onDispatch={() => handleDispatch(item)}
                    />
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.historyLink} onPress={() => setShowHistory((v) => !v)}>
                <Text style={styles.historyLinkText}>{showHistory ? 'Show active alerts only' : 'Show alert history'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.haCard}
              activeOpacity={0.85}
              onPress={() => Alert.alert('Coming Soon', 'Home Assistant integration is on our roadmap — stay tuned!')}
            >
              <View style={styles.haIconWrap}>
                <Ionicons name="home-outline" size={22} color={colors.lantern} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.haHeadline}>Want more control?</Text>
                <Text style={styles.haSub}>Connect Home Assistant to add automations, lights, thermostats and more.</Text>
              </View>
              <View style={styles.haChip}>
                <Text style={styles.haChipText}>Explore</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarText: { fontSize: 13, color: colors.steel, fontWeight: '500' },
  markAllRead: { fontSize: 13, color: colors.lanternDeep, fontWeight: '600' },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.steel },
  sectionCount: { fontSize: 12, fontWeight: '600', color: colors.steel },

  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deviceTile: {
    width: '31%', backgroundColor: '#fff', borderRadius: 14, padding: 10, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  deviceTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: '#059669' },
  dotOffline: { backgroundColor: '#dc2626' },
  deviceName: { fontSize: 11, fontWeight: '700', color: colors.ink, lineHeight: 14 },
  deviceState: { fontSize: 10, color: colors.steel },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: colors.lanternDeep },
  cardResolved: { opacity: 0.75 },
  historyLink: { alignSelf: 'center', paddingVertical: 12 },
  historyLinkText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lanternDeep },
  time: { fontSize: 11, color: colors.steel, marginLeft: 'auto' },
  message: { fontSize: 14, fontWeight: '600', color: colors.ink, lineHeight: 20 },
  device: { fontSize: 12, color: colors.steel },
  dispatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  dispatchBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  dispatchedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  dispatchedText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },

  // Caps the list to roughly 3 alert cards tall (matching the mockup), same
  // as the mockup's own scoped "existing alert feed, unchanged styling"
  // note — the Home Assistant teaser stays reachable below without having
  // to scroll through every alert first; extra alerts scroll inside here.
  // Sized generously since a 2-line wrapped message pushes a card past 140dp.
  alertsScroll: { maxHeight: 450 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, alignItems: 'center', gap: 6 },
  emptyCardTitle: { fontSize: 15, fontWeight: '700', color: colors.lanternDeep },
  emptyCardText: { fontSize: 13, color: colors.steel, textAlign: 'center' },

  haCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.ink, borderRadius: 16, padding: 16,
  },
  haIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  haHeadline: { fontSize: 13, fontWeight: '700', color: '#EDF1F0', marginBottom: 2 },
  haSub: { fontSize: 11, color: '#8FA0A5', lineHeight: 15 },
  haChip: { backgroundColor: colors.lantern, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  haChipText: { fontSize: 11, fontWeight: '700', color: colors.ink },

  analyticsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  analyticsIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  analyticsHeadline: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 1 },
  analyticsSub: { fontSize: 11, color: colors.steel, lineHeight: 14 },

  empty: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.steel, textAlign: 'center', lineHeight: 20 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.lantern, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, marginTop: 20 },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
