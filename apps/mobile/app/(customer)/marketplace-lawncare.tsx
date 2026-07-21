import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { marketplaceApi } from '../../src/services/api';
import { colors } from '../../src/theme';

type Mode = 'package' | 'service';

export default function MarketplaceLawncareScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [config, setConfig] = useState<{ services: any[]; packages: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<Mode>('package');
  const [packageKey, setPackageKey] = useState<string | null>(null);
  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [preferredDate, setPreferredDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; });
  const [showDate, setShowDate] = useState(false);

  const [quote, setQuote] = useState<{ type: 'package'; monthlyPrice: number } | { type: 'service'; price: number; discountRate: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    marketplaceApi.getLawncareConfig().then((c) => {
      setConfig(c);
      if (c.packages.length > 0) setPackageKey(c.packages[0].key);
    }).catch(() => Alert.alert('Error', 'Could not load Lawncare options.')).finally(() => setLoading(false));
  }, []);

  const selectedPackage = config?.packages.find((p) => p.key === packageKey) ?? null;
  const selectedService = config?.services.find((s) => s.key === serviceKey) ?? null;

  // Package price is already known client-side — no live quote call needed.
  useEffect(() => {
    if (mode === 'package' && selectedPackage) {
      setQuote({ type: 'package', monthlyPrice: Number(selectedPackage.monthlyPrice) });
    }
  }, [mode, selectedPackage]);

  // Service mode: debounced live quote, since price depends on the entered qty.
  useEffect(() => {
    if (mode !== 'service' || !selectedService) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuoting(true);
    quoteTimer.current = setTimeout(() => {
      marketplaceApi.quoteLawncare({ mode: 'service', serviceKey: selectedService.key, qty })
        .then(setQuote).catch(() => setQuote(null)).finally(() => setQuoting(false));
    }, 400);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [mode, selectedService, qty]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setQuote(null);
  };

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
      const res = await marketplaceApi.subscribeLawncarePackage({ packageKey: selectedPackage.key });
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
    if (!selectedPackage || !quote || quote.type !== 'package') return;
    Alert.alert(
      'Confirm Subscription',
      `You'll be billed ${fmtUSD(quote.monthlyPrice)}/month starting today, using the card already on file.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: doSubscribe },
      ],
    );
  };

  const submitService = async () => {
    if (!selectedService || !quote || quote.type !== 'service') return;
    setSubmitting(true);
    try {
      await marketplaceApi.bookLawncareService({ serviceKey: selectedService.key, qty, preferredDate: preferredDate.toISOString() });
      Alert.alert('Service Requested!', 'We are finding an available vendor. You will be notified once one accepts.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !config) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Lawncare</Text>
        <Text style={styles.subtitle}>Subscribe to a monthly plan, or request a specific service whenever you need it.</Text>

        <View style={styles.choiceRow}>
          <TouchableOpacity style={[styles.choiceBtn, mode === 'package' && styles.choiceBtnActive]} onPress={() => switchMode('package')}>
            <Text style={[styles.choiceBtnText, mode === 'package' && styles.choiceBtnTextActive]}>Subscribe to a Package</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choiceBtn, mode === 'service' && styles.choiceBtnActive]} onPress={() => switchMode('service')}>
            <Text style={[styles.choiceBtnText, mode === 'service' && styles.choiceBtnTextActive]}>Request a Service</Text>
          </TouchableOpacity>
        </View>

        {mode === 'package' ? (
          <>
            <Text style={styles.sectionLabel}>Choose a Plan</Text>
            {config.packages.map((p) => {
              const selected = p.key === packageKey;
              return (
                <TouchableOpacity key={p.key} style={[styles.packageCard, selected && styles.packageCardActive]} onPress={() => setPackageKey(p.key)}>
                  <View style={styles.packageCardHeader}>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                    <Text style={styles.packageLabel}>{p.label}</Text>
                    <Text style={styles.packagePrice}>{p.isStartingAt ? 'From ' : ''}{fmtUSD(Number(p.monthlyPrice))}/mo</Text>
                  </View>
                  <Text style={styles.packageDescription}>{p.description}</Text>
                </TouchableOpacity>
              );
            })}

            <View style={styles.priceCard}>
              {quote?.type === 'package' ? (
                <>
                  <Text style={styles.priceLabel}>Billed monthly</Text>
                  <Text style={styles.priceAmount}>{fmtUSD(quote.monthlyPrice)}<Text style={styles.pricePer}>/mo</Text></Text>
                </>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || !selectedPackage) && styles.submitBtnDisabled]}
              onPress={submitPackage}
              disabled={submitting || !selectedPackage}
            >
              {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Subscribe</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Choose a Service</Text>
            {config.services.map((s) => {
              const selected = s.key === serviceKey;
              return (
                <TouchableOpacity key={s.key} style={[styles.serviceRow, selected && styles.serviceRowActive]} onPress={() => { setServiceKey(s.key); setQty(1); }}>
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceLabel}>{s.label}</Text>
                    <Text style={styles.serviceMeta}>{s.pricingUnit} · {s.recommendedFrequency}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {selectedService && (
              <>
                <Text style={styles.sectionLabel}>{selectedService.pricingUnit}</Text>
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Quantity</Text>
                  <View style={styles.qtyStepper}>
                    <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="remove-circle-outline" size={26} color={colors.lanternDeep} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{qty}</Text>
                    <TouchableOpacity onPress={() => setQty((q) => q + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="add-circle-outline" size={26} color={colors.lanternDeep} />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!selectedService.volumeDiscountText && (
                  <View style={styles.infoNotice}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.lanternDeep} />
                    <Text style={styles.infoNoticeText}>Volume discount: {selectedService.volumeDiscountText}</Text>
                  </View>
                )}

                <Text style={styles.sectionLabel}>Preferred Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
                  <Text style={styles.dateBtnText}>{preferredDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.lanternDeep} />
                </TouchableOpacity>
                {showDate && (
                  <RNDateTimePicker value={preferredDate} mode="date" minimumDate={new Date()} onChange={(_, d) => { setShowDate(Platform.OS === 'ios'); if (d) setPreferredDate(d); }} />
                )}

                <View style={styles.priceCard}>
                  {quoting ? (
                    <ActivityIndicator color={colors.lanternDeep} />
                  ) : quote?.type === 'service' ? (
                    <>
                      <Text style={styles.priceLabel}>Total</Text>
                      <Text style={styles.priceAmount}>{fmtUSD(quote.price)}</Text>
                      {quote.discountRate > 0 && <Text style={styles.priceSub}>Includes a {quote.discountRate}% volume discount</Text>}
                    </>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || quoting || !quote) && styles.submitBtnDisabled]}
                  onPress={submitService}
                  disabled={submitting || quoting || !quote}
                >
                  {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Request Service</Text>}
                </TouchableOpacity>
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
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choiceBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center' },
  choiceBtnActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: colors.steel, textAlign: 'center' },
  choiceBtnTextActive: { color: colors.lanternDeep },
  packageCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  packageCardActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  packageCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  packageLabel: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  packagePrice: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep },
  packageDescription: { fontSize: 12, color: colors.steel, lineHeight: 18, marginLeft: 26 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  serviceRowActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  serviceLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  serviceMeta: { fontSize: 11, color: colors.steel, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  qtyLabel: { fontSize: 14, color: colors.ink, flex: 1 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyValue: { fontSize: 15, fontWeight: '700', color: colors.ink, minWidth: 20, textAlign: 'center' },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.mist, borderRadius: 10, padding: 12, marginTop: 4, borderWidth: 1, borderColor: colors.border },
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
