import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuthStore } from '../../src/store/auth.store';
import { subscriptionsApi, requestsApi, paymentsApi } from '../../src/services/api';

export default function CustomerDashboard() {
  const { user } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [subscription, setSubscription] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const sub: any = await subscriptionsApi.getMySubscription();
      setSubscription(sub);
    } catch (e) {}
    try {
      const reqs: any = await requestsApi.getMyRequests();
      setRequests(reqs || []);
    } catch (e) {}
    try {
      const approvals: any = await requestsApi.getPendingAdditionalServices();
      setPendingApprovals((approvals || []).length);
    } catch (e) {}
    try {
      const payments = await paymentsApi.getPending();
      setPendingPayments(payments || []);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handlePayNow = async (payment: any) => {
    if (!payment.stripeClientSecret) {
      Alert.alert('Error', 'Payment details unavailable. Please contact support.');
      return;
    }

    setPayingId(payment.id);
    try {
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: payment.stripeClientSecret,
        merchantDisplayName: 'HomeGuard',
      });
      if (initError) {
        Alert.alert('Payment Setup Failed', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', presentError.message);
        }
        return;
      }

      // Notify backend that payment was authorized
      await paymentsApi.authorize(payment.id);
      Alert.alert(
        'Payment Authorized',
        `$${Number(payment.amount).toFixed(2)} authorized. Funds will be released in 48 hours unless a dispute is raised.`,
      );
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not process payment.');
    } finally {
      setPayingId(null);
    }
  };

  const statusColor: Record<string, string> = {
    PENDING: '#f6ad55', ACCEPTED: '#68d391', VENDOR_EN_ROUTE: '#4299e1',
    IN_PROGRESS: '#9f7aea', COMPLETED: '#2d7d46', CANCELLED: '#fc8181',
  };
  const statusLabel: Record<string, string> = {
    PENDING: 'Waiting for vendor', ACCEPTED: 'Scheduled', VENDOR_EN_ROUTE: 'Vendor on the way',
    IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.firstName}!</Text>
        <Text style={styles.subtitle}>Your home is in good hands.</Text>
      </View>

      {subscription ? (
        <View style={styles.subCard}>
          <View style={styles.subHeader}>
            <Text style={styles.subTitle}>{subscription.plan?.name}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>
          <View style={styles.subStats}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>
                {Math.max(0, subscription.plan?.inspectionsPerYear - subscription.inspectionsUsed -
                  requests.filter((r: any) => !['COMPLETED', 'CANCELLED'].includes(r.status)).length)}
              </Text>
              <Text style={styles.statLabel}>Left</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>
                {requests.filter((r: any) => !['COMPLETED', 'CANCELLED'].includes(r.status)).length}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{subscription.inspectionsUsed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.requestBtn} onPress={() => router.push('/(customer)/request')}>
            <Text style={styles.requestBtnText}>+ Request Inspection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.noSubCard} onPress={() => router.push('/(customer)/subscribe')}>
          <Text style={styles.noSubTitle}>No Active Subscription</Text>
          <Text style={styles.noSubText}>Tap to choose a plan and protect your home.</Text>
        </TouchableOpacity>
      )}

      {/* Pending payments requiring authorization */}
      {pendingPayments.map((payment) => {
        const isAuthorized = payment.status === 'AUTHORIZED';
        const isPaying = payingId === payment.id;

        return (
          <View key={payment.id} style={styles.paymentCard}>
            <View style={styles.paymentCardTop}>
              <View style={styles.paymentIcon}>
                <Ionicons name="card" size={20} color="#c05621" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.paymentTitle}>{payment.description}</Text>
                <Text style={styles.paymentSub}>
                  {isAuthorized ? 'Payment authorized — dispute window open' : 'Payment pending your approval'}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>${Number(payment.amount).toFixed(2)}</Text>
            </View>

            {isAuthorized ? (
              <View style={styles.authorizedNote}>
                <Ionicons name="time-outline" size={14} color="#2d7d46" />
                <Text style={styles.authorizedNoteText}>
                  Funds release {new Date(payment.disputeWindowExpiresAt).toLocaleDateString()} unless disputed
                </Text>
              </View>
            ) : null}

            <View style={styles.paymentActions}>
              {!isAuthorized && (
                <TouchableOpacity
                  style={[styles.payNowBtn, isPaying && styles.payNowBtnDisabled]}
                  onPress={() => handlePayNow(payment)}
                  disabled={isPaying}
                >
                  {isPaying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="card" size={15} color="#fff" /><Text style={styles.payNowBtnText}> Pay Now</Text></>
                  }
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.disputeBtn}
                onPress={() => router.push(
                  `/(customer)/dispute?serviceRequestId=${payment.serviceRequestId}&vendorId=${payment.vendorId}&stripePaymentIntentId=${payment.stripePaymentIntentId}&amount=${payment.amount}`
                )}
              >
                <Ionicons name="shield-half-outline" size={15} color="#c53030" />
                <Text style={styles.disputeBtnText}> Dispute</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={styles.aiCard} onPress={() => router.push('/(customer)/assistant')}>
        <View style={styles.aiCardLeft}>
          <View style={styles.aiIcon}>
            <Ionicons name="chatbubbles" size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.aiCardTitle}>AI Home Assistant</Text>
            <Text style={styles.aiCardSub}>Ask about maintenance, repairs & inspections</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#a8c4e5" />
      </TouchableOpacity>

      {pendingApprovals > 0 && (
        <TouchableOpacity style={styles.approvalsCard} onPress={() => router.push('/(customer)/approvals')}>
          <View style={styles.approvalsLeft}>
            <View style={styles.approvalsIcon}>
              <Ionicons name="construct" size={20} color="#c05621" />
            </View>
            <View>
              <Text style={styles.approvalsTitle}>Additional Services Pending</Text>
              <Text style={styles.approvalsSub}>
                {pendingApprovals} recommendation{pendingApprovals !== 1 ? 's' : ''} need{pendingApprovals === 1 ? 's' : ''} your approval
              </Text>
            </View>
          </View>
          <View style={styles.approvalsBadge}>
            <Text style={styles.approvalsBadgeText}>{pendingApprovals}</Text>
          </View>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Recent Requests</Text>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No requests yet. Tap "Request Inspection" to get started!</Text>
        </View>
      ) : (
        requests.slice(0, 5).map((req: any) => (
          <TouchableOpacity
            key={req.id}
            style={styles.requestCard}
            onPress={() => router.push(`/(customer)/request-detail?id=${req.id}`)}
          >
            <View style={styles.requestCardHeader}>
              <Text style={styles.requestDate}>
                {req.scheduledDate
                  ? new Date(req.scheduledDate).toLocaleDateString()
                  : `Preferred: ${new Date(req.preferredDate).toLocaleDateString()}`}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor[req.status] + '25' }]}>
                <Text style={[styles.statusText, { color: statusColor[req.status] }]}>
                  {statusLabel[req.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.requestAddress}>{req.address}, {req.city}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#1e3a5f', padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#a8c4e5', marginTop: 4 },
  subCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subTitle: { fontSize: 18, fontWeight: '700', color: '#1e3a5f' },
  activeBadge: { backgroundColor: '#c6f6d5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  activeBadgeText: { color: '#2d7d46', fontSize: 12, fontWeight: '600' },
  subStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#1e3a5f' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  requestBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center' },
  requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  noSubCard: { margin: 16, backgroundColor: '#fff4e5', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: '#f6ad55' },
  noSubTitle: { fontSize: 16, fontWeight: '700', color: '#c05621', marginBottom: 4 },
  noSubText: { color: '#744210', fontSize: 14 },
  paymentCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: '#fed7d7',
  },
  paymentCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  paymentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center' },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  paymentSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  paymentAmount: { fontSize: 18, fontWeight: '800', color: '#c05621' },
  authorizedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 8, marginBottom: 8 },
  authorizedNoteText: { fontSize: 12, color: '#2d7d46', flex: 1 },
  paymentActions: { flexDirection: 'row', gap: 8 },
  payNowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e3a5f', borderRadius: 10, padding: 12 },
  payNowBtnDisabled: { backgroundColor: '#94a3b8' },
  payNowBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disputeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fed7d7', borderRadius: 10, padding: 12, paddingHorizontal: 16 },
  disputeBtnText: { color: '#c53030', fontWeight: '700', fontSize: 14 },
  aiCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 16, marginTop: 8, backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16 },
  aiCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  aiIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiCardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  aiCardSub: { fontSize: 12, color: '#a8c4e5', marginTop: 2 },
  approvalsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 0, backgroundColor: '#fff4e5', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#f6ad55' },
  approvalsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  approvalsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#feebc8', alignItems: 'center', justifyContent: 'center' },
  approvalsTitle: { fontSize: 14, fontWeight: '700', color: '#c05621' },
  approvalsSub: { fontSize: 12, color: '#744210', marginTop: 2 },
  approvalsBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ed8936', alignItems: 'center', justifyContent: 'center' },
  approvalsBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e3a5f', margin: 16, marginBottom: 8 },
  emptyCard: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22 },
  requestCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  requestCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  requestDate: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: '600' },
  requestAddress: { fontSize: 14, color: '#666' },
});
