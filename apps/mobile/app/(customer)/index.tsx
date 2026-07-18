import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuthStore } from '../../src/store/auth.store';
import { subscriptionsApi, requestsApi, paymentsApi, pricingApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { formatRelativeAge } from '../../src/utils/datetime';
import { colors } from '../../src/theme';

function ServiceSearchCard({ catalog, scrollViewRef }: { catalog: any[]; scrollViewRef: React.RefObject<ScrollView | null> }) {
  const [query, setQuery] = useState('');
  const cardY = useRef(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((i) => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, catalog]);

  const selectService = (item: any) => {
    setQuery('');
    router.push({ pathname: '/(customer)/request', params: { preselectServicePriceId: item.id } });
  };

  return (
    <View style={styles.searchCard} onLayout={(e) => { cardY.current = e.nativeEvent.layout.y; }}>
      <View style={styles.searchInputRow}>
        <Ionicons name="search" size={18} color={colors.steel} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for a service to book…"
          placeholderTextColor={colors.steel}
          value={query}
          onChangeText={setQuery}
          // A mid-content input inside a ScrollView doesn't scroll itself
          // into view when the keyboard opens — Android's adjustResize just
          // shrinks the window, it doesn't scroll to the focused field.
          onFocus={() => {
            setTimeout(() => scrollViewRef.current?.scrollTo({ y: Math.max(0, cardY.current - 12), animated: true }), 100);
          }}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mistDim} />
          </TouchableOpacity>
        )}
      </View>
      {query.trim().length > 0 && (
        <View style={styles.searchResults}>
          {results.length === 0 ? (
            <Text style={styles.searchNoResults}>No matching services.</Text>
          ) : (
            results.map((item) => (
              <TouchableOpacity key={item.id} style={styles.searchResultRow} onPress={() => selectService(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultName}>{item.name}</Text>
                  <Text style={styles.searchResultDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mistDim} />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const GROUP_META = [
  { key: 'INSPECT', label: 'Inspect', icon: 'home-outline' },
  { key: 'REPAIR', label: 'Repair', icon: 'construct-outline' },
  { key: 'IMPROVE', label: 'Improve', icon: 'sparkles-outline' },
  { key: 'MAINTAIN', label: 'Maintain', icon: 'refresh-outline' },
  { key: 'INSTALL', label: 'Install', icon: 'cube-outline' },
];

// Replaces the old Plan/+Request Service card. Tapping a group icon filters
// the catalog to that group below it; tapping a service adds it to a running
// selection (mirroring request.tsx's toggleService picker) rather than
// navigating away immediately, so a customer can pick services across
// multiple groups before submitting them together. A selected item drops out
// of every group's filtered list — since only one group is expanded at a
// time this also means it won't reappear if the customer switches groups —
// and reappears only as a removable chip in the selection summary below.
function ServiceGroupsCard({ catalog, subscription }: { catalog: any[]; subscription: any }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => setActiveGroup((prev) => (prev === key ? null : key));

  const toggleService = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const groupItems = useMemo(() => {
    if (!activeGroup) return [];
    return catalog.filter((i) => i.serviceGroups?.includes(activeGroup) && !selectedIds.has(i.id));
  }, [activeGroup, catalog, selectedIds]);

  const selectedItems = useMemo(
    () => catalog.filter((i) => selectedIds.has(i.id)),
    [catalog, selectedIds],
  );

  const handleRequest = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    setActiveGroup(null);
    router.push({ pathname: '/(customer)/request', params: { preselectServicePriceIds: ids.join(',') } });
  };

  return (
    <View style={styles.groupsCard}>
      <View style={styles.groupsHeader}>
        <Text style={styles.groupsTitle}>What does your home need?</Text>
        {subscription && (
          <View style={styles.planPill}>
            <Text style={styles.planPillText}>{subscription.plan?.name?.toUpperCase()}</Text>
            <View style={styles.planPillDot} />
            <Text style={styles.planPillStatus}>Active</Text>
          </View>
        )}
      </View>

      <View style={styles.groupGrid}>
        {GROUP_META.map((g) => {
          const isActive = activeGroup === g.key;
          return (
            <TouchableOpacity
              key={g.key}
              style={styles.groupTile}
              onPress={() => toggleGroup(g.key)}
              activeOpacity={0.75}
            >
              <View style={[styles.groupIconWrap, isActive && styles.groupIconWrapActive]}>
                <Ionicons name={g.icon as any} size={22} color={isActive ? colors.ink : colors.lanternDeep} />
              </View>
              <Text style={[styles.groupLabel, isActive && styles.groupLabelActive]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeGroup && (
        <View style={styles.groupList}>
          {groupItems.length === 0 ? (
            <Text style={styles.groupEmpty}>
              {catalog.some((i) => i.serviceGroups?.includes(activeGroup))
                ? 'All services in this group are already selected below.'
                : 'No services tagged for this group yet.'}
            </Text>
          ) : (
            groupItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.groupItemRow} onPress={() => toggleService(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupItemName}>{item.name}</Text>
                  {!!item.description && <Text style={styles.groupItemDesc} numberOfLines={1}>{item.description}</Text>}
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.lanternDeep} />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {selectedItems.length > 0 && (
        <>
          <View style={styles.selectedChipsRow}>
            {selectedItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.selectedChip} onPress={() => toggleService(item.id)}>
                <Text style={styles.selectedChipText} numberOfLines={1}>{item.name}</Text>
                <Ionicons name="close" size={14} color={colors.ink} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.requestBtn, { marginTop: 12 }]} onPress={handleRequest}>
            <Text style={styles.requestBtnText}>
              Request {selectedItems.length} Service{selectedItems.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const ACTIVE_STATUSES = ['PENDING', 'PENDING_CUSTOMER_REVIEW', 'ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'];


function UpcomingServiceCard({ requests }: { requests: any[] }) {
  const active = requests.filter((r) => ACTIVE_STATUSES.includes(r.status));

  const upcoming = active.sort((a, b) => {
    const aT = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
    const bT = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
    return aT - bT;
  })[0];

  const isEnRoute = upcoming?.status === 'VENDOR_EN_ROUTE';

  if (active.length === 0) return null;

  const isToday = upcoming.scheduledDate
    ? new Date(upcoming.scheduledDate).toDateString() === new Date().toDateString()
    : false;

  // etaMinutes comes from the server (ServiceRequest.etaMinutes, computed from
  // the vendor's live location vs. the property's ZIP centroid) — not the
  // customer's own device location. Staleness (a GPS ping older than 15 min)
  // is already gated server-side in the getter itself, so etaMinutes is only
  // ever non-null when it's fresh — no separate client-side age check needed.
  const hasVendorLocation = upcoming.vendorLatitude != null && upcoming.vendorLongitude != null;
  const etaLabel = upcoming.etaMinutes != null ? `~${upcoming.etaMinutes} min away` : '';
  const freshness = formatRelativeAge(upcoming.vendorLocationAt);

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
        <>
          <View style={styles.enRoutePill}>
            <Ionicons name="radio-button-on" size={10} color="#7c3aed" />
            <Text style={styles.enRoutePillText}>
              {etaLabel || (hasVendorLocation
                ? "Location update pending — vendor is on the way"
                : 'Vendor is heading to your location')}
            </Text>
          </View>
          {freshness !== '' && (
            <Text style={styles.upcomingEtaMeta}>{freshness}</Text>
          )}
        </>
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
  const [catalog, setCatalog] = useState<any[]>([]);
  const dashScrollRef = useRef<ScrollView>(null);

  const load = async () => {
    // Fired in parallel (not one-at-a-time) — this used to be 4 sequential
    // awaits and is now 5 since the pricing catalog fetch was folded in
    // (so an admin-side catalog edit shows up without a full app restart).
    // Running them one after another stretched out how long this screen
    // renders content mid-focus-transition, which made it easy to land in a
    // React Native ScrollView layout race on the tab-return from the
    // service-selection screen: content was there, but the ScrollView
    // hadn't recomputed its layout, so it rendered blank until something
    // (like pull-to-refresh) forced a fresh measure pass.
    await Promise.all([
      pricingApi.getAll()
        .then((items: any) => setCatalog((items || []).filter((i: any) => i.customerRequestable !== false)))
        .catch(() => {}),
      subscriptionsApi.getMySubscription().then((sub: any) => setSubscription(sub)).catch(() => {}),
      requestsApi.getMyRequests().then((reqs: any) => setRequests(reqs || [])).catch(() => {}),
      requestsApi.getPendingAdditionalServices()
        .then((approvals: any) => setPendingApprovals((approvals || []).length))
        .catch(() => {}),
      paymentsApi.getPending().then((payments: any) => setPendingPayments(payments || [])).catch(() => {}),
    ]);
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    load();
    // Belt-and-suspenders for the same layout race — resets scroll position
    // and forces the ScrollView to redo its layout pass every time this tab
    // regains focus, rather than relying on it to redraw correctly on its own.
    dashScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView
      ref={dashScrollRef}
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.firstName}!</Text>
        <Text style={styles.subtitle}>Your home is in good hands.</Text>
      </View>

      <UpcomingServiceCard requests={requests} />

      <TouchableOpacity style={styles.aiCard} onPress={() => router.push('/(customer)/assistant')}>
        <View style={styles.aiCardLeft}>
          <View style={styles.aiIcon}>
            <Ionicons name="chatbubbles" size={22} color={colors.mist} />
          </View>
          <View>
            <Text style={styles.aiCardTitle}>
              <Text style={{ color: colors.lantern }}>eve</Text>
              <Text style={{ color: colors.mist }}>AI</Text>
            </Text>
            <Text style={styles.aiCardSub}>Ask about maintenance, repairs & inspections</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mistDim} />
      </TouchableOpacity>

      <ServiceSearchCard catalog={catalog} scrollViewRef={dashScrollRef} />

      {subscription ? (
        <ServiceGroupsCard catalog={catalog} subscription={subscription} />
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
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: { backgroundColor: colors.ink, padding: 24, paddingTop: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.mist },
  subtitle: { fontSize: 14, color: colors.mistDim, marginTop: 4 },
  requestBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center' },
  requestBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  groupsCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  groupsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  groupsTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1, marginRight: 8 },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.mist, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  planPillText: { fontSize: 10, fontWeight: '800', color: colors.lanternDeep, letterSpacing: 0.4 },
  planPillDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#059669' },
  planPillStatus: { fontSize: 10, fontWeight: '700', color: '#059669' },
  groupGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  groupTile: { alignItems: 'center', width: '18%' },
  groupIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  groupIconWrapActive: { backgroundColor: colors.lantern },
  groupLabel: { fontSize: 11, fontWeight: '600', color: colors.steel, textAlign: 'center' },
  groupLabelActive: { color: colors.lanternDeep },
  groupList: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  groupEmpty: { fontSize: 13, color: colors.steel, textAlign: 'center', paddingVertical: 16 },
  groupItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.canvas },
  groupItemName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  groupItemDesc: { fontSize: 12, color: colors.steel, marginTop: 1 },
  selectedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mist, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  selectedChipText: { fontSize: 12, fontWeight: '600', color: colors.ink, maxWidth: 160 },
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
  searchCard: { margin: 16, marginTop: 8, backgroundColor: '#fff', borderRadius: 16, padding: 6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 2 },
  searchResults: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  searchNoResults: { fontSize: 13, color: colors.steel, padding: 12, textAlign: 'center' },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.canvas },
  searchResultName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  searchResultDesc: { fontSize: 12, color: colors.steel, marginTop: 1 },
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
  upcomingEtaMeta: { fontSize: 11, color: '#8b5cf6', marginBottom: 8, marginTop: -2 },
  upcomingCta: { fontSize: 12, color: colors.steel, fontWeight: '600' },
});
