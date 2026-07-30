import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { marketplaceApi } from '../../src/services/api';
import { colors } from '../../src/theme';

type Mode = 'package' | 'service';
type AddOnSelection = { qty: string; frequency?: string };
type ServiceQuote = { price: number; discountRate: number; comped: boolean };

// Nest/station counts are per-booking decisions, not standing property
// attributes, so they don't get a property-profile-derived default.
const MANUAL_QTY_SERVICES = new Set(['rodent_bait_station_service', 'wasp_nest_removal']);

const PROFILE_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'homeSqFt', label: 'Home Square Footage', unit: 'sq ft' },
  { key: 'propertyAcreage', label: 'Property Acreage', unit: 'acres' },
];

const HOME_SQFT_KEYS = new Set([
  'initial_pest_treatment', 'quarterly_pest_treatment', 'pest_control_membership',
  'premium_pest_mosquito_membership', 'ultimate_protection_membership',
]);
const ACREAGE_KEYS = new Set(['mosquito_treatment', 'flea_tick_treatment', 'fire_ant_treatment']);

// Mirrors resolvePestServiceQty() in
// apps/api/src/marketplace/marketplace-pest-pricing.utils.ts, purely to
// pre-fill the editable qty input — the actual charged price always comes
// from the live quotePest() call, never computed client-side.
function displayQtyFromProfile(serviceKey: string, profile: any): number | null {
  if (!profile) return null;
  if (HOME_SQFT_KEYS.has(serviceKey)) return Number(profile.homeSqFt) || 0;
  if (ACREAGE_KEYS.has(serviceKey)) return Number(profile.propertyAcreage) || 0;
  return null; // flat services: rodent_inspection, crawlspace_attic_inspection, emergency_pest_visit, annual_pest_inspection
}

