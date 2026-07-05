import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { notificationsApi } from '../../src/services/api';

export default function VendorNotificationsScreen() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data: any = await notificationsApi.getAll();
      setNotifications(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date() } : n));
  };

  useEffect(() => { load(); }, []);
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>Notifications</Text>
      {notifications.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No notifications yet.</Text></View>
      ) : (
        notifications.map((n: any) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.card, !n.readAt && styles.cardUnread]}
            onPress={() => !n.readAt && markRead(n.id)}
          >
            <Text style={styles.cardTitle}>{n.title}</Text>
            <Text style={styles.cardBody}>{n.body}</Text>
            <Text style={styles.cardTime}>{new Date(n.createdAt).toLocaleString()}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0B4A45', margin: 16 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#888' },
  card: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: '#0B4A45' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0B4A45', marginBottom: 4 },
  cardBody: { fontSize: 14, color: '#555', lineHeight: 20 },
  cardTime: { fontSize: 12, color: '#aaa', marginTop: 8 },
});
