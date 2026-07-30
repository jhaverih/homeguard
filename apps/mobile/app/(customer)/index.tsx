import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuthStore } from '../../src/store/auth.store';
import { subscriptionsApi, requestsApi, paymentsApi, pricingApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { formatRelativeAge } from '../../src/utils/datetime';
import { colors } from '../../src/theme';
import { InspectIcon, RepairIcon, ImproveIcon, MaintainIcon, MarketplaceIcon } from '../../src/components/ServiceGroupIcons';

// A service with no requiredCapabilityId is open to any vendor — always
// available. 'all' means the availability fetch hasn't resolved (or the
// customer has no zip on file) — fail open, don't hide/flag anything.
const isServiceAvailable = (item: any, availableCapabilityIds: Set<string> | 'all') =>
  !item.requiredCapabilityId || availableCapabilityIds === 'all' || availableCapabilityIds.has(item.requiredCapabilityId);

// Categories with a dedicated configuration flow (bespoke pricing tables)
// instead of the standard request.tsx browse-and-book screen.
const MARKETPLACE_ROUTES: Record<string, string> = {
  HOUSE_CLEANING: '/(customer)/marketplace-house-cleaning',
  LAWN_LANDSCAPING: '/(customer)/marketplace-lawncare',
  PEST_CONTROL: '/(customer)/marketplace-pest-control',
};
const MARKETPLACE_CATEGORIES = new Set(Object.keys(MARKETPLACE_ROUTES));
const routeForItem = (item: any) =>
  MARKETPLACE_CATEGORIES.has(item.category)
    ? { pathname: MARKETPLACE_ROUTES[item.category] as any }
    : { pathname: '/(customer)/request' as const, params: { preselectServicePriceId: item.id } };

function ServiceSearchCard({ catalog, availableCapabilityIds, scrollViewRef }: { catalog: any[]; availableCapabilityIds: Set<string> | 'all'; scrollViewRef: React.RefObject<ScrollView | null> }) {
  const [query, setQuery] = useState('');
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
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
    router.push(routeForItem(item) as any);
  };

  const notifyMe = async (item: any) => {
    setNotifiedIds((prev) => new Set(prev).add(item.id));
    try {
      await pricingApi.notifyMe(item.id);
      Alert.alert('You\'re on the list', "We'll let you know when this is available near you.");
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save that — please try again.');
      setNotifiedIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
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
            results.map((item) => {
              const available = isServiceAvailable(item, availableCapabilityIds);
              if (available) {
                return (
                  <TouchableOpacity key={item.id} style={styles.searchResultRow} onPress={() => selectService(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchResultName}>{item.name}</Text>
                      <Text style={styles.searchResultDesc} numberOfLines={1}>{item.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mistDim} />
                  </TouchableOpacity>
                );
              }
              const notified = notifiedIds.has(item.id);
              return (
                <View key={item.id} style={[styles.searchResultRow, styles.searchResultRowDisabled]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.searchResultName, styles.searchResultNameDisabled]}>{item.name}</Text>
                    <Text style={styles.searchResultUnavailable}>Not available in your area yet</Text>
                  </View>
                  <TouchableOpacity onPress={() => !notified && notifyMe(item)} disabled={notified} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.notifyMeLink}>{notified ? 'We\'ll notify you' : 'Notify Me'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

// Explicit display order for the 3 inspection-named catalog items — see the
// matching constant in request.tsx. Only ever reorders these; everything
// else keeps its existing relative order (stable sort, ranks Infinity).
const INSPECTION_ORDER: Record<string, number> = {
  'General Inspection': 0,
  'Comprehensive Home Inspection': 1,
  'HVAC Full Inspection': 2,
};
const inspectionRank = (name: string) => INSPECTION_ORDER[name] ?? Infinity;

const GROUP_META = [
  { key: 'INSPECT', label: 'Inspect', Icon: InspectIcon },
  { key: 'REPAIR', label: 'Repair', Icon: RepairIcon },
  { key: 'IMPROVE', label: 'Improve', Icon: ImproveIcon },
  { key: 'MAINTAIN', label: 'Maintain', Icon: MaintainIcon },
  { key: 'MARKETPLACE', label: 'Marketplace', Icon: MarketplaceIcon },
];

// Replaces the old Plan/+Request Service card. Tapping a group icon filters
// the catalog to that group below it; tapping a service adds it to a running
// selection (mirroring request.tsx's toggleService picker) rather than
// navigating away immediately, so a customer can pick services across
// multiple groups before submitting them together. A selected item drops out
// of every group's filtered list — since only one group is expanded at a
// time this also means it won't reappear if the customer switches groups —
// and reappears only as a removable chip in the selection summary below.
function ServiceGroupsCard({ catalog, availableCapabilityIds, subscription, scrollViewRef }: { catalog: any[]; availableCapabilityIds: Set<string> | 'all'; subscription: any; scrollViewRef: React.RefObject<ScrollView | null> }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const cardY = useRef(0);
  const listOpacity = useSharedValue(0);
  const listTranslateY = useSharedValue(8);
  const animatedListStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
    transform: [{ translateY: listTranslateY.value }],
  }));

  const toggleGroup = (key: string) => setActiveGroup((prev) => (prev === key ? null : key));

  // Opening a group (not closing one) reveals a list that's often below the
  // fold — scroll the card up so it's visible instead of leaving the
  // customer to find it, and fade/slide the list in rather than popping it
  // in instantly. Scrolling the card to the top of the ScrollView is
  // naturally capped at the fixed black nav header (outside the ScrollView,
  // see (customer)/_layout.tsx) — there's nothing above the card to scroll
  // past, so no separate clamp is needed. Same 100ms-settle delay
  // ServiceSearchCard already uses before its own scrollTo, so the
  // just-expanded list has laid out before we measure/scroll to it.
  useEffect(() => {
    if (!activeGroup) return;
    listOpacity.value = 0;
    listTranslateY.value = 8;
    listOpacity.value = withTiming(1, { duration: 220 });
    listTranslateY.value = withTiming(0, { duration: 220 });
    const t = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, cardY.current - 12), animated: true });
    }, 100);
    return () => clearTimeout(t);
  }, [activeGroup]);

  const toggleService = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Unavailable services (no nearby vendor can perform them) are left out of
  // this browse view entirely — search (ServiceSearchCard) is where a
  // customer sees the "not available in your area yet" state instead.
  const groupItems = useMemo(() => {
    if (!activeGroup) return [];
    return catalog
      .filter((i) => i.serviceGroups?.includes(activeGroup) && !selectedIds.has(i.id) && isServiceAvailable(i, availableCapabilityIds))
      .sort((a, b) => inspectionRank(a.name) - inspectionRank(b.name));
  }, [activeGroup, catalog, selectedIds, availableCapabilityIds]);

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

  // Without a core plan, Inspect/Repair/Improve/Maintain don't apply — only
  // Marketplace items (e.g. Move-Out cleaning) are bookable subscription-free.
  // Still shown (not the old full-replacement "No Active Subscription" card)
  // so a non-member can actually reach that flow — see request.tsx's
  // createMarketplaceBooking and its requireCoreSubscription flag.
  const visibleGroups = subscription ? GROUP_META : GROUP_META.filter((g) => g.key === 'MARKETPLACE');

  return (
    <View style={styles.groupsCard} onLayout={(e) => { cardY.current = e.nativeEvent.layout.y; }}>
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

      {!subscription && (
        <TouchableOpacity style={styles.noSubNote} onPress={() => router.push('/(customer)/subscribe')}>
          <Text style={styles.noSubNoteText}>No active plan — Inspect/Repair/Improve/Maintain need a subscription. Tap to choose a plan.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.groupGrid}>
        {visibleGroups.map((g) => {
          const isActive = activeGroup === g.key;
          return (
            <TouchableOpacity
              key={g.key}
              style={styles.groupTile}
              onPress={() => toggleGroup(g.key)}
              activeOpacity={0.75}
            >
              <View style={[styles.groupIconWrap, isActive && styles.groupIconWrapActive]}>
                <g.Icon size={22} color={isActive ? colors.ink : colors.lanternDeep} />
              </View>
              <Text style={[styles.groupLabel, isActive && styles.groupLabelActive]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeGroup && (
        <Animated.View style={[styles.groupList, animatedListStyle]}>
          {groupItems.length === 0 ? (
            <Text style={styles.groupEmpty}>
              {catalog.some((i) => i.serviceGroups?.includes(activeGroup) && selectedIds.has(i.id))
                ? 'All services in this group are already selected below.'
                : catalog.some((i) => i.serviceGroups?.includes(activeGroup))
                ? 'Not available in your area yet.'
                : 'No services tagged for this group yet.'}
            </Text>
          ) : (
            groupItems.map((item) => {
              const isMarketplace = MARKETPLACE_CATEGORIES.has(item.category);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.groupItemRow}
                  onPress={() => (isMarketplace ? router.push(routeForItem(item) as any) : toggleService(item.id))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupItemName}>{item.name}</Text>
                    {!!item.description && <Text style={styles.groupItemDesc} numberOfLines={1}>{item.description}</Text>}
                  </View>
                  <Ionicons name={isMarketplace ? 'chevron-forward' : 'add-circle-outline'} size={22} color={colors.lanternDeep} />
                </TouchableOpacity>
              );
            })
          )}
        </Animated.View>
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
  // Which requiredCapabilityId values have a vendor near this customer who
  // can actually perform them — 'all' means don't filter (no zip on file
  // yet, or the fetch hasn't resolved). Drives which catalog items the
  // group-picker shows; ServiceSearchCard uses it to flag a match as
  // unavailable instead of hiding it outright.
  const [availableCapabilityIds, setAvailableCapabilityIds] = useState<Set<string> | 'all'>('all');
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
      pricingApi.getAvailability()
        .then((res: any) => setAvailableCapabilityIds(res.all ? 'all' : new Set(res.capabilityIds)))
        .catch(() => setAvailableCapabilityIds('all')),
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
    setPayingId(payment.id);
    try {
      // Ask the backend first instead of opening Stripe's payment sheet
      // directly against the stored client secret — that secret can point
      // at a PaymentIntent that's already past requires_payment_method (a
      // legacy authorized-but-never-captured hold, or a previous attempt
      // that didn't finish), which the sheet refuses to open at all.
      let result: any = await paymentsApi.authorize(payment.id);

      if (result.status === 'NEEDS_CLIENT_ACTION') {
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: result.clientSecret,
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

        result = await paymentsApi.authorize(payment.id);
      }

      Alert.alert('Payment Processed', `${fmtUSD(payment.amount)} charged. Thank you!`);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not process payment.');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <Text style={{ color: colors.mist }}>Ai</Text>
            </Text>
            <Text style={styles.aiCardSub}>Ask about maintenance, repairs & inspections</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mistDim} />
      </TouchableOpacity>

      <ServiceSearchCard catalog={catalog} availableCapabilityIds={availableCapabilityIds} scrollViewRef={dashScrollRef} />

      <ServiceGroupsCard catalog={catalog} availableCapabilityIds={availableCapabilityIds} subscription={subscription} scrollViewRef={dashScrollRef} />

      {/* Pending payments requiring authorization */}
      {/* Charged jobs are charged automatically at completion (see
          PaymentsService.chargeForCompletedService on the backend) — this
          card is now mostly a "you were charged" confirmation with a
          low-key way to flag a problem, not a payment-approval prompt. It
          only asks for action (Pay Now) in the rare case the automatic
          charge failed. It disappears on its own once the 48h dispute
          window closes (backend query, not client-side filtering). */}
      {pendingPayments.map((payment) => {
        const isCharged = payment.status === 'SUCCEEDED';
        const isPaying = payingId === payment.id;

        return (
          <View key={payment.id} style={[styles.paymentCard, isCharged && styles.paymentCardCharged]}>
            <View style={styles.paymentCardTop}>
              <View style={[styles.paymentIcon, isCharged && styles.paymentIconCharged]}>
                <Ionicons name={isCharged ? 'checkmark-circle' : 'card'} size={20} color={isCharged ? colors.lanternDeep : '#c05621'} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.paymentTitle}>
                  {isCharged ? `Service completed — ${fmtUSD(payment.amount)} charged` : payment.description}
                </Text>
                <Text style={styles.paymentSub}>
                  {isCharged ? payment.description : 'Payment needs your attention'}
                </Text>
              </View>
              {!isCharged && <Text style={styles.paymentAmount}>{fmtUSD(payment.amount)}</Text>}
            </View>

            <View style={styles.paymentActions}>
              {isCharged ? (
                <TouchableOpacity
                  onPress={() => router.push(
                    `/(customer)/dispute?serviceRequestId=${payment.serviceRequestId}&vendorId=${payment.vendorId}&stripePaymentIntentId=${payment.stripePaymentIntentId}&amount=${payment.amount}`
                  )}
                >
                  <Text style={styles.reportIssueLink}>Report an issue</Text>
                </TouchableOpacity>
              ) : (
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
  groupGrid: { flexDirection: 'row' },
  groupTile: { flex: 1, alignItems: 'center' },
  groupIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  groupIconWrapActive: { backgroundColor: colors.lantern },
  groupLabel: { fontSize: 10, fontWeight: '600', color: colors.steel, textAlign: 'center', lineHeight: 13 },
  groupLabelActive: { color: colors.lanternDeep },
  groupList: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  groupEmpty: { fontSize: 13, color: colors.steel, textAlign: 'center', paddingVertical: 16 },
  groupItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.canvas },
  groupItemName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  groupItemDesc: { fontSize: 12, color: colors.steel, marginTop: 1 },
  selectedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mist, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  selectedChipText: { fontSize: 12, fontWeight: '600', color: colors.ink, maxWidth: 160 },
  noSubNote: { backgroundColor: '#fff4e5', borderRadius: 10, borderWidth: 1, borderColor: '#f6ad55', padding: 10, marginBottom: 14 },
  noSubNoteText: { color: '#744210', fontSize: 12, lineHeight: 17 },
  paymentCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: '#fed7d7',
  },
  // Neutral/positive framing for the now-default "already charged" state —
  // the red warning border is reserved for the rare Pay Now fallback above.
  paymentCardCharged: { borderColor: colors.border },
  paymentCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  paymentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center' },
  paymentIconCharged: { backgroundColor: colors.mist },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  paymentSub: { fontSize: 12, color: colors.steel, marginTop: 2 },
  paymentAmount: { fontSize: 18, fontWeight: '800', color: '#c05621' },
  paymentActions: { flexDirection: 'row', gap: 8 },
  payNowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lantern, borderRadius: 10, padding: 12 },
  payNowBtnDisabled: { backgroundColor: colors.steel },
  payNowBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  reportIssueLink: { color: colors.steel, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline', padding: 4 },
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
  searchResultRowDisabled: { opacity: 0.85 },
  searchResultName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  searchResultNameDisabled: { color: colors.steel },
  searchResultDesc: { fontSize: 12, color: colors.steel, marginTop: 1 },
  searchResultUnavailable: { fontSize: 12, color: colors.steel, marginTop: 1, fontStyle: 'italic' },
  notifyMeLink: { fontSize: 12, fontWeight: '700', color: colors.lanternDeep },
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
