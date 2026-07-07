import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { alertsApi } from '../../src/services/api';

const SEVERITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', icon: 'warning' as const, label: 'Critical' },
  HIGH:     { color: '#ea580c', bg: '#fff7ed', icon: 'alert-circle' as const, label: 'High' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', icon: 'notifications' as const, label: 'Medium' },
  LOW:      { color: '#2563eb', bg: '#eff6ff', icon: 'information-circle' as const, label: 'Info' },
};

function AlertCard({ item, onRead, onDispatch }: { item: any; onRead: () => void; onDispatch: () => void }) {
  const cfg = SEVERITY_CONFIG[item.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.MEDIUM;
  const isNew = item.status === 'NEW';
  const hasDispatch = !!item.emergencyDispatchRequestedAt;

  return (
    <TouchableOpacity
      style={[styles.card, isNew && styles.cardUnread]}
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
        {hasDispatch ? (
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

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatchModal, setDispatchModal] = useState<any>(null);

  const load = async () => {
    try {
      const res: any = await alertsApi.getMyAlerts();
      setAlerts(res.alerts ?? []);
      setUnread(res.unread ?? 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleRead = async (id: string) => {
    await alertsApi.markRead(id).catch(() => {});
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'READ' } : a));
    setUnread((n) => Math.max(0, n - 1));
  };

  const handleMarkAllRead = async () => {
    await alertsApi.markAllRead().catch(() => {});
    setAlerts((prev) => prev.map((a) => ({ ...a, status: 'READ' })));
    setUnread(0);
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
            await alertsApi.requestDispatch(item.id).catch(() => {});
            setAlerts((prev) => prev.map((a) =>
              a.id === item.id ? { ...a, emergencyDispatchRequestedAt: new Date().toISOString(), status: 'READ' } : a
            ));
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  return (
    <View style={styles.container}>
      {unread > 0 && (
        <View style={styles.topBar}>
          <Text style={styles.topBarText}>{unread} unread alert{unread !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={alerts.length === 0 ? styles.empty : { padding: 16, gap: 12 }}
      >
        {alerts.length === 0 ? (
          <View style={styles.emptyInner}>
            <Ionicons name="shield-checkmark-outline" size={56} color="#d1fae5" />
            <Text style={styles.emptyTitle}>All Clear</Text>
            <Text style={styles.emptyText}>No alerts from your home sensors yet.</Text>
          </View>
        ) : (
          alerts.map((item) => (
            <AlertCard
              key={item.id}
              item={item}
              onRead={() => handleRead(item.id)}
              onDispatch={() => handleDispatch(item)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topBarText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  markAllRead: { fontSize: 13, color: '#0B4A45', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#0B4A45' },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0B4A45' },
  time: { fontSize: 11, color: '#94a3b8', marginLeft: 'auto' },
  message: { fontSize: 14, fontWeight: '600', color: '#1e293b', lineHeight: 20 },
  device: { fontSize: 12, color: '#64748b' },
  dispatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  dispatchBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  dispatchedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  dispatchedText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  empty: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0B4A45', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
});
