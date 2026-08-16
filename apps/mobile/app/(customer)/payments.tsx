import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { paymentsApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Due',       color: '#b45309', bg: '#fffbeb' },
  PAID:      { label: 'Paid',      color: '#059669', bg: '#dcfce7' },
  CANCELLED: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
  REFUNDED:  { label: 'Refunded',  color: '#7c3aed', bg: '#f5f3ff' },
};

const fmt = fmtUSD;

export default function PaymentsScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [pending, setPending] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [methods, setMethods] = useState<{ id: string; brand: string; last4: string; isDefault: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [methodBusyId, setMethodBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, h, m] = await Promise.all([
        paymentsApi.getPending().catch(() => []),
        paymentsApi.getHistory().catch(() => []),
        paymentsApi.listMethods().catch(() => []),
      ]);
      setPending(p || []);
      setHistory((h || []).filter((x: any) => x.status !== 'PENDING'));
      setMethods(m || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const addCard = async () => {
    setAddingCard(true);
    try {
      const { setupIntentClientSecret, ephemeralKeySecret, customerId } = await paymentsApi.createSetupIntent();
      const { error: initErr } = await initPaymentSheet({
        setupIntentClientSecret,
        customerId,
        customerEphemeralKeySecret: ephemeralKeySecret,
        merchantDisplayName: 'Attenteve',
      });
      if (initErr) { Alert.alert('Error', initErr.message); return; }
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') Alert.alert('Error', presentErr.message);
        return;
      }
      await load();
      Alert.alert('Card Added', 'Your new card has been saved.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add card.');
    } finally {
      setAddingCard(false);
    }
  };

  const setDefaultMethod = async (id: string) => {
    setMethodBusyId(id);
    try {
      await paymentsApi.setDefaultMethod(id);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set default card.');
    } finally {
      setMethodBusyId(null);
    }
  };

  // A verified card must always be on file (an ongoing/outstanding service
  // may still need to be paid through the platform even after a customer
  // cancels their subscription) — so there's no bare "delete", only
  // "Replace": collect a new card first via the same PaymentSheet flow
  // addCard uses, and only detach the old one once that succeeds. If the
  // sheet is cancelled or fails, nothing is removed. The backend also
  // enforces this as a hard invariant (PaymentsService.removePaymentMethod),
  // so this is about the flow being sensible, not the only thing stopping
  // a customer from ending up with zero cards.
  const replaceCard = (oldId: string) => {
    Alert.alert(
      'Replace Card',
      "You'll be asked to enter a new card, then this one will be removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setMethodBusyId(oldId);
            try {
              const { setupIntentClientSecret, ephemeralKeySecret, customerId } = await paymentsApi.createSetupIntent();
              const { error: initErr } = await initPaymentSheet({
                setupIntentClientSecret,
                customerId,
                customerEphemeralKeySecret: ephemeralKeySecret,
                merchantDisplayName: 'Attenteve',
              });
              if (initErr) { Alert.alert('Error', initErr.message); return; }
              const { error: presentErr } = await presentPaymentSheet();
              if (presentErr) {
                if (presentErr.code !== 'Canceled') Alert.alert('Error', presentErr.message);
                return;
              }
              await paymentsApi.removeMethod(oldId);
              await load();
              Alert.alert('Card Replaced', 'Your new card has been saved and the old one removed.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not replace card.');
            } finally {
              setMethodBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handlePay = async (payment: any) => {
    Alert.alert(
      'Confirm Payment',
      `Pay ${fmt(payment.amount)} for "${payment.description || payment.serviceType || 'Service'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPaying(payment.id);
            try {
              // Ask the backend first — it decides whether a payment sheet
              // is even needed (a stale/legacy client secret can point at a
              // PaymentIntent already past requires_payment_method, which
              // Stripe's sheet refuses to open at all).
              let res: any = await paymentsApi.authorize(payment.id);
              if (res.status === 'NEEDS_CLIENT_ACTION') {
                const { error: initErr } = await initPaymentSheet({
                  paymentIntentClientSecret: res.clientSecret,
                  merchantDisplayName: 'Attenteve',
                });
                if (initErr) { Alert.alert('Error', initErr.message); return; }
                const { error: presentErr } = await presentPaymentSheet();
                if (presentErr) {
                  if (presentErr.code !== 'Canceled') Alert.alert('Payment Failed', presentErr.message);
                  return;
                }
                res = await paymentsApi.authorize(payment.id);
              }
              Alert.alert('Payment Successful', 'Thank you! Your payment has been processed.');
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Payment could not be processed.');
            } finally {
              setPaying(null);
            }
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Saved payment methods */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        {methods.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No saved cards yet</Text>
          </View>
        ) : (
          methods.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Ionicons name="card-outline" size={22} color={colors.lanternDeep} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDesc}>
                      {m.brand.charAt(0).toUpperCase() + m.brand.slice(1)} •••• {m.last4}
                    </Text>
                    {m.isDefault && <Text style={styles.cardSub}>Default</Text>}
                  </View>
                </View>
                {methodBusyId === m.id ? (
                  <ActivityIndicator size="small" color={colors.lanternDeep} />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!m.isDefault && (
                      <TouchableOpacity onPress={() => setDefaultMethod(m.id)} style={styles.methodActionBtn}>
                        <Text style={styles.methodActionText}>Set Default</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => replaceCard(m.id)} style={styles.methodActionBtn}>
                      <Text style={styles.methodActionText}>Replace</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
        <TouchableOpacity style={styles.addCardBtn} onPress={addCard} disabled={addingCard}>
          {addingCard ? (
            <ActivityIndicator size="small" color={colors.lanternDeep} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={18} color={colors.lanternDeep} />
              <Text style={styles.addCardBtnText}>Add Card</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Pending payments — getPending() now also returns recently-charged
          payments still inside their dispute window (see
          PaymentsService.getPendingPayments), so this branches on status
          instead of treating every entry as needing a Pay button. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payments Due</Text>
        {pending.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={36} color="#059669" />
            <Text style={styles.emptyText}>No payments due</Text>
          </View>
        ) : (
          pending.map((p) => {
            const isCharged = p.status === 'SUCCEEDED';
            return (
              <View key={p.id} style={[styles.card, !isCharged && styles.cardPending]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDesc}>
                      {isCharged ? `Service completed — ${fmt(p.amount)} charged` : (p.description || p.serviceType || 'Service')}
                    </Text>
                    {isCharged && <Text style={styles.cardSub}>{p.description || p.serviceType || 'Service'}</Text>}
                    {p.vendorName && <Text style={styles.cardSub}>Vendor: {p.vendorName}</Text>}
                    {p.serviceDate && (
                      <Text style={styles.cardSub}>
                        Service date: {new Date(p.serviceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  {!isCharged && <Text style={styles.amountDue}>{fmt(p.amount)}</Text>}
                </View>
                {isCharged ? (
                  <TouchableOpacity
                    onPress={() => router.push(
                      `/(customer)/dispute?serviceRequestId=${p.serviceRequestId}&vendorId=${p.vendorId}&stripePaymentIntentId=${p.stripePaymentIntentId}&amount=${p.amount}`
                    )}
                  >
                    <Text style={styles.reportIssueLink}>Report an issue</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.payBtn, paying === p.id && styles.payBtnLoading]}
                    onPress={() => handlePay(p)}
                    disabled={paying === p.id}
                  >
                    {paying === p.id ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : (
                      <>
                        <Ionicons name="card" size={16} color={colors.ink} />
                        <Text style={styles.payBtnText}>Pay {fmt(p.amount)}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Payment history */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No payment history yet</Text>
          </View>
        ) : (
          history.map((p) => {
            const s = STATUS_STYLE[p.status] ?? STATUS_STYLE.PAID;
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDesc}>{p.description || p.serviceType || 'Service'}</Text>
                    {p.vendorName && <Text style={styles.cardSub}>Vendor: {p.vendorName}</Text>}
                    <Text style={styles.cardDate}>
                      {new Date(p.paidAt || p.updatedAt || p.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.amount}>{fmt(p.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  section: { padding: 16, paddingBottom: 0 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardPending: { borderLeftWidth: 3, borderLeftColor: '#b45309' },
  cardTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cardDesc: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  cardSub: { fontSize: 12, color: colors.steel, marginTop: 1 },
  cardDate: { fontSize: 12, color: colors.steel, marginTop: 4 },
  amountDue: { fontSize: 20, fontWeight: '800', color: '#b45309' },
  amount: { fontSize: 18, fontWeight: '700', color: colors.ink },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.lantern, borderRadius: 10, padding: 13 },
  payBtnLoading: { opacity: 0.7 },
  payBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  reportIssueLink: { color: colors.steel, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline', padding: 4, alignSelf: 'flex-start' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', gap: 8, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.steel },
  methodActionBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  methodActionText: { fontSize: 12, fontWeight: '700', color: colors.lanternDeep },
  addCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.lanternDeep, borderStyle: 'dashed', padding: 14,
  },
  addCardBtnText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 14 },
});
