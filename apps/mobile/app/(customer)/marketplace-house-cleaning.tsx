import { useEffect, useMemo, useRef, useState } from 'react';
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

const CLEANING_TYPE_LABELS: Record<string, string> = { STANDARD: 'Standard', DEEP: 'Deep', MOVE_OUT: 'Move-Out' };
const FREQUENCY_LABELS: Record<string, string> = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', BIWEEKLY: 'Bi-weekly', WEEKLY: 'Weekly' };

export default function MarketplaceHouseCleaningScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [config, setConfig] = useState<{ plans: any[]; roomUnits: any[]; conditions: any[]; addOns: any[]; frequencyDiscounts: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [cleaningType, setCleaningType] = useState('STANDARD');
  const [visitFrequency, setVisitFrequency] = useState('MONTHLY');
  const [houseConfig, setHouseConfig] = useState<Record<string, number>>({});
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set(['well_maintained']));
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, number>>({});
  const [preferredDate, setPreferredDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; });
  const [showDate, setShowDate] = useState(false);

  const [quote, setQuote] = useState<{ perVisitCost: number; monthlyPrice: number | null; quoteRequired: boolean } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    Promise.all([marketplaceApi.getConfig(), marketplaceApi.getHouseCleaningPropertyProfile()]).then(([c, savedProfile]) => {
      setConfig(c);
      // Pre-fill from the customer's last-used room configuration (saved
      // automatically after their previous subscribe/booking) if one
      // exists, so they never re-enter this from scratch; otherwise fall
      // back to the same defaults as before.
      const saved = savedProfile?.roomConfig;
      const initial: Record<string, number> = {};
      const defaultToOne = new Set(['bedroom', 'kitchen', 'bathroom_full', 'dining_room', 'additional_living_room']);
      for (const r of c.roomUnits) initial[r.key] = saved?.[r.key] ?? (defaultToOne.has(r.key) ? 1 : 0);
      setHouseConfig(initial);
    }).catch(() => Alert.alert('Error', 'Could not load House Cleaning options.')).finally(() => setLoading(false));
  }, []);

  const plan = useMemo(() => config?.plans.find((p) => p.cleaningType === cleaningType && p.isActive), [config, cleaningType]);
  const allowedFrequencies: string[] = plan?.allowedFrequencies ?? [];

  useEffect(() => {
    if (cleaningType === 'MOVE_OUT') setVisitFrequency('ONE_TIME');
    else if (!allowedFrequencies.includes(visitFrequency)) setVisitFrequency(plan?.defaultFrequency ?? 'MONTHLY');
  }, [cleaningType, plan]);

  const addOnsPayload = useMemo(
    () => Object.entries(selectedAddOns).filter(([, qty]) => qty > 0).map(([key, qty]) => ({ key, qty })),
    [selectedAddOns],
  );

  // Debounced live quote — refetches whenever any input changes.
  useEffect(() => {
    if (!config || loading) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => {
      setQuoting(true);
      marketplaceApi.quote({
        cleaningType, visitFrequency, houseConfig,
        conditions: [...selectedConditions], addOns: addOnsPayload,
      }).then(setQuote).catch(() => setQuote(null)).finally(() => setQuoting(false));
    }, 400);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [config, loading, cleaningType, visitFrequency, houseConfig, selectedConditions, addOnsPayload]);

  const adjustRoom = (key: string, delta: number) => {
    setHouseConfig((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
  };

  const toggleCondition = (key: string, isBaseTier: boolean) => {
    setSelectedConditions((prev) => {
      const next = new Set(prev);
      if (isBaseTier) {
        // Base tier is single-select — clear every other base-tier key first.
        for (const c of config?.conditions ?? []) if (c.isBaseTier) next.delete(c.key);
        next.add(key);
      } else {
        next.has(key) ? next.delete(key) : next.add(key);
      }
      return next;
    });
  };

  const toggleAddOn = (key: string) => {
    setSelectedAddOns((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = 1;
      return next;
    });
  };

  const hoardingSelected = config?.conditions.some((c) => c.forcesQuote && selectedConditions.has(c.key));

  const presentStripeSheet = async (clientSecret: string | null): Promise<boolean> => {
    if (!clientSecret) return true;
    const { error: initError } = await initPaymentSheet({ paymentIntentClientSecret: clientSecret, merchantDisplayName: 'Attenteve', allowsDelayedPaymentMethods: false });
    if (initError) { Alert.alert('Payment Setup Failed', initError.message); return false; }
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) { if (presentError.code !== 'Canceled') Alert.alert('Payment Failed', presentError.message); return false; }
    return true;
  };

  const doSubscribe = async () => {
    setSubmitting(true);
    try {
      const payload = {
        cleaningType, visitFrequency, houseConfig, conditions: [...selectedConditions], addOns: addOnsPayload,
        preferredVisitDate: preferredDate.toISOString(),
      };
      const res = await marketplaceApi.subscribe(payload);
      if (!res.charged) {
        // Rare fallback — the saved card needs additional authentication.
        const ok = await presentStripeSheet(res.clientSecret);
        if (!ok) return;
      }
      Alert.alert('Subscribed!', `Your House Cleaning membership is active at ${fmtUSD(res.monthlyPrice)}/month. Your first visit is scheduled for ${preferredDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (hoardingSelected) {
      Alert.alert('Quote Required', 'This home\'s condition requires a manual quote — please contact support to proceed.');
      return;
    }
    if (!quote || quote.quoteRequired) return;

    if (visitFrequency === 'ONE_TIME') {
      setSubmitting(true);
      try {
        const payload = { cleaningType, visitFrequency, houseConfig, conditions: [...selectedConditions], addOns: addOnsPayload };
        await marketplaceApi.bookOneTime({ ...payload, preferredDate: preferredDate.toISOString() });
        Alert.alert('Cleaning Requested!', 'We are finding an available cleaner. You will be notified once one accepts.', [{ text: 'OK', onPress: () => router.back() }]);
      } catch (e: any) {
        Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const visitDateLabel = preferredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    Alert.alert(
      'Confirm Subscription',
      `You'll be billed ${fmtUSD(quote.monthlyPrice ?? 0)}/month starting today, using the card already on file. Your first visit is scheduled for ${visitDateLabel}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: doSubscribe },
      ],
    );
  };

  if (loading || !config) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>House Cleaning</Text>
        <Text style={styles.subtitle}>Configure your home and we'll price it instantly.</Text>

        <Text style={styles.sectionLabel}>Plan</Text>
        <View style={styles.choiceRow}>
          {config.plans.filter((p) => p.isActive).map((p) => (
            <TouchableOpacity key={p.cleaningType} style={[styles.choiceBtn, cleaningType === p.cleaningType && styles.choiceBtnActive]} onPress={() => setCleaningType(p.cleaningType)}>
              <Text style={[styles.choiceBtnText, cleaningType === p.cleaningType && styles.choiceBtnTextActive]}>{CLEANING_TYPE_LABELS[p.cleaningType] ?? p.cleaningType}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your Home</Text>
        {config.roomUnits.map((r) => (
          <View key={r.key} style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>{r.label}</Text>
            <View style={styles.qtyStepper}>
              <TouchableOpacity onPress={() => adjustRoom(r.key, -1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="remove-circle-outline" size={26} color={colors.lanternDeep} />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{houseConfig[r.key] ?? 0}</Text>
              <TouchableOpacity onPress={() => adjustRoom(r.key, 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="add-circle-outline" size={26} color={colors.lanternDeep} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {cleaningType !== 'MOVE_OUT' && (
          <>
            <Text style={styles.sectionLabel}>Frequency</Text>
            <View style={styles.choiceRow}>
              {allowedFrequencies.map((f) => (
                <TouchableOpacity key={f} style={[styles.choiceBtn, visitFrequency === f && styles.choiceBtnActive]} onPress={() => setVisitFrequency(f)}>
                  <Text style={[styles.choiceBtnText, visitFrequency === f && styles.choiceBtnTextActive]}>{FREQUENCY_LABELS[f] ?? f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>{visitFrequency === 'ONE_TIME' ? 'Preferred Date' : 'Preferred First Visit'}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{preferredDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
          <Ionicons name="calendar-outline" size={18} color={colors.lanternDeep} />
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker value={preferredDate} mode="date" minimumDate={new Date()} onChange={(_, d) => { setShowDate(Platform.OS === 'ios'); if (d) setPreferredDate(d); }} />
        )}

        <Text style={styles.sectionLabel}>Home Condition</Text>
        <Text style={styles.helperText}>Select the option that best describes your home, plus anything else that applies.</Text>
        <View style={styles.baseTierRow}>
          {config.conditions.filter((c) => c.isBaseTier).map((c) => {
            const checked = selectedConditions.has(c.key);
            return (
              <TouchableOpacity key={c.key} style={[styles.baseTierChip, checked && styles.conditionChipActive]} onPress={() => toggleCondition(c.key, true)}>
                <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={16} color={checked ? colors.lanternDeep : colors.steel} />
                <Text style={[styles.conditionChipText, checked && styles.conditionChipTextActive]} numberOfLines={2}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.conditionGrid}>
          {config.conditions.filter((c) => !c.isBaseTier).map((c) => {
            const checked = selectedConditions.has(c.key);
            return (
              <TouchableOpacity key={c.key} style={[styles.conditionChip, checked && styles.conditionChipActive]} onPress={() => toggleCondition(c.key, false)}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={16} color={checked ? colors.lanternDeep : colors.steel} />
                <Text style={[styles.conditionChipText, checked && styles.conditionChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {hoardingSelected && (
          <View style={styles.quoteNotice}>
            <Ionicons name="information-circle-outline" size={16} color="#92400e" />
            <Text style={styles.quoteNoticeText}>This condition requires a manual quote — pricing below won't apply. Contact support to proceed.</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Add-Ons</Text>
        {config.addOns.map((a) => {
          const qty = selectedAddOns[a.key] ?? 0;
          return (
            <View key={a.key} style={styles.addOnRow}>
              <TouchableOpacity style={styles.addOnToggle} onPress={() => toggleAddOn(a.key)}>
                <Ionicons name={qty > 0 ? 'checkbox' : 'square-outline'} size={18} color={qty > 0 ? colors.lanternDeep : colors.steel} />
                <Text style={styles.addOnLabel}>{a.label}{a.perUnit ? ` (per ${a.unitLabel})` : ''}</Text>
              </TouchableOpacity>
              {qty > 0 && a.perUnit ? (
                <View style={styles.qtyStepper}>
                  <TouchableOpacity onPress={() => setSelectedAddOns((p) => ({ ...p, [a.key]: Math.max(1, qty - 1) }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="remove-circle-outline" size={22} color={colors.lanternDeep} />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <TouchableOpacity onPress={() => setSelectedAddOns((p) => ({ ...p, [a.key]: qty + 1 }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="add-circle-outline" size={22} color={colors.lanternDeep} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.addOnPrice}>${Number(a.customerPrice)}</Text>
              )}
            </View>
          );
        })}

        <View style={styles.priceCard}>
          {quoting ? (
            <ActivityIndicator color={colors.lanternDeep} />
          ) : quote?.quoteRequired || hoardingSelected ? (
            <Text style={styles.priceQuoteText}>Quote required for this configuration</Text>
          ) : quote ? (
            visitFrequency === 'ONE_TIME' ? (
              <>
                <Text style={styles.priceLabel}>Total</Text>
                <Text style={styles.priceAmount}>{fmtUSD(quote.perVisitCost)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.priceLabel}>Billed monthly</Text>
                <Text style={styles.priceAmount}>{fmtUSD(quote.monthlyPrice ?? 0)}<Text style={styles.pricePer}>/mo</Text></Text>
                <Text style={styles.priceSub}>~{fmtUSD(quote.perVisitCost)} per visit, {FREQUENCY_LABELS[visitFrequency]?.toLowerCase()}</Text>
              </>
            )
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || quoting || !quote || quote.quoteRequired || hoardingSelected) && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={submitting || quoting || !quote || quote.quoteRequired || !!hoardingSelected}
        >
          {submitting ? <ActivityIndicator color={colors.ink} /> : (
            <Text style={styles.submitBtnText}>{visitFrequency === 'ONE_TIME' ? 'Request Cleaning' : 'Subscribe'}</Text>
          )}
        </TouchableOpacity>

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
  choiceBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  choiceBtnActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: colors.steel },
  choiceBtnTextActive: { color: colors.lanternDeep },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  qtyLabel: { fontSize: 14, color: colors.ink, flex: 1 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyValue: { fontSize: 15, fontWeight: '700', color: colors.ink, minWidth: 20, textAlign: 'center' },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: colors.lanternDeep, fontWeight: '500' },
  baseTierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  baseTierChip: { flex: 1, minWidth: '30%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conditionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  conditionChipActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  conditionChipText: { fontSize: 12, color: colors.steel },
  conditionChipTextActive: { color: colors.lanternDeep, fontWeight: '600' },
  quoteNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#fde68a' },
  quoteNoticeText: { fontSize: 12, color: '#92400e', lineHeight: 18, flex: 1 },
  addOnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  addOnToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  addOnLabel: { fontSize: 14, color: colors.ink },
  addOnPrice: { fontSize: 13, fontWeight: '600', color: colors.steel },
  priceCard: { backgroundColor: colors.ink, borderRadius: 14, padding: 18, marginTop: 24, alignItems: 'center' },
  priceLabel: { fontSize: 12, color: colors.mistDim, marginBottom: 2 },
  priceAmount: { fontSize: 26, fontWeight: '800', color: colors.mist },
  pricePer: { fontSize: 14, fontWeight: '500' },
  priceSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  priceQuoteText: { fontSize: 14, fontWeight: '600', color: colors.mist },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: colors.steel },
  submitBtnText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel, fontSize: 14 },
});
