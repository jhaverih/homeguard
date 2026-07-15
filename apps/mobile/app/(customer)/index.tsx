import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import * as Location from 'expo-location';
import { useAuthStore } from '../../src/store/auth.store';
import { subscriptionsApi, requestsApi, paymentsApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

const ACTIVE_STATUSES = ['PENDING', 'PENDING_CUSTOMER_REVIEW', 'ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'];


function UpcomingServiceCard({ requests }: { requests: any[] }) {
  const active = requests.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const upcoming = active.sort((a, b) => {
    const aT = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
    const bT = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
    return aT - bT;
  })[0];

  const isEnRoute = upcoming?.status === 'VENDOR_EN_ROUTE';

  useEffect(() => {
    if (!isEnRoute || !upcoming?.vendorLatitude || !upcoming?.vendorLongitude) return;
    const ageMin = upcoming.vendorLocationAt
      ? (Date.now() - new Date(upcoming.vendorLocationAt).getTime()) / 60000
      : 999;
    if (ageMin > 15) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat2 = parseFloat(upcoming.vendorLatitude);
        const lon2 = parseFloat(upcoming.vendorLongitude);
        const R = 6371;
        const dLat = (lat2 - loc.coords.latitude) * Math.PI / 180;
        const dLon = (lon2 - loc.coords.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(loc.coords.latitude * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setEtaMinutes(Math.max(1, Math.round((distKm / 40) * 60)));
      } catch {}
    })();
  }, [isEnRoute, upcoming?.vendorLatitude, upcoming?.vendorLongitude, upcoming?.vendorLocationAt]);

  if (active.length === 0) return null;

  const isToday = upcoming.scheduledDate
    ? new Date(upcoming.scheduledDate).toDateString() === new Date().toDateString()
    : false;

  const etaLabel = etaMinutes != null
    ? `~${etaMinutes} min away`
    : (isEnRoute && upcoming.vendorLocationAt &&
      (Date.now() - new Date(upcoming.vendorLocationAt).getTime()) / 60000 < 15)
      ? `Location updated ${Math.round((Date.now() - new Date(upcoming.vendorLocationAt).getTime()) / 60000)} min ago`
      : '';

  return (
    <TouchableOpacity
      style={[styles.upcomingCard, isEnRoute && styles.upcomingCardEnRoute]}
      onPress={() => router.push(`/(customer)/request-detail?id=${upcoming.id}`)}
    >
      <View style={styles.upcomingHeader}>
        <Ionicons
          name={isEnRoute ? 'navigate' : (isToday ? 'today' : 'calendar')}
          size={20}
          color={isEnRoute ? '#7c3aed' : colors.lanternDeep}
        />
        <Text style={[styles.upcomingHeading, isEnRoute && { color: '#7c3aed' }]}>
          {isEnRoute ? 'Vendor On the Way' : isToday ? "Today's Service" : 'Upcoming Service'}
        </Text>
      </View>
      <Text style={styles.upcomingType}>
        {upcoming.type === 'ADDITIONAL_SERVICE'
          ? (upcoming.additionalServices?.[0]?.name || 'Service Request')
          : 'Home Inspection'}
      </Text>
      {upcoming.scheduledDate && (
        <Text style={styles.upcomingDate}>
          {new Date(upcoming.scheduledDate).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
          })}
        </Text>
      )}
      {isEnRoute && (
        <View style={styles.enRoutePill}>
          <Ionicons name="radio-button-on" size={10} color="#7c3aed" />
          <Text style={styles.enRoutePillText}>
            {etaLabel || 'Vendor is heading to your location'}
          </Text>
        </View>
      )}
      <Text style={styles.upcomingCta}>Tap to view details →</Text>
    </TouchableOpacity>
  );
}

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
        merchantDisplayName: 'Attenteve',
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
        `${fmtUSD(payment.amount)} authorized. Funds will be released in 48 hours unless a dispute is raised.`,
      );
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not process payment.');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

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
            <Text style={styles.requestBtnText}>+ Request Service</Text>
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
              <Text style={styles.paymentAmount}>{fmtUSD(payment.amount)}</Text>
            </View>

            {isAuthorized ? (
              <View style={styles.authorizedNote}>
                <Ionicons name="time-outline" size={14} color={colors.lanternDeep} />
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
                    ? <ActivityIndicator size="small" color={colors.ink} />
                    : <><Ionicons name="card" size={15} color={colors.ink} /><Text style={styles.payNowBtnText}> Pay Now</Text></>
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
            <Ionicons name="chatbubbles" size={22} color={colors.mist} />
          </View>
          <View>
            <Text style={styles.aiCardTitle}>AI Home Assistant</Text>
            <Text style={styles.aiCardSub}>Ask about maintenance, repairs & inspections</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mistDim} />
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

      <UpcomingServiceCard requests={requests} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: { backgroundColor: colors.ink, padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.mist },
  subtitle: { fontSize: 14, color: colors.mistDim, marginTop: 4 },
  subCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subTitle: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep },
  activeBadge: { backgroundColor: '#c6f6d5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  activeBadgeText: { color: '#059669', fontSize: 12, fontWeight: '600' },
  subStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.lanternDeep },
  statLabel: { fontSize: 12, color: colors.steel, marginTop: 2 },
  requestBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center' },
  requestBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
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
  paymentTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  paymentSub: { fontSize: 12, color: colors.steel, marginTop: 2 },
  paymentAmount: { fontSize: 18, fontWeight: '800', color: '#c05621' },
  authorizedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 8, marginBottom: 8 },
  authorizedNoteText: { fontSize: 12, color: colors.lanternDeep, flex: 1 },
  paymentActions: { flexDirection: 'row', gap: 8 },
  payNowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lantern, borderRadius: 10, padding: 12 },
  payNowBtnDisabled: { backgroundColor: colors.steel },
  payNowBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  disputeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fed7d7', borderRadius: 10, padding: 12, paddingHorizontal: 16 },
  disputeBtnText: { color: '#c53030', fontWeight: '700', fontSize: 14 },
  aiCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 16, marginTop: 8, backgroundColor: colors.ink, borderRadius: 14, padding: 16 },
  aiCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  aiIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiCardTitle: { fontSize: 15, fontWeight: '700', color: colors.mist },
  aiCardSub: { fontSize: 12, color: colors.mistDim, marginTop: 2 },
  approvalsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 0, backgroundColor: '#fff4e5', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#f6ad55' },
  approvalsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  approvalsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#feebc8', alignItems: 'center', justifyContent: 'center' },
  approvalsTitle: { fontSize: 14, fontWeight: '700', color: '#c05621' },
  approvalsSub: { fontSize: 12, color: '#744210', marginTop: 2 },
  approvalsBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ed8936', alignItems: 'center', justifyContent: 'center' },
  approvalsBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  upcomingCard: { margin: 16, marginTop: 8, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 },
  upcomingCardEnRoute: { borderColor: '#ddd6fe', backgroundColor: '#faf5ff' },
  upcomingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  upcomingHeading: { fontSize: 15, fontWeight: '700', color: colors.lanternDeep, flex: 1 },
  upcomingType: { fontSize: 13, color: colors.steel, marginBottom: 2 },
  upcomingDate: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  enRoutePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f3ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 8 },
  enRoutePillText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  upcomingCta: { fontSize: 12, color: colors.steel, fontWeight: '600' },
});