export default function MarketplacePestControlScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [config, setConfig] = useState<{ services: any[]; packages: any[] } | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<Mode>('package');
  const [packageKey, setPackageKey] = useState<string | null>(null);
  const [packageQuote, setPackageQuote] = useState<{ monthlyPrice: number } | null>(null);
  const [packageQuoting, setPackageQuoting] = useState(false);

  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, AddOnSelection>>({});
  const [addOnQuotes, setAddOnQuotes] = useState<Record<string, ServiceQuote>>({});
  const [addOnQuoting, setAddOnQuoting] = useState<Record<string, boolean>>({});
  const quoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [preferredDate, setPreferredDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; });
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    Promise.all([marketplaceApi.getPestConfig(), marketplaceApi.getPestPropertyProfile()])
      .then(([c, p]) => {
        setConfig(c);
        setProfile(p);
        if (!p) setEditingProfile(true);
      })
      .catch(() => Alert.alert('Error', 'Could not load Pest Control options.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedPackage = config?.packages.find((p) => p.key === packageKey) ?? null;
  const hasProfile = !!profile;
  const includedServiceKeys = new Set(selectedPackage?.composition?.map((c: any) => c.serviceKey) ?? []);
  const visibleServices = config?.services.filter((s) => !includedServiceKeys.has(s.key)) ?? [];

  const openProfileEditor = () => {
    setProfileDraft(Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, profile?.[f.key] != null ? String(profile[f.key]) : ''])));
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload: Record<string, number> = {};
      for (const f of PROFILE_FIELDS) {
        const raw = profileDraft[f.key];
        if (raw != null && raw !== '') payload[f.key] = Number(raw);
      }
      const saved = await marketplaceApi.savePestPropertyProfile(payload);
      setProfile(saved);
      setEditingProfile(false);
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const togglePackage = (key: string) => {
    setPackageKey((prev) => (prev === key ? null : key));
  };

  // Package mode: real computed price, depends on the saved profile.
  useEffect(() => {
    if (mode !== 'package' || !selectedPackage || !hasProfile || editingProfile) { setPackageQuote(null); return; }
    setPackageQuoting(true);
    marketplaceApi.quotePest({ mode: 'package', packageKey: selectedPackage.key })
      .then((q: any) => setPackageQuote(q)).catch(() => setPackageQuote(null)).finally(() => setPackageQuoting(false));
  }, [mode, selectedPackage, hasProfile, editingProfile]);

  const toggleAddOn = (service: any) => {
    setSelectedAddOns((prev) => {
      const next = { ...prev };
      if (next[service.key]) {
        delete next[service.key];
      } else {
        const defaultQty = MANUAL_QTY_SERVICES.has(service.key) ? '' : String(displayQtyFromProfile(service.key, profile) ?? 0);
        next[service.key] = { qty: defaultQty, frequency: service.frequencyDiscounts?.length > 0 ? 'MONTHLY' : undefined };
      }
      return next;
    });
  };

  const updateAddOnQty = (key: string, qty: string) => {
    setSelectedAddOns((prev) => ({ ...prev, [key]: { ...prev[key], qty: qty.replace(/[^0-9.]/g, '') } }));
  };

  const updateAddOnFrequency = (key: string, frequency: string) => {
    setSelectedAddOns((prev) => ({ ...prev, [key]: { ...prev[key], frequency } }));
  };

  // Debounced live quote, per selected add-on row. Fixed-price services
  // (Rodent Inspection, etc.) have no qty at all, so an empty qty is fine
  // for them — only block quoting for qty-based services without a value.
  useEffect(() => {
    for (const [key, sel] of Object.entries(selectedAddOns)) {
      if (quoteTimers.current[key]) clearTimeout(quoteTimers.current[key]);
      const service = config?.services.find((s) => s.key === key);
      const needsQty = MANUAL_QTY_SERVICES.has(key) || HOME_SQFT_KEYS.has(key) || ACREAGE_KEYS.has(key);
      const qtyNum = Number(sel.qty || 0);
      if (needsQty && (!sel.qty || Number.isNaN(qtyNum) || qtyNum < 0)) { setAddOnQuotes((p) => { const n = { ...p }; delete n[key]; return n; }); continue; }
      setAddOnQuoting((p) => ({ ...p, [key]: true }));
      quoteTimers.current[key] = setTimeout(() => {
        marketplaceApi.quotePest({ mode: 'service', serviceKey: key, qty: needsQty ? qtyNum : undefined, frequency: sel.frequency })
          .then((q: any) => setAddOnQuotes((p) => ({ ...p, [key]: q })))
          .catch(() => setAddOnQuotes((p) => { const n = { ...p }; delete n[key]; return n; }))
          .finally(() => setAddOnQuoting((p) => ({ ...p, [key]: false })));
      }, 400);
    }
    // Drop quotes for rows that are no longer selected.
    setAddOnQuotes((p) => {
      const n: Record<string, ServiceQuote> = {};
      for (const k of Object.keys(p)) if (selectedAddOns[k]) n[k] = p[k];
      return n;
    });
    return () => { Object.values(quoteTimers.current).forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddOns]);

  const addOnTotal = Object.values(addOnQuotes).reduce((sum, q) => sum + q.price, 0);
  const anyAddOnQuoting = Object.values(addOnQuoting).some(Boolean);
  const selectedAddOnKeys = Object.keys(selectedAddOns);

  const presentStripeSheet = async (clientSecret: string | null): Promise<boolean> => {
    if (!clientSecret) return true;
    const { error: initError } = await initPaymentSheet({ paymentIntentClientSecret: clientSecret, merchantDisplayName: 'Attenteve', allowsDelayedPaymentMethods: false });
    if (initError) { Alert.alert('Payment Setup Failed', initError.message); return false; }
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) { if (presentError.code !== 'Canceled') Alert.alert('Payment Failed', presentError.message); return false; }
    return true;
  };

  const doSubscribe = async () => {
    if (!selectedPackage) return;
    setSubmitting(true);
    try {
      const res = await marketplaceApi.subscribePestPackage({ packageKey: selectedPackage.key });
      if (!res.charged) {
        const ok = await presentStripeSheet(res.clientSecret);
        if (!ok) return;
      }
      Alert.alert('Subscribed!', `Your ${selectedPackage.label} plan is active at ${fmtUSD(res.monthlyPrice)}/month.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitPackage = () => {
    if (!selectedPackage || !packageQuote) return;
    Alert.alert(
      'Confirm Subscription',
      `You'll be billed ${fmtUSD(packageQuote.monthlyPrice)}/month starting today, using the card already on file.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: doSubscribe },
      ],
    );
  };

  const submitAddOns = async () => {
    if (selectedAddOnKeys.length === 0) return;
    setSubmitting(true);
    try {
      for (const key of selectedAddOnKeys) {
        const sel = selectedAddOns[key];
        const needsQty = MANUAL_QTY_SERVICES.has(key) || HOME_SQFT_KEYS.has(key) || ACREAGE_KEYS.has(key);
        await marketplaceApi.bookPestService({
          serviceKey: key,
          qty: needsQty ? Number(sel.qty) : undefined,
          frequency: sel.frequency,
          preferredDate: preferredDate.toISOString(),
        });
      }
      Alert.alert('Services Requested!', 'We are finding available vendors. You will be notified as they accept.', [{ text: 'OK', onPress: () => router.back() }]);
      setSelectedAddOns({});
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !config) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Pest Control</Text>
        <Text style={styles.subtitle}>Subscribe to a monthly protection plan, or add specific services whenever you need them.</Text>

        <Text style={styles.sectionLabel}>Property Details</Text>
        {editingProfile ? (
          <>
            <Text style={styles.helperText}>Entered once and reused for every Pest Control price — no need to enter it again.</Text>
            {PROFILE_FIELDS.map((f) => (
              <View key={f.key} style={styles.profileFieldRow}>
                <Text style={styles.profileFieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.profileFieldInput}
                  keyboardType="numeric"
                  placeholder={f.unit}
                  placeholderTextColor={colors.steel}
                  value={profileDraft[f.key] ?? ''}
                  onChangeText={(v) => setProfileDraft((p) => ({ ...p, [f.key]: v.replace(/[^0-9.]/g, '') }))}
                />
              </View>
            ))}
            <TouchableOpacity style={[styles.submitBtn, savingProfile && styles.submitBtnDisabled]} onPress={saveProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Save Property Details</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.profileSummary} onPress={openProfileEditor}>
            <Ionicons name="home-outline" size={18} color={colors.lanternDeep} />
            <Text style={styles.profileSummaryText}>Property details saved</Text>
            <Text style={styles.profileEditLink}>Edit</Text>
          </TouchableOpacity>
        )}

        {!editingProfile && (
          <>
            <View style={styles.choiceRow}>
              <TouchableOpacity style={[styles.choiceBtn, mode === 'package' && styles.choiceBtnActive]} onPress={() => setMode('package')}>
                <Text style={[styles.choiceBtnText, mode === 'package' && styles.choiceBtnTextActive]}>Subscribe to a Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choiceBtn, mode === 'service' && styles.choiceBtnActive]} onPress={() => setMode('service')}>
                <Text style={[styles.choiceBtnText, mode === 'service' && styles.choiceBtnTextActive]}>Add-on Services</Text>
              </TouchableOpacity>
            </View>

            {mode === 'package' ? (
              <>
                <Text style={styles.sectionLabel}>Choose a Plan</Text>
                <Text style={styles.helperText}>Tap a plan to select it; tap again to deselect.</Text>
                {config.packages.map((p) => {
                  const selected = p.key === packageKey;
                  return (
                    <TouchableOpacity key={p.key} style={[styles.packageCard, selected && styles.packageCardActive]} onPress={() => togglePackage(p.key)}>
                      <View style={styles.packageCardHeader}>
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                        <Text style={styles.packageLabel}>{p.label}</Text>
                        <Ionicons name={selected ? 'chevron-up' : 'chevron-down'} size={16} color={colors.steel} />
                      </View>
                      {selected && <Text style={styles.packageDescription}>{p.description}</Text>}
                    </TouchableOpacity>
                  );
                })}

                <View style={styles.priceCard}>
                  {packageQuoting ? (
                    <ActivityIndicator color={colors.lanternDeep} />
                  ) : packageQuote ? (
                    <>
                      <Text style={styles.priceLabel}>Billed monthly</Text>
                      <Text style={styles.priceAmount}>{fmtUSD(packageQuote.monthlyPrice)}<Text style={styles.pricePer}>/mo</Text></Text>
                      <Text style={styles.priceSub}>Computed from your property details</Text>
                    </>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || packageQuoting || !packageQuote) && styles.submitBtnDisabled]}
                  onPress={submitPackage}
                  disabled={submitting || packageQuoting || !packageQuote}
                >
                  {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Subscribe</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Add-on Services</Text>
                {!!selectedPackage && (
                  <Text style={styles.helperText}>Services already included in {selectedPackage.label} are hidden below.</Text>
                )}
                {visibleServices.map((s) => {
                  const sel = selectedAddOns[s.key];
                  const selected = !!sel;
                  const quote = addOnQuotes[s.key];
                  const quotingRow = addOnQuoting[s.key];
                  const needsQty = MANUAL_QTY_SERVICES.has(s.key) || HOME_SQFT_KEYS.has(s.key) || ACREAGE_KEYS.has(s.key);
                  return (
                    <View key={s.key} style={styles.addOnCard}>
                      <TouchableOpacity style={styles.addOnHeader} onPress={() => toggleAddOn(s)}>
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.serviceLabel}>{s.label}</Text>
                          <Text style={styles.serviceMeta}>{s.pricingUnit} · {s.recommendedFrequency}</Text>
                        </View>
                        {quote && <Text style={styles.addOnPrice}>{quote.comped ? 'FREE' : fmtUSD(quote.price)}</Text>}
                      </TouchableOpacity>

                      {selected && (
                        <View style={styles.addOnDetails}>
                          {needsQty && (
                            <View style={styles.qtyRow}>
                              <Text style={styles.qtyLabel}>Quantity ({s.pricingUnit})</Text>
                              <TextInput
                                style={styles.profileFieldInput}
                                keyboardType="numeric"
                                value={sel.qty}
                                onChangeText={(v) => updateAddOnQty(s.key, v)}
                              />
                            </View>
                          )}

                          {s.frequencyDiscounts?.length > 0 && (
                            <View style={styles.freqRow}>
                              {s.frequencyDiscounts.map((f: any) => (
                                <TouchableOpacity
                                  key={f.frequency}
                                  style={[styles.freqChip, sel.frequency === f.frequency && styles.freqChipActive]}
                                  onPress={() => updateAddOnFrequency(s.key, f.frequency)}
                                >
                                  <Text style={[styles.freqChipText, sel.frequency === f.frequency && styles.freqChipTextActive]}>{f.label} (-{f.ratePercent}%)</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}

                          {quote?.comped && (
                            <View style={styles.infoNotice}>
                              <Ionicons name="ribbon-outline" size={16} color={colors.lanternDeep} />
                              <Text style={styles.infoNoticeText}>Included free with your current plan.</Text>
                            </View>
                          )}

                          {quotingRow && <ActivityIndicator color={colors.lanternDeep} style={{ marginTop: 8 }} />}
                        </View>
                      )}
                    </View>
                  );
                })}

                {selectedAddOnKeys.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Preferred Date</Text>
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
                      <Text style={styles.dateBtnText}>{preferredDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                      <Ionicons name="calendar-outline" size={18} color={colors.lanternDeep} />
                    </TouchableOpacity>
                    {showDate && (
                      <RNDateTimePicker value={preferredDate} mode="date" minimumDate={new Date()} onChange={(_, d) => { setShowDate(Platform.OS === 'ios'); if (d) setPreferredDate(d); }} />
                    )}

                    <View style={styles.priceCard}>
                      {anyAddOnQuoting ? (
                        <ActivityIndicator color={colors.lanternDeep} />
                      ) : (
                        <>
                          <Text style={styles.priceLabel}>Total</Text>
                          <Text style={styles.priceAmount}>{fmtUSD(addOnTotal)}</Text>
                        </>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.submitBtn, (submitting || anyAddOnQuoting) && styles.submitBtnDisabled]}
                      onPress={submitAddOns}
                      disabled={submitting || anyAddOnQuoting}
                    >
                      {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Request Selected Services</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function fmtUSD(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.steel, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 20, marginBottom: 10 },
  helperText: { fontSize: 12, color: colors.steel, marginBottom: 10, marginTop: -4 },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choiceBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center' },
  choiceBtnActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: colors.steel, textAlign: 'center' },
  choiceBtnTextActive: { color: colors.lanternDeep },
  profileFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  profileFieldLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  profileFieldInput: { width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, textAlign: 'right', color: colors.ink },
  profileSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14 },
  profileSummaryText: { fontSize: 14, color: colors.ink, flex: 1 },
  profileEditLink: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  packageCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  packageCardActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  packageCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  packageLabel: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  packageDescription: { fontSize: 12, color: colors.steel, lineHeight: 18, marginLeft: 26 },
  addOnCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  addOnHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addOnPrice: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  addOnDetails: { marginTop: 10, marginLeft: 28 },
  serviceLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  serviceMeta: { fontSize: 11, color: colors.steel, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  qtyLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  freqChipActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  freqChipText: { fontSize: 11, color: colors.steel, fontWeight: '600' },
  freqChipTextActive: { color: colors.lanternDeep },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.mist, borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  infoNoticeText: { fontSize: 12, color: colors.lanternDeep, lineHeight: 18, flex: 1 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: colors.lanternDeep, fontWeight: '500' },
  priceCard: { backgroundColor: colors.ink, borderRadius: 14, padding: 18, marginTop: 24, alignItems: 'center', minHeight: 80, justifyContent: 'center' },
  priceLabel: { fontSize: 12, color: colors.mistDim, marginBottom: 2 },
  priceAmount: { fontSize: 26, fontWeight: '800', color: colors.mist },
  pricePer: { fontSize: 14, fontWeight: '500' },
  priceSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: colors.steel },
  submitBtnText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel, fontSize: 14 },
});
