import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi } from '../../src/services/api';

export default function ApprovalsScreen() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const load = async () => {
    try {
      const data: any = await requestsApi.getPendingAdditionalServices();
      setServices(data || []);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleApprove = (svc: any) => {
    Alert.alert(
      'Approve Service?',
      `Approve "${svc.name}" for $${Number(svc.price).toFixed(2)}? Your vendor will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setApproving(svc.id);
            try {
              await requestsApi.approveService(svc.id);
              setServices((prev) => prev.filter((s) => s.id !== svc.id));
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not approve service');
            } finally {
              setApproving(null);
            }
          },
        },
      ],
    );
  };

  const handleDecline = (svc: any) => {
    // Declining simply dismisses from the list locally — vendor's note stays on the request
    Alert.alert(
      'Dismiss Recommendation?',
      `Dismiss "${svc.name}"? You can still review it inside the inspection request.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dismiss', style: 'destructive', onPress: () => setServices((prev) => prev.filter((s) => s.id !== svc.id)) },
      ],
    );
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pending Approvals</Text>
        <Text style={styles.headerSub}>
          {services.length === 0
            ? 'You\'re all caught up!'
            : `${services.length} recommendation${services.length !== 1 ? 's' : ''} waiting for your review`}
        </Text>
      </View>

      {services.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={48} color="#17897D" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>No pending approvals</Text>
          <Text style={styles.emptyText}>Your vendor hasn't recommended any additional services yet.</Text>
        </View>
      ) : (
        services.map((svc) => {
          const req = svc.serviceRequest;
          const vendorName = req?.vendor
            ? `${req.vendor.firstName} ${req.vendor.lastName}`
            : 'Your vendor';
          const address = req ? `${req.address}, ${req.city}` : '';
          const reqDate = req?.scheduledDate
            ? new Date(req.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : null;

          return (
            <View key={svc.id} style={styles.card}>
              <View style={styles.cardMeta}>
                <View style={styles.iconWrap}>
                  <Ionicons name="construct" size={20} color="#0B4A45" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vendorName}>{vendorName} recommends</Text>
                  {address ? <Text style={styles.address}>{address}{reqDate ? ` · ${reqDate}` : ''}</Text> : null}
                </View>
              </View>

              <Text style={styles.serviceName}>{svc.name}</Text>
              <Text style={styles.serviceDesc}>{svc.description}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Quoted price</Text>
                <Text style={styles.price}>${Number(svc.price).toFixed(2)}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => handleDecline(svc)}
                  disabled={approving === svc.id}
                >
                  <Text style={styles.declineBtnText}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, approving === svc.id && styles.approveBtnLoading]}
                  onPress={() => handleApprove(svc)}
                  disabled={approving === svc.id}
                >
                  {approving === svc.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#0B4A45', padding: 24, paddingTop: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#a8c4e5', marginTop: 4 },
  emptyCard: { margin: 32, alignItems: 'center', paddingTop: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0B4A45', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 21 },
  card: { margin: 16, marginBottom: 0, backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EBF1EF', alignItems: 'center', justifyContent: 'center' },
  vendorName: { fontSize: 13, fontWeight: '600', color: '#0B4A45' },
  address: { fontSize: 12, color: '#64748b', marginTop: 2 },
  serviceName: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  serviceDesc: { fontSize: 14, color: '#475569', lineHeight: 21, marginBottom: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  priceLabel: { fontSize: 13, color: '#64748b' },
  price: { fontSize: 20, fontWeight: '800', color: '#0B4A45' },
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  approveBtn: { flex: 2, backgroundColor: '#0B4A45', borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approveBtnLoading: { opacity: 0.7 },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
