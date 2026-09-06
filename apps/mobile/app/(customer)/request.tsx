import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  requestsApi, userApi, subscriptionsApi, pricingApi, standaloneServiceApi,
  propertyCharacteristicsApi, PropertyCharacteristics,
} from '../../src/services/api';
import { scheduleLocalReminder } from '../../src/services/notifications';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';
import HomeCharacteristicsModal from '../../src/components/HomeCharacteristicsModal';
import FacilitatorDisclosureModal from '../../src/components/FacilitatorDisclosureModal';
import { useAuthStore } from '../../src/store/auth.store';
import { needsReacceptance } from '../../src/utils/legal';

function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{formatted}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker
            value={value} mode="date" minimumDate={new Date()}
            onChange={(_, d) => { setShowDate(false); if (d) { setTempDate(d); setShowTime(true); } }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate} mode="time"
            onChange={(_, d) => { setShowTime(false); if (d) onChange(d); }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <RNDateTimePicker
              value={value} mode="datetime" minimumDate={new Date()} display="inline" themeVariant="light"
              onChange={(_, d) => { if (d) onChange(d); }} style={{ alignSelf: 'center', height: 400 }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CATEGORY_ORDER = ['INTERIOR_REPAIRS_MAINTENANCE', 'MINOR_ELECTRICAL_ADJUSTMENTS', 'MINOR_PLUMBING_FIXES', 'MOUNTING_INSTALLATIONS', 'CARPENTRY_ASSEMBLY', 'EXTERIOR_OUTDOOR_SERVICES', 'HOUSE_CLEANING', 'LAWN_LANDSCAPING', 'PEST_CONTROL'];

// Explicit display order for the 3 inspection-named catalog items, which all
// carry category: null (so they'd otherwise just follow catalog/creation
// order in the trailing "Other Services" group). Only ever reorders these —
// everything else keeps its existing relative order (stable sort, ranks Infinity).
const INSPECTION_ORDER: Record<string, number> = {
  'Preventative Home Assessment': 0,
  'Comprehensive Home Assessment': 1,
  'HVAC Full Assessment': 2,
};
const inspectionRank = (name: string) => INSPECTION_ORDER[name] ?? Infinity;
const CATEGORY_LABELS: Record<string, string> = {
  INTERIOR_REPAIRS_MAINTENANCE: 'Interior Repairs and Maintenance',
  MINOR_ELECTRICAL_ADJUSTMENTS: 'Minor Electrical Adjustments',
  MINOR_PLUMBING_FIXES: 'Minor Plumbing Fixes',
  MOUNTING_INSTALLATIONS: 'Mounting and Installations',
  CARPENTRY_ASSEMBLY: 'Carpentry and Assembly',
  EXTERIOR_OUTDOOR_SERVICES: 'Exterior and Outdoor Services',
  HOUSE_CLEANING: 'House Cleaning',
  LAWN_LANDSCAPING: 'Lawn & Landscaping',
  PEST_CONTROL: 'Pest Control',
};

// Unit Label is now a fixed enum on the backend (not free text), so this
// maps the stored key to its display string instead of naively capitalizing.
const UNIT_LABEL_DISPLAY: Record<string, string> = {
  HOUR: 'Hour', SQ_FT: 'SqFt', BULB: 'Bulb', SERVICE_TRIP: 'Service Trip', AC_UNIT: 'AC Unit', NONE: 'None',
};
const unitLabelDisplay = (key: string | null | undefined) => (key ? UNIT_LABEL_DISPLAY[key] ?? key : '');
const hasUnitLabel = (item: any) => !!item?.quantityLabel && item.quantityLabel !== 'NONE';

export default function RequestScreen() {
  const [tab, setTab] = useState<'inspection' | 'service'>('inspection');
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [addonConfirmModal, setAddonConfirmModal] = useState(false);

  // Facilitator/agent disclosure — shown once, the first time a customer
  // submits either kind of request, before the existing addon/service
  // confirm modals. pendingSubmitRef remembers which flow's normal logic
  // to resume once the disclosure is confirmed, since either entry point
  // can trigger it.
  const { user, setUser, legalVersions } = useAuthStore();
  const needsFacilitatorDisclosure = !!user && needsReacceptance(user.facilitatorDisclosureVersion, legalVersions?.facilitatorDisclosureVersion);
  const [facilitatorModalVisible, setFacilitatorModalVisible] = useState(false);
  const [acceptingFacilitator, setAcceptingFacilitator] = useState(false);
  const pendingSubmitRef = useRef<(() => void) | null>(null);

  const gateOnFacilitatorDisclosure = (proceed: () => void) => {
    if (needsFacilitatorDisclosure) {
      pendingSubmitRef.current = proceed;
      setFacilitatorModalVisible(true);
    } else {
      proceed();
    }
  };

  const handleAcceptFacilitatorDisclosure = async () => {
    setAcceptingFacilitator(true);
    try {
      const updated: any = await userApi.acceptTerms('FACILITATOR_DISCLOSURE');
      setUser(updated);
      setFacilitatorModalVisible(false);
      pendingSubmitRef.current?.();
      pendingSubmitRef.current = null;
    } catch {
      Alert.alert('Error', 'Could not save your acceptance. Please try again.');
    } finally {
      setAcceptingFacilitator(false);
    }
  };

  // Catalog for service tab
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  // Which requiredCapabilityId values have a vendor near this customer who
  // can actually perform them — 'all' means don't filter (no zip on file
  // yet, or the fetch hasn't resolved). Only affects the browse display
  // below, not `catalog` itself — preselect matching (from the dashboard's
  // search/group picker) reads `catalog` directly and shouldn't break just
  // because this screen's own availability fetch is briefly still pending.
  const [availableCapabilityIds, setAvailableCapabilityIds] = useState<Set<string> | 'all'>('all');
  // Derived, display-only ordering/filtering — doesn't touch `catalog`
  // itself, which other logic (preselect matching, fetch guard) reads
  // independent of order or availability.
  const sortedCatalog = useMemo(() => {
    const rank = (c: string | null) => { const i = CATEGORY_ORDER.indexOf(c || ''); return i === -1 ? CATEGORY_ORDER.length : i; };
    return catalog
      .filter((i) => !i.requiredCapabilityId || availableCapabilityIds === 'all' || availableCapabilityIds.has(i.requiredCapabilityId))
      .sort((a, b) => {
        const catDiff = rank(a.category) - rank(b.category);
        return catDiff !== 0 ? catDiff : inspectionRank(a.name) - inspectionRank(b.name);
      });
  }, [catalog, availableCapabilityIds]);
  // Grouped by category so the list can collapse — ~70 items across 6
  // categories otherwise renders fully flat/open every time. Uncategorized
  // items (Roofing, Solar, etc.) get their own trailing "Other Services"
  // group instead of floating headerless at the end.
  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const item of sortedCatalog) {
      const key = item.category || 'OTHER';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    const orderedKeys = [...CATEGORY_ORDER.filter((k) => groups.has(k)), ...(groups.has('OTHER') ? ['OTHER'] : [])];
    return orderedKeys.map((key) => ({
      key,
      label: key === 'OTHER' ? 'Other Services' : (CATEGORY_LABELS[key] ?? key),
      items: groups.get(key)!,
    }));
  }, [sortedCatalog]);
  // Collapsed by default except the first category — combined with the
  // dashboard search (which deep-links straight to a service), this keeps
  // the page short for browsing without needing per-customer personalization
  // data, which doesn't exist anywhere in the backend today.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([CATEGORY_ORDER[0]]));
  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, string>>({});
  const [serviceConfirmModal, setServiceConfirmModal] = useState(false);
  const [characteristics, setCharacteristics] = useState<PropertyCharacteristics | null>(null);
  const [showCharModal, setShowCharModal] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [preferredDate, setPreferredDate] = useState(tomorrow);
  const [serviceDate, setServiceDate] = useState(new Date(tomorrow));
  const { prefilledNotes, preselectServicePriceId, preselectServicePriceIds, preferredDate: preferredDateParam } = useLocalSearchParams<{ prefilledNotes?: string; preselectServicePriceId?: string; preselectServicePriceIds?: string; preferredDate?: string }>();
  // True for BOTH the dashboard ServiceGroupsCard's multi-select handoff
  // (preselectServicePriceIds) and any single-item handoff — search bar,
  // eveAI "Book Now"/recommendation drafts (preselectServicePriceId). Either
  // one skips the tab switcher and full category browse in favor of a view
  // of just the already-picked service(s). Until 2026-07-19 the singular
  // case fell through to the full old tabbed browse screen instead — every
  // in-app entry point that hands off a specific service now lands on this
  // same trimmed review screen; the full browse/tab-switcher UI below is
  // only ever reached with zero preselect params, which no current
  // in-app navigation does (see the other apps/mobile call sites of
  // `/(customer)/request` — all either pass one of these two params or
  // route to the dashboard instead).
  const isPreselectedFlow = !!preselectServicePriceIds || !!preselectServicePriceId;
  const [notes, setNotes] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [solarMonthlyBill, setSolarMonthlyBill] = useState('');
  const [solarInterest, setSolarInterest] = useState<'solar_only' | 'solar_battery'>('solar_only');
  const [solarCoverage, setSolarCoverage] = useState<'whole_home' | 'partial'>('whole_home');

  // Profile address — loaded silently, not shown to customer
  const [profileAddress, setProfileAddress] = useState<{ address: string; city: string; state: string; zipCode: string } | null>(null);

  // Auto-scroll to a preselected (e.g. AI-recommended or search-selected)
  // service so the customer sees exactly what they're booking, instead of
  // having to scroll down and find it themselves. Tracked via each row's own
  // onLayout (its y is already relative to the ScrollView's content, since
  // the rows are direct children with no wrapping View in between) rather
  // than measureLayout, which depends on TouchableOpacity's ref reliably
  // exposing a measurable native handle — onLayout doesn't have that risk.
  const scrollViewRef = useRef<ScrollView>(null);
  const serviceRowY = useRef<Map<string, number>>(new Map());
  // Tracks the last preselectServicePriceId this screen has already acted
  // on, so a genuinely new "Book Now"/search tap starts a fresh booking
  // draft instead of silently merging with whatever's left over from an
  // earlier, possibly-abandoned selection (this screen stays mounted across
  // visits, so component state otherwise persists indefinitely). Reset to
  // null on Cancel so retapping the same recommendation still re-selects it.
  const lastPreselectedId = useRef<string | null>(null);
  // Same purpose as lastPreselectedId above, but for the multi-select
  // handoff from the dashboard's ServiceGroupsCard — keyed on the raw
  // comma-separated param so a genuinely new "Request N Services" tap
  // replaces the draft, matching lastPreselectedId's single-item behavior.
  const lastPreselectedIdsKey = useRef<string | null>(null);

  useEffect(() => {
    if (prefilledNotes) setNotes(prefilledNotes);
  }, [prefilledNotes]);

  // Same prefill, for the Service tab's notes field — needed now that
  // notes-carrying handoffs (e.g. eveAI's seasonal-tasks request) preselect
  // a specific catalog item and land directly on the Service tab instead of
  // the old free-text Inspection tab.
  useEffect(() => {
    if (prefilledNotes) setServiceNotes(prefilledNotes);
  }, [prefilledNotes]);

  useEffect(() => {
    if (preselectServicePriceId || preselectServicePriceIds) setTab('service');
  }, [preselectServicePriceId, preselectServicePriceIds]);

  useEffect(() => {
    if (!preferredDateParam) return;
    const d = new Date(preferredDateParam);
    if (!isNaN(d.getTime())) {
      setPreferredDate(d);
      setServiceDate(d);
    }
  }, [preferredDateParam]);

  useEffect(() => {
    userApi.getMe().then((res: any) => {
      const p = res?.customerProfile;
      if (p?.address) {
        setProfileAddress({ address: p.address, city: p.city, state: p.state, zipCode: p.zipCode });
      }
    }).catch(() => {});
    subscriptionsApi.getMySubscription().then((s: any) => setSubscription(s)).catch(() => {});
    propertyCharacteristicsApi.getMine().then((c) => setCharacteristics(c)).catch(() => {});
  }, []);

  // Accurate used+pending breakdown against the plan's shared inspection
  // allowance (apps/api/.../getInspectionsQuota) — subscription.inspectionsUsed
  // alone only reflects *completed* inspections, so it never moved when a
  // Preventative Home Assessment (or a built-in-tab inspection) was booked-but-pending,
  // and never moved back down when one was cancelled either. Refetched on
  // every focus (not just mount) so returning here after cancelling a
  // pending booking elsewhere shows the real, updated count.
  const [inspectionsQuota, setInspectionsQuota] = useState<{ used: number; pending: number; perYear: number; remaining: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      requestsApi.getInspectionsRemaining()
        .then((q: any) => setInspectionsQuota(q))
        .catch(() => {});
    }, []),
  );

  // Refetches every time the Additional Services tab regains focus (not just
  // once per mount) so an admin-side catalog edit — a rename, a price
  // change, a newly-flagged isQuotaInspection item — shows up without
  // requiring a full app restart. The spinner only shows on the very first
  // load; later refetches update the list quietly in the background.
  const catalogLoadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (tab !== 'service') return;
      if (!catalogLoadedOnce.current) setCatalogLoading(true);
      pricingApi.getAvailability()
        .then((res: any) => setAvailableCapabilityIds(res.all ? 'all' : new Set(res.capabilityIds)))
        .catch(() => setAvailableCapabilityIds('all'));
      pricingApi.getAll()
        .then((items: any) => {
          // Marketplace-tagged items (House Cleaning/Lawncare/Pest
          // Control's own catalog stubs, plus general items like Flooring
          // Services) are reachable only via the home screen's Marketplace
          // tab — they don't belong in this generic browse-everything list.
          const fresh = (items || []).filter((i: any) => i.customerRequestable !== false && !i.serviceGroups?.includes('MARKETPLACE'));
          setCatalog(fresh);
          // Keep an in-progress selection's entered quantities, just refresh
          // the underlying item data (name/price/flags) against the latest catalog.
          setSelectedServices((prev) => prev.map((s) => fresh.find((f: any) => f.id === s.id) || s));
          catalogLoadedOnce.current = true;
        })
        .catch(() => {})
        .finally(() => setCatalogLoading(false));
    }, [tab]),
  );

  // Re-runs on every new "Book Now"/search tap (not just the first catalog
  // fetch), so selection stays in sync with the scroll effect below even
  // when this screen is already mounted with a populated catalog from an
  // earlier visit. Replaces (not adds to) the current selection when the
  // preselect id genuinely changes — each Book Now/search tap represents a
  // fresh, decisive booking intent, not an incremental cart-add — so a
  // stale, cancelled-but-never-cleared selection can't linger and merge
  // with it. Manually checking multiple catalog cards still works exactly
  // as before via toggleService, unaffected by this.
  useEffect(() => {
    if (!preselectServicePriceId || catalog.length === 0) return;
    if (lastPreselectedId.current === preselectServicePriceId) return;
    const match = catalog.find((i: any) => i.id === preselectServicePriceId);
    if (!match) return;
    lastPreselectedId.current = preselectServicePriceId;
    setSelectedServices([match]);
    setServiceQuantities({});
    setServiceNotes('');
  }, [preselectServicePriceId, catalog]);

  // A preselected item's category may be collapsed by default — expand it,
  // otherwise its row never lays out and the scroll-to-item effect below
  // silently retries forever without ever finding a Y position.
  useEffect(() => {
    if (!preselectServicePriceId || catalog.length === 0) return;
    const match = catalog.find((i: any) => i.id === preselectServicePriceId);
    const key = match?.category || 'OTHER';
    setExpandedCategories((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, [preselectServicePriceId, catalog]);

  // Multi-item counterpart of the single-preselect effect above, used when
  // arriving from ServiceGroupsCard's "Request N Services" button. Replaces
  // (not merges with) the current selection, same reasoning as the
  // single-item case — a fresh submit tap is a decisive new booking intent.
  useEffect(() => {
    if (!preselectServicePriceIds || catalog.length === 0) return;
    if (lastPreselectedIdsKey.current === preselectServicePriceIds) return;
    const ids = preselectServicePriceIds.split(',').filter(Boolean);
    const matches = catalog.filter((i: any) => ids.includes(i.id));
    if (matches.length === 0) return;
    lastPreselectedIdsKey.current = preselectServicePriceIds;
    setSelectedServices(matches);
    setServiceQuantities({});
    setServiceNotes('');
  }, [preselectServicePriceIds, catalog]);

  // Expands every category containing a multi-preselected item, same reason
  // as the single-item version below — a collapsed category never lays out
  // its rows, which would otherwise leave those items invisibly selected.
  useEffect(() => {
    if (!preselectServicePriceIds || catalog.length === 0) return;
    const ids = preselectServicePriceIds.split(',').filter(Boolean);
    const matches = catalog.filter((i: any) => ids.includes(i.id));
    if (matches.length === 0) return;
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const m of matches) {
        const key = m.category || 'OTHER';
        if (!next.has(key)) { next.add(key); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [preselectServicePriceIds, catalog]);

  useEffect(() => {
    if (!preselectServicePriceId || catalog.length === 0) return;
    // The row's onLayout only fires after it — and any conditional content
    // it renders, e.g. the solar fields — has actually been laid out, so
    // retry until that Y is recorded rather than assuming one frame is enough.
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tryScroll = () => {
      const y = serviceRowY.current.get(preselectServicePriceId);
      if (y != null) {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
      } else if (attempt++ < 10) {
        timer = setTimeout(tryScroll, 120);
      }
    };
    timer = setTimeout(tryScroll, 80);
    return () => clearTimeout(timer);
  }, [catalog, preselectServicePriceId]);

  // Fully abandons the current service-request draft — used by every
  // "Cancel" path (the plain link below the form and the confirm modal's
  // Cancel button) plus after a successful submission, since this screen
  // stays mounted across visits and nothing else would otherwise clear it.
  const resetServiceDraft = () => {
    setSelectedServices([]);
    setServiceQuantities({});
    setServiceNotes('');
    setSolarMonthlyBill('');
    setSolarInterest('solar_only');
    setSolarCoverage('whole_home');
    lastPreselectedId.current = null;
    lastPreselectedIdsKey.current = null;
  };

  // Prefers the accurate used+pending breakdown once it's loaded; falls back
  // to the naive used-only calc only as a placeholder before that fetch
  // resolves (or if it fails), so nothing blocks on it.
  const inspectionsRemaining = inspectionsQuota
    ? inspectionsQuota.remaining
    : subscription
    ? Math.max(0, (subscription.plan?.inspectionsPerYear ?? 0) - (subscription.inspectionsUsed ?? 0))
    : null;
  const inspectionsConsumed = inspectionsQuota
    ? inspectionsQuota.used + inspectionsQuota.pending
    : (subscription?.inspectionsUsed ?? 0);
  const inspectionsPerYear = inspectionsQuota?.perYear ?? subscription?.plan?.inspectionsPerYear ?? 0;
  const limitReached = inspectionsRemaining !== null && inspectionsRemaining <= 0;
  const addonPrice = subscription?.plan?.addonInspectionPrice
    ? parseFloat(subscription.plan.addonInspectionPrice)
    : 79;

  // Mirrors apps/api/src/pricing/pricing.utils.ts calcTieredCost() — kept in
  // sync manually so the shown estimate matches what the server will charge.
  const tieredCost = (item: any, qty: number) => {
    const base = parseFloat(item.basePrice);
    if (item.pricingMethod !== 'PER_UNIT') return base;
    const include = item.includeQty != null ? parseFloat(item.includeQty) : 1;
    const baseRate = item.baseRateUnit != null ? parseFloat(item.baseRateUnit) : base;
    const threshold = item.volumeDiscountThreshold != null ? parseFloat(item.volumeDiscountThreshold) : Infinity;
    const volRate = item.volumeDiscountRate != null ? parseFloat(item.volumeDiscountRate) : 0;
    const tier2Qty = Math.max(0, Math.min(qty, threshold) - include);
    const tier3Qty = Math.max(0, qty - threshold);
    return base + tier2Qty * baseRate + tier3Qty * volRate;
  };

  // Same real Stripe rate as apps/api/src/pricing/pricing.utils.ts's
  // applyStripeFee() — mirrored locally for the same reason as tieredCost.
  const STRIPE_RATE = 0.029;
  const STRIPE_FIXED = 0.30;

  // Mirrors apps/api/src/pricing/pricing.utils.ts's DYNAMIC_GM_CATEGORIES/
  // GM_BRACKETS/calcGraduatedPrice — these 6 categories price via a
  // graduated bracket lookup on cost instead of a fixed gmPercent. No
  // materials exist yet at booking time, so this is just the estimate.
  const DYNAMIC_GM_CATEGORIES = new Set([
    'INTERIOR_REPAIRS_MAINTENANCE', 'MINOR_ELECTRICAL_ADJUSTMENTS', 'MINOR_PLUMBING_FIXES',
    'MOUNTING_INSTALLATIONS', 'CARPENTRY_ASSEMBLY', 'EXTERIOR_OUTDOOR_SERVICES',
  ]);
  const GM_BRACKETS = [
    { max: 150, gmPercent: 37.5 }, { max: 500, gmPercent: 32.5 }, { max: 1000, gmPercent: 27.5 },
    { max: 2500, gmPercent: 22.5 }, { max: Infinity, gmPercent: 17.5 },
  ];
  const calcGraduatedPrice = (totalCost: number) => {
    let remaining = totalCost, previousMax = 0, total = 0;
    for (const b of GM_BRACKETS) {
      const portion = Math.min(remaining, b.max - previousMax);
      if (portion <= 0) break;
      total += portion / (1 - b.gmPercent / 100);
      remaining -= portion;
      previousMax = b.max;
    }
    return total;
  };

  const customerPrice = (item: any, qty = 1) => {
    const cost = tieredCost(item, qty);
    const gm = item.gmPercent != null ? parseFloat(item.gmPercent) : 15;
    const subtotal = DYNAMIC_GM_CATEGORIES.has(item.category) ? calcGraduatedPrice(cost) : cost / (1 - gm / 100);
    return Math.ceil(subtotal + (subtotal * STRIPE_RATE + STRIPE_FIXED));
  };

  // The one catalog item flagged isQuotaInspection (see admin Pricing page)
  // is free while the plan's shared inspection allowance remains — mirrors
  // ServiceRequestsService.createStandaloneService on the backend, which is
  // what actually decides the charge; this only keeps the displayed
  // estimate honest.
  const isQuotaFree = (item: any) => !!item.isQuotaInspection && (inspectionsRemaining ?? 0) > 0;
  // useCharacteristicPricing items (Preventative Home Assessment) don't run
  // through the standard tiered/GM formula — their real price depends on
  // home characteristics collected just before booking (see
  // customerPriceDisplay's "From $X..." text for the catalog-browse
  // estimate) and is only known for certain once the backend computes it.
  const displayPrice = (item: any, qty = 1) => (
    isQuotaFree(item) ? 0 : item.useCharacteristicPricing ? Number(item.basePrice) : customerPrice(item, qty)
  );

  // Per Unit pricing floors the billed quantity at minimumQuantity (when
  // set) so the shown estimate always matches what will actually be
  // charged — the minimum is disclosed up front, not silently applied.
  const billedQtyFor = (item: any) => {
    if (!hasUnitLabel(item) || item.pricingMethod !== 'PER_UNIT') return 1;
    const entered = parseFloat(serviceQuantities[item.id] || '1') || 1;
    const minQty = item.minimumQuantity ? parseFloat(item.minimumQuantity) : 0;
    return minQty > 0 ? Math.max(entered, minQty) : entered;
  };

  const adjustQty = (itemId: string, delta: number) => {
    setServiceQuantities((q) => {
      const current = parseFloat(q[itemId] || '1') || 1;
      const next = Math.max(1, current + delta);
      return { ...q, [itemId]: String(next) };
    });
  };

  const totalServicePrice = selectedServices.reduce((sum, item) => {
    if (item.requiresQuote) return sum;
    return sum + displayPrice(item, billedQtyFor(item));
  }, 0);

  const toggleService = (item: any) => {
    setSelectedServices((prev) => {
      if (prev.some((s) => s.id === item.id)) return prev.filter((s) => s.id !== item.id);
      if (hasUnitLabel(item)) {
        const minQty = item.minimumQuantity ? String(Math.ceil(item.minimumQuantity)) : '';
        setServiceQuantities((q) => ({ ...q, [item.id]: q[item.id] || minQty }));
      }
      return [...prev, item];
    });
  };

  // Shared per-item card renderer — used by both the full category-browse
  // list below and the preselected-only view (see isPreselectedFlow) so a
  // customer arriving with services already picked from the dashboard's
  // ServiceGroupsCard keeps the exact same quantity-stepper/solar-field
  // interactivity as browsing the full catalog.
  const renderServiceCard = (item: any) => {
    const price = displayPrice(item, billedQtyFor(item));
    const isSelected = selectedServices.some((s) => s.id === item.id);
    const quotaFree = isQuotaFree(item);
    // The one useCharacteristicPricing item (Preventative Home Assessment) is
    // the only isQuotaInspection row — while quota remains it's genuinely
    // $0, so show what it'd normally cost struck through plus "Included"
    // instead of the generic bare "Included" text every other quota-covered
    // item would show (there are none today, but this stays scoped to this
    // item specifically via the `&& item.useCharacteristicPricing` check).
    const assessmentIncluded = item.useCharacteristicPricing && quotaFree;
    return (
      <Fragment key={item.id}>
        <TouchableOpacity
          onLayout={(e) => { serviceRowY.current.set(item.id, e.nativeEvent.layout.y); }}
          style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
          onPress={() => toggleService(item)}
          activeOpacity={0.85}
        >
          <View style={styles.serviceCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.serviceName, isSelected && styles.serviceNameSelected]}>{item.name}</Text>
              {!item.useCharacteristicPricing && <Text style={styles.serviceDesc}>{item.description}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
              {assessmentIncluded ? (
                <>
                  <Text style={styles.servicePriceStrike}>${Math.ceil(Number(item.basePrice))}</Text>
                  <Text style={styles.includedLabel}>Included</Text>
                </>
              ) : (
                <Text style={[styles.servicePrice, isSelected && styles.servicePriceSelected]}>
                  {item.requiresQuote ? 'Request a Quote'
                    : quotaFree ? 'Included'
                    : item.useCharacteristicPricing ? `From $${Math.ceil(Number(item.basePrice))}`
                    : `$${Number(price).toLocaleString('en-US')}`}
                </Text>
              )}
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={colors.lanternDeep} />
              )}
            </View>
          </View>
          {item.useCharacteristicPricing && !quotaFree && !item.requiresQuote && (
            <Text style={styles.priceNote}>Price varies based on your home details — confirmed before booking.</Text>
          )}
          {item.isQuotaInspection && subscription && (
            <View style={[styles.quotaPill, !quotaFree && styles.quotaPillWarn]}>
              <Ionicons
                name={quotaFree ? 'checkmark-circle-outline' : 'information-circle-outline'}
                size={13}
                color={quotaFree ? '#065f46' : '#92400e'}
              />
              <Text style={[styles.quotaPillText, !quotaFree && styles.quotaPillTextWarn]}>
                {inspectionsConsumed} of {inspectionsPerYear} assessments
              </Text>
            </View>
          )}
          {isSelected && hasUnitLabel(item) && (
            <>
              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>{unitLabelDisplay(item.quantityLabel)}</Text>
                <View style={styles.qtyStepper}>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); adjustQty(item.id, -1); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove-circle-outline" size={26} color={colors.lanternDeep} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.qtyInput}
                    placeholder={item.minimumQuantity ? String(Math.ceil(item.minimumQuantity)) : '0'}
                    placeholderTextColor={colors.steel}
                    keyboardType="number-pad"
                    value={serviceQuantities[item.id] || ''}
                    onChangeText={(v) => setServiceQuantities((q) => ({ ...q, [item.id]: v }))}
                    onPress={(e) => e.stopPropagation?.()}
                  />
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); adjustQty(item.id, 1); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add-circle-outline" size={26} color={colors.lanternDeep} />
                  </TouchableOpacity>
                </View>
              </View>
              {item.pricingMethod === 'PER_UNIT' && item.minimumQuantity > 0 && (
                <View style={styles.minQtyNotice}>
                  <Ionicons name="information-circle-outline" size={14} color="#92400e" />
                  <Text style={styles.minQtyNoticeText}>
                    Minimum {Math.ceil(item.minimumQuantity)} {unitLabelDisplay(item.quantityLabel)}{Math.ceil(item.minimumQuantity) !== 1 ? 's' : ''} will apply.
                  </Text>
                </View>
              )}
            </>
          )}
          {isSelected && item.name?.toLowerCase().includes('solar') && (
            <View style={styles.solarFields}>
              <Text style={styles.solarFieldsTitle}>Tell us about your energy needs</Text>

              <Text style={styles.label}>Average Monthly Electric Bill</Text>
              <View style={styles.billInputRow}>
                <Text style={styles.billDollar}>$</Text>
                <TextInput
                  style={styles.billInput}
                  keyboardType="number-pad"
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.steel}
                  value={solarMonthlyBill}
                  onChangeText={setSolarMonthlyBill}
                />
              </View>

              <Text style={styles.label}>What are you interested in?</Text>
              <View style={styles.choiceRow}>
                <TouchableOpacity
                  style={[styles.choiceBtn, solarInterest === 'solar_only' && styles.choiceBtnActive]}
                  onPress={() => setSolarInterest('solar_only')}
                >
                  <Text style={[styles.choiceBtnText, solarInterest === 'solar_only' && styles.choiceBtnTextActive]}>Solar Only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceBtn, solarInterest === 'solar_battery' && styles.choiceBtnActive]}
                  onPress={() => setSolarInterest('solar_battery')}
                >
                  <Text style={[styles.choiceBtnText, solarInterest === 'solar_battery' && styles.choiceBtnTextActive]}>Solar + Battery</Text>
                </TouchableOpacity>
              </View>

              {solarInterest === 'solar_battery' && (
                <>
                  <Text style={styles.label}>Backup Coverage</Text>
                  <View style={styles.choiceRow}>
                    <TouchableOpacity
                      style={[styles.choiceBtn, solarCoverage === 'whole_home' && styles.choiceBtnActive]}
                      onPress={() => setSolarCoverage('whole_home')}
                    >
                      <Text style={[styles.choiceBtnText, solarCoverage === 'whole_home' && styles.choiceBtnTextActive]}>Whole Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceBtn, solarCoverage === 'partial' && styles.choiceBtnActive]}
                      onPress={() => setSolarCoverage('partial')}
                    >
                      <Text style={[styles.choiceBtnText, solarCoverage === 'partial' && styles.choiceBtnTextActive]}>Partial Backup</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Fragment>
    );
  };

  const getAddress = () => profileAddress || { address: '', city: '', state: '', zipCode: '' };

  // --- Inspection tab ---
  const handleInspectionSubmit = () => {
    gateOnFacilitatorDisclosure(() => {
      if (limitReached) {
        setAddonConfirmModal(true);
      } else {
        doSubmitInspection(false);
      }
    });
  };

  const doSubmitInspection = async (isPaidAddon: boolean) => {
    setAddonConfirmModal(false);
    setLoading(true);
    const addr = getAddress();
    try {
      await requestsApi.create({
        preferredDate: preferredDate.toISOString(),
        customerNotes: notes,
        ...addr,
        isPaidAddon,
      });
      scheduleLocalReminder(
        preferredDate,
        'Upcoming Assessment',
        `Your Attenteve assessment is coming up on ${preferredDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
      ).catch(() => {});
      Alert.alert(
        'Request Sent!',
        isPaidAddon
          ? `Your additional assessment has been requested. You will be billed ${fmtUSD(addonPrice)} upon completion.`
          : 'We are finding available vendors. You will be notified when one accepts.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Service tab ---
  const handleServiceSubmit = () => {
    if (selectedServices.length === 0) {
      Alert.alert('Select a Service', 'Please choose at least one service from the list.');
      return;
    }
    gateOnFacilitatorDisclosure(() => {
      // A Preventative Home Assessment (isQuotaCovered aside) needs home
      // characteristics on file to price correctly — collect them first if
      // missing, same gate the backend itself enforces at booking time.
      const needsCharacteristics = selectedServices.some((s) => s.useCharacteristicPricing) && !characteristics;
      if (needsCharacteristics) {
        setShowCharModal(true);
        return;
      }
      setServiceConfirmModal(true);
    });
  };

  const doSubmitServices = async () => {
    // A unit count must be entered — the minimum itself is disclosed up
    // front (see the qty row's copy) and applied automatically below rather
    // than blocking submission.
    for (const svc of selectedServices) {
      if (hasUnitLabel(svc)) {
        const qty = parseFloat(serviceQuantities[svc.id] || '0');
        if (!qty || qty <= 0) {
          Alert.alert('Quantity Required', `Please enter the number of ${unitLabelDisplay(svc.quantityLabel)} for ${svc.name}.`);
          return;
        }
      }
    }
    setServiceConfirmModal(false);
    setLoading(true);
    const addr = getAddress();
    // Correlates multiple services from this one submission so a vendor
    // qualified for all of them can claim the whole visit in one action —
    // not a security-sensitive id, just needs to be unique per submission.
    const bookingGroupId = selectedServices.length > 1
      ? `bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      : undefined;
    try {
      for (const svc of selectedServices) {
        const enteredQty = hasUnitLabel(svc) ? parseFloat(serviceQuantities[svc.id] || '0') : undefined;
        // Floors the billed quantity at the disclosed minimum for Per Unit
        // services; quote-based services with a unit label (e.g. HVAC) just
        // pass the raw entered count through as quote context.
        const billedQty = enteredQty && svc.pricingMethod === 'PER_UNIT'
          ? Math.max(enteredQty, svc.minimumQuantity ? parseFloat(svc.minimumQuantity) : 0)
          : enteredQty;
        const unitLabel = unitLabelDisplay(svc.quantityLabel);
        let notes = billedQty ? `${billedQty} ${unitLabel}${serviceNotes ? ` — ${serviceNotes}` : ''}` : serviceNotes;
        if (svc.name?.toLowerCase().includes('solar') && solarMonthlyBill) {
          const interestLabel = solarInterest === 'solar_battery' ? `Solar + Battery (${solarCoverage === 'whole_home' ? 'Whole Home' : 'Partial Backup'})` : 'Solar Only';
          notes = `Monthly Bill: $${solarMonthlyBill}\nInterest: ${interestLabel}${notes ? `\n${notes}` : ''}`;
        }
        await standaloneServiceApi.create({
          servicePriceId: svc.id,
          preferredDate: serviceDate.toISOString(),
          customerNotes: notes,
          ...(billedQty ? { quantity: billedQty } : {}),
          ...(bookingGroupId ? { bookingGroupId } : {}),
          ...addr,
        });
      }
      const submittedCount = selectedServices.length;
      const submittedName = selectedServices[0]?.name;
      // Clear the draft now that it's been submitted — otherwise the
      // just-booked service(s) would still show as "selected" if the
      // customer returns to this screen later without a fresh preselect.
      resetServiceDraft();
      Alert.alert(
        'Service Requested!',
        submittedCount === 1
          ? `Your request for ${submittedName} has been sent.`
          : `${submittedCount} service requests have been sent. You will be notified when vendors accept.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (subscription === null && !loading) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={styles.container} contentContainerStyle={[styles.content, { alignItems: 'center', paddingTop: 60 }]}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Ionicons name="shield-outline" size={38} color={colors.lanternDeep} />
          </View>
          <Text style={[styles.title, { textAlign: 'center' }]}>Subscription Required</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            An Attenteve plan is required to request services. Choose a plan to get started.
          </Text>
          <TouchableOpacity
            style={[styles.button, { marginTop: 16, width: '100%' }]}
            onPress={() => router.push('/(customer)/subscribe')}
          >
            <Text style={styles.buttonText}>View Plans & Subscribe</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Request a Service</Text>

        {/* Tab switcher — hidden when arriving with a decided multi-selection */}
        {!isPreselectedFlow && (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'inspection' && styles.tabBtnActive]}
              onPress={() => setTab('inspection')}
            >
              <Ionicons name="clipboard-outline" size={16} color={tab === 'inspection' ? colors.ink : colors.lanternDeep} />
              <Text style={[styles.tabBtnText, tab === 'inspection' && styles.tabBtnTextActive]}>Assessment</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'service' && styles.tabBtnActive]}
              onPress={() => setTab('service')}
            >
              <Ionicons name="construct-outline" size={16} color={tab === 'service' ? colors.ink : colors.lanternDeep} />
              <Text style={[styles.tabBtnText, tab === 'service' && styles.tabBtnTextActive]}>Additional Services</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── INSPECTION TAB ─── */}
        {tab === 'inspection' && (
          <>
            <Text style={styles.subtitle}>
              Tell us when works best. An available vendor will accept and confirm.
            </Text>

            {subscription && (
              <View style={[styles.quotaBanner, limitReached ? styles.quotaBannerWarn : styles.quotaBannerOk]}>
                <Ionicons
                  name={limitReached ? 'alert-circle-outline' : 'shield-checkmark-outline'}
                  size={18}
                  color={limitReached ? '#92400e' : '#065f46'}
                />
                <Text style={[styles.quotaText, limitReached ? styles.quotaTextWarn : styles.quotaTextOk]}>
                  {limitReached
                    ? `All ${subscription.plan?.inspectionsPerYear} plan assessments used. Additional assessments available for ${fmtUSD(addonPrice)} each.`
                    : `${inspectionsRemaining} assessment${inspectionsRemaining === 1 ? '' : 's'} remaining on your plan.`
                  }
                </Text>
              </View>
            )}

            <DateTimeField label="Preferred Date & Time" value={preferredDate} onChange={setPreferredDate} />

            <Text style={styles.label}>Notes for the Vendor (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any special instructions..."
              placeholderTextColor={colors.steel}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>What's included in your assessment:</Text>
              <Text style={styles.infoItem}>✓ AC visual assessment & filter replacement</Text>
              <Text style={styles.infoItem}>✓ Toilet water leakage check</Text>
              <Text style={styles.infoItem}>✓ Sink & washer pan leak check</Text>
              <Text style={styles.infoItem}>✓ Light bulb replacement</Text>
              <Text style={styles.infoItem}>✓ Full checklist report after assessment</Text>
            </View>

            <View style={styles.noShowNotice}>
              <Ionicons name="information-circle-outline" size={16} color="#92400e" />
              <Text style={styles.noShowText}>
                You must be home when the vendor arrives. Cancelling less than 24 hours before your appointment incurs a $25 fee; a no-show is charged the full price of the service.
              </Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleInspectionSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.ink} />
                : <Text style={styles.buttonText}>
                    {limitReached ? `Book Additional Assessment (${fmtUSD(addonPrice)})` : 'Send Request'}
                  </Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ─── SERVICE TAB ─── */}
        {tab === 'service' && (
          <>
            <Text style={styles.subtitle}>
              {isPreselectedFlow
                ? 'Review your selected services below.'
                : 'Select one or more services. A vendor will come to your home on the requested date.'}
            </Text>

            {isPreselectedFlow && !!prefilledNotes && (
              <View style={styles.noShowNotice}>
                <Ionicons name="information-circle-outline" size={16} color="#92400e" />
                <Text style={styles.noShowText}>
                  The maintenance items you picked have been added as notes below — a vendor will complete them during this visit.
                </Text>
              </View>
            )}

            {catalogLoading ? (
              <ActivityIndicator color={colors.lanternDeep} style={{ marginVertical: 24 }} />
            ) : isPreselectedFlow ? (
              selectedServices.map((item) => renderServiceCard(item))
            ) : (
              groupedCatalog.map((group) => {
                const isExpanded = expandedCategories.has(group.key);
                return (
                  <View key={group.key} style={styles.categoryGroup}>
                    <TouchableOpacity style={styles.categoryHeaderRow} onPress={() => toggleCategory(group.key)} activeOpacity={0.7}>
                      <Text style={styles.categoryHeader}>{group.label}</Text>
                      <View style={styles.categoryHeaderRight}>
                        <Text style={styles.categoryCount}>{group.items.length}</Text>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.steel} />
                      </View>
                    </TouchableOpacity>
                    {isExpanded && group.items.map((item) => renderServiceCard(item))}
                  </View>
                );
              })
            )}

            {catalog.length > 0 && (
              <>
                <DateTimeField label="Preferred Date & Time" value={serviceDate} onChange={setServiceDate} />

                <Text style={styles.label}>Notes for the Vendor (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Any special instructions..."
                  placeholderTextColor={colors.steel}
                  value={serviceNotes}
                  onChangeText={setServiceNotes}
                  multiline
                  numberOfLines={4}
                />

                <View style={styles.noShowNotice}>
                  <Ionicons name="information-circle-outline" size={16} color="#92400e" />
                  <Text style={styles.noShowText}>
                    You must be home when the vendor arrives. Cancelling less than 24 hours before your appointment incurs a $25 fee; a no-show is charged the full price of the service.
                  </Text>
                </View>

                {/* Total bar */}
                {selectedServices.length > 0 && (
                  <View style={styles.totalBar}>
                    <View>
                      <Text style={styles.totalLabel}>{selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected</Text>
                      <Text style={styles.totalSub}>
                        {selectedServices.map((s) => s.name).join(', ')}
                      </Text>
                    </View>
                    <Text style={styles.totalAmount}>
                      {selectedServices.every((s) => s.requiresQuote)
                        ? 'Request Quote'
                        : selectedServices.some((s) => s.requiresQuote)
                        ? `$${Number(totalServicePrice).toLocaleString('en-US')}+`
                        : `$${Number(totalServicePrice).toLocaleString('en-US')}`
                      }
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.button, selectedServices.length === 0 && styles.buttonDisabled]}
                  onPress={handleServiceSubmit}
                  disabled={loading || selectedServices.length === 0}
                >
                  {loading
                    ? <ActivityIndicator color={colors.ink} />
                    : <Text style={styles.buttonText}>
                        {selectedServices.length === 0
                          ? 'Select Services Above'
                          : selectedServices.length === 1 && selectedServices[0].requiresQuote
                            ? `Request ${selectedServices[0].name} Quote`
                            : selectedServices.length === 1
                            ? `Request ${selectedServices[0].name}`
                            : selectedServices.every((s) => s.requiresQuote)
                            ? `Request ${selectedServices.length} Quotes`
                            : `Request ${selectedServices.length} Services`
                        }
                      </Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <TouchableOpacity
          onPress={() => { resetServiceDraft(); router.back(); }}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <FacilitatorDisclosureModal
          visible={facilitatorModalVisible}
          onAccept={handleAcceptFacilitatorDisclosure}
          loading={acceptingFacilitator}
        />

        {/* Addon inspection confirmation modal */}
        <Modal visible={addonConfirmModal} transparent animationType="fade">
          <View style={styles.addonOverlay}>
            <View style={styles.addonCard}>
              <Ionicons name="calendar-outline" size={40} color={colors.lanternDeep} style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.addonTitle}>Book Additional Assessment</Text>
              <Text style={styles.addonBody}>
                You've used all assessments included in your {subscription?.plan?.name}. This additional
                assessment will be billed separately.
              </Text>
              <View style={styles.addonPriceRow}>
                <Text style={styles.addonPriceLabel}>Additional Assessment Fee</Text>
                <Text style={styles.addonPrice}>{fmtUSD(addonPrice)}</Text>
              </View>
              <Text style={styles.addonNote}>Payment will be processed upon completion of the assessment.</Text>
              <TouchableOpacity style={styles.addonConfirmBtn} onPress={() => doSubmitInspection(true)}>
                <Text style={styles.addonConfirmText}>Confirm & Book — {fmtUSD(addonPrice)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addonCancelBtn} onPress={() => setAddonConfirmModal(false)}>
                <Text style={styles.addonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Service confirmation modal */}
        <Modal visible={serviceConfirmModal} transparent animationType="fade">
          <View style={styles.addonOverlay}>
            <View style={styles.addonCard}>
              <Ionicons name="construct-outline" size={40} color={colors.lanternDeep} style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.addonTitle}>Confirm Service Request</Text>
              <Text style={styles.addonBody}>
                A vendor will come to your home on your requested date to perform {selectedServices.length === 1 ? 'this service' : 'these services'}.
              </Text>
              {selectedServices.map((svc) => (
                <View key={svc.id} style={styles.addonPriceRow}>
                  <Text style={styles.addonPriceLabel}>
                    {svc.name}{hasUnitLabel(svc) && serviceQuantities[svc.id] ? ` (${serviceQuantities[svc.id]} ${unitLabelDisplay(svc.quantityLabel)})` : ''}
                  </Text>
                  <Text style={styles.addonPrice}>
                    {svc.requiresQuote ? 'Quote' : isQuotaFree(svc) ? 'Included' : `$${Number(displayPrice(svc, billedQtyFor(svc))).toLocaleString('en-US')}`}
                  </Text>
                </View>
              ))}
              {selectedServices.length > 1 && (
                <View style={[styles.addonPriceRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 12 }]}>
                  <Text style={[styles.addonPriceLabel, { fontWeight: '800' }]}>Total</Text>
                  <Text style={[styles.addonPrice, { fontSize: 20 }]}>${totalServicePrice}</Text>
                </View>
              )}
              <Text style={[styles.addonNote, { marginTop: 12 }]}>Payment will be processed upon completion.</Text>
              <TouchableOpacity style={styles.addonConfirmBtn} onPress={doSubmitServices}>
                <Text style={styles.addonConfirmText}>Confirm Request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addonCancelBtn}
                onPress={() => { setServiceConfirmModal(false); resetServiceDraft(); }}
              >
                <Text style={styles.addonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <HomeCharacteristicsModal
          visible={showCharModal}
          mode="assessment"
          initial={characteristics}
          onClose={() => setShowCharModal(false)}
          onSaved={(data) => {
            setCharacteristics(data);
            setShowCharModal(false);
            setServiceConfirmModal(true);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: colors.lanternDeep, marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 22, marginBottom: 16 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.mist, borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: colors.lantern },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  tabBtnTextActive: { color: colors.ink },
  quotaBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1 },
  quotaBannerOk: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  quotaBannerWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  quotaText: { fontSize: 13, lineHeight: 20, flex: 1 },
  quotaTextOk: { color: '#065f46' },
  quotaTextWarn: { color: '#92400e' },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: colors.lanternDeep, fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16, color: colors.ink },
  textArea: { height: 100, textAlignVertical: 'top' },
  infoBox: { backgroundColor: colors.mist, borderRadius: 12, padding: 16, marginBottom: 16 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep, marginBottom: 8 },
  infoItem: { fontSize: 14, color: colors.lanternDeep, lineHeight: 24 },
  noShowNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  noShowText: { fontSize: 12, color: '#92400e', lineHeight: 18, flex: 1 },
  button: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  doneBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  categoryGroup: { marginTop: 8 },
  categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryCount: { fontSize: 12, fontWeight: '600', color: colors.steel },
  categoryHeader: { fontSize: 13, fontWeight: '700', color: colors.steel, textTransform: 'uppercase', letterSpacing: 0.4 },
  serviceCard: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  serviceCardSelected: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  serviceCardRow: { flexDirection: 'row', alignItems: 'center' },
  serviceName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  serviceNameSelected: { color: colors.lanternDeep },
  serviceDesc: { fontSize: 13, color: colors.steel, lineHeight: 18 },
  servicePrice: { fontSize: 15, fontWeight: '700', color: colors.steel },
  servicePriceSelected: { color: colors.lanternDeep },
  servicePriceStrike: { fontSize: 14, fontWeight: '600', color: colors.steel, textDecorationLine: 'line-through' },
  includedLabel: { fontSize: 12, fontWeight: '700', color: '#059669' },
  priceNote: { fontSize: 12, color: colors.steel, marginTop: 6 },
  quotaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ecfdf5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 8, alignSelf: 'flex-start' },
  quotaPillWarn: { backgroundColor: '#fffbeb' },
  quotaPillText: { fontSize: 11, color: '#065f46', fontWeight: '600', flexShrink: 1 },
  quotaPillTextWarn: { color: '#92400e' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: colors.mist, borderRadius: 8, padding: 10 },
  qtyLabel: { fontSize: 13, color: colors.lanternDeep, fontWeight: '600', flex: 1 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: { width: 56, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 14, color: colors.ink, textAlign: 'center' },
  minQtyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6, paddingHorizontal: 2 },
  minQtyNoticeText: { fontSize: 12, color: '#92400e', lineHeight: 16, flex: 1 },
  totalBar: { backgroundColor: colors.ink, borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: colors.mist, marginBottom: 2 },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 220 },
  totalAmount: { fontSize: 22, fontWeight: '800', color: colors.mist },
  addonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  addonCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, maxHeight: '85%' },
  addonTitle: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, textAlign: 'center', marginBottom: 12 },
  addonBody: { fontSize: 14, color: colors.steel, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  addonPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.mist, borderRadius: 12, padding: 14, marginBottom: 8 },
  addonPriceLabel: { fontSize: 14, fontWeight: '600', color: colors.slate, flex: 1, marginRight: 8 },
  addonPrice: { fontSize: 18, fontWeight: '800', color: colors.lanternDeep },
  addonNote: { fontSize: 12, color: colors.steel, textAlign: 'center', marginBottom: 4 },
  addonConfirmBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10, marginTop: 12 },
  addonConfirmText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  addonCancelBtn: { alignItems: 'center', padding: 12 },
  addonCancelText: { color: colors.steel, fontSize: 14 },
  solarFields: { marginTop: 12, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#86efac' },
  solarFieldsTitle: { fontSize: 13, fontWeight: '700', color: '#065f46', marginBottom: 8 },
  billInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, marginBottom: 12 },
  billDollar: { fontSize: 16, color: colors.slate, marginRight: 4 },
  billInput: { flex: 1, fontSize: 16, padding: 10, color: colors.ink },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choiceBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: '#fff' },
  choiceBtnActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: colors.steel },
  choiceBtnTextActive: { color: colors.lanternDeep },
});
