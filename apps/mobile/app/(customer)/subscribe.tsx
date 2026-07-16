import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { subscriptionsApi, TERMS_URL } from '../../src/services/api';
import { colors } from '../../src/theme';
import CancellationFeedbackModal from '../../src/components/CancellationFeedbackModal';

export default function SubscribeScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showCancelFeedback, setShowCancelFeedback] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFetching(true);
      Promise.all([
        subscriptionsApi.getPlans().catch(() => []),
        subscriptionsApi.getMySubscription().catch(() => null),
      ]).then(([p, s]: any[]) => {
        setPlans(p || []);
        setSubscription(s || null);
      }).finally(() => setFetching(false));
    }, [])
  );

  const presentStripeSheet = async (clientSecret: string): Promise<boolean> => {
    if (!clientSecret) return true; // No Stripe price configured — fallback mode

    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'Attenteve',
      allowsDelayedPaymentMethods: false,
    });
    if (initError) {
      Alert.alert('Payment Setup Failed', initError.message);
      return false;
    }

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code !== 'Canceled') {
        Alert.alert('Payment Failed', presentError.message);
      }
      return false;
    }
    return true;
  };

  const subscribe = async () => {
    if (!selectedPlanId) {
      Alert.alert('Select a Plan', 'Please select a plan to continue.');
      return;
    }
    if (!acceptedTerms) {
      Alert.alert('Terms Required', 'Please accept the Terms and Conditions to subscribe.');
      return;
    }
    setLoading(true);
    try {
      const res: any = await subscriptionsApi.subscribe(selectedPlanId, acceptedTerms);
      const paymentOk = await presentStripeSheet(res?.clientSecret ?? '');
      if (!paymentOk) return;

      Alert.alert(
        'Subscribed!',
        'Your Attenteve subscription is now active. Annual billing is handled automatically.',
        [{ text: 'OK', onPress: () => router.replace('/(customer)') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePlan = async () => {
    if (!selectedPlanId) {
      Alert.alert('Select a Plan', 'Please select the plan you want to switch to.');
      return;
    }
    setLoading(true);
    try {
      const res: any = await subscriptionsApi.changePlan(selectedPlanId);
      if (res?.clientSecret) {
        const paymentOk = await presentStripeSheet(res.clientSecret);
        if (!paymentOk) return;
      }
      Alert.alert('Plan Updated', 'Your subscription plan has been changed.');
      setShowChangePlan(false);
      setSelectedPlanId('');
      const s: any = await subscriptionsApi.getMySubscription().catch(() => null);
      setSubscription(s);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelPlan = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure? Your subscription stays active until ' +
        new Date(subscription.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
        ' and renewal will be cancelled.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        { text: 'Cancel Subscription', style: 'destructive', onPress: () => setShowCancelFeedback(true) },
      ],
    );
  };

  const finalizeCancel = async () => {
    setShowCancelFeedback(false);
    try {
      await subscriptionsApi.cancelSubscription();
      Alert.alert(
        'Subscription Cancelled',
        'Renewal cancelled. Access continues until ' +
          new Date(subscription.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '.',
      );
      setSubscription((prev: any) => ({ ...prev, status: 'CANCELLED' }));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (fetching) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  if (subscription && !showChangePlan) {
    const endDate = new Date(subscription.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const isCancelled = subscription.status === 'CANCELLED';

    return (
      <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.activeCard}>
          <View style={styles.activeCardTop}>
            <Ionicons name="shield-checkmark" size={32} color={colors.lanternDeep} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.activePlanName}>{subscription.plan?.name}</Text>
              <Text style={styles.activePlanPrice}>${subscription.plan?.price}<Text style={styles.activePlanPer}>/yr</Text></Text>
            </View>
            <View style={[styles.statusBadge, isCancelled ? styles.statusCancelled : styles.statusActive]}>
              <Text style={[styles.statusText, isCancelled ? { color: '#c53030' } : { color: '#059669' }]}>
                {isCancelled ? 'Cancelled' : 'Active'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Inspections used</Text>
            <Text style={styles.infoVal}>{subscription.inspectionsUsed} / {subscription.plan?.inspectionsPerYear}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{isCancelled ? 'Access until' : 'Renews on'}</Text>
            <Text style={styles.infoVal}>{endDate}</Text>
          </View>

          {subscription.plan?.features?.map((f: string, i: number) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.paymentsBtn} onPress={() => router.push('/(customer)/payments')}>
          <Ionicons name="card-outline" size={18} color={colors.lanternDeep} />
          <Text style={styles.paymentsBtnText}>View Payments & History</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.steel} />
        </TouchableOpacity>

        {isCancelled ? (
          <View style={styles.cancelledNote}>
            <Ionicons name="information-circle-outline" size={18} color="#744210" />
            <Text style={styles.cancelledNoteText}>
              Renewal has been cancelled. Your subscription will expire on {endDate}.
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.changeBtn} onPress={() => { setShowChangePlan(true); setSelectedPlanId(''); }}>
              <Ionicons name="swap-horizontal" size={18} color={colors.lanternDeep} />
              <Text style={styles.changeBtnText}>Change Plan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelPlan}>
              <Ionicons name="close-circle-outline" size={18} color="#c53030" />
              <Text style={styles.cancelBtnText}>Cancel Subscription</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <CancellationFeedbackModal
        visible={showCancelFeedback}
        type="SUBSCRIPTION"
        subscriptionId={subscription.id}
        stopTimingMessage={`Your access continues until ${endDate}.`}
        onDone={finalizeCancel}
      />
      </>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {showChangePlan && (
        <TouchableOpacity style={styles.backRow} onPress={() => setShowChangePlan(false)}>
          <Ionicons name="arrow-back" size={18} color={colors.lanternDeep} />
          <Text style={styles.backText}>Back to my plan</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.title}>{showChangePlan ? 'Switch Plan' : 'Choose Your Plan'}</Text>
      <Text style={styles.subtitle}>
        {showChangePlan ? 'Select a new plan to switch to.' : 'Select the plan that best fits your home. Billed annually. Cancel anytime.'}
      </Text>

      {plans.map((plan: any) => {
        const isCurrent = subscription?.planId === plan.id;
        return (
          <TouchableOpacity
            key={plan.id}
            style={[styles.planCard, selectedPlanId === plan.id && styles.planCardActive, isCurrent && styles.planCardCurrent]}
            onPress={() => !isCurrent && setSelectedPlanId(plan.id)}
            activeOpacity={isCurrent ? 1 : 0.8}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>${plan.price}<Text style={styles.planPer}>/yr</Text></Text>
            </View>
            <Text style={styles.planDesc}>{plan.description}</Text>
            {plan.features?.map((f: string, i: number) => (
              <Text key={i} style={styles.planFeature}>✓  {f}</Text>
            ))}
            {isCurrent && <Text style={styles.currentLabel}>Current Plan</Text>}
          </TouchableOpacity>
        );
      })}

      {!showChangePlan && (
        <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((v) => !v)} activeOpacity={0.7}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && <Ionicons name="checkmark" size={14} color={colors.ink} />}
          </View>
          <Text style={styles.termsText}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>
              Terms and Conditions
            </Text>
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, (!selectedPlanId || (!showChangePlan && !acceptedTerms)) && styles.buttonDisabled]}
        onPress={showChangePlan ? changePlan : subscribe}
        disabled={loading || !selectedPlanId || (!showChangePlan && !acceptedTerms)}
      >
        {loading ? <ActivityIndicator color={colors.ink} /> : (
          <Text style={styles.buttonText}>{showChangePlan ? 'Switch Plan' : 'Subscribe & Pay'}</Text>
        )}
      </TouchableOpacity>

      {!showChangePlan && (
        <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
          <Text style={styles.skipText}>Maybe later</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 40 },
  activeCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1.5, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  activeCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  activePlanName: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep },
  activePlanPrice: { fontSize: 20, fontWeight: '800', color: colors.lanternDeep, marginTop: 2 },
  activePlanPer: { fontSize: 13, fontWeight: '400', color: colors.steel },
  statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusActive: { backgroundColor: '#dcfce7' },
  statusCancelled: { backgroundColor: '#fed7d7' },
  statusText: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  infoLabel: { fontSize: 14, color: colors.steel },
  infoVal: { fontSize: 14, fontWeight: '600', color: colors.ink },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  featureText: { fontSize: 13, color: '#444', flex: 1 },
  cancelledNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  cancelledNoteText: { flex: 1, fontSize: 13, color: '#744210', lineHeight: 20 },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.mist, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  changeBtnText: { color: colors.lanternDeep, fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff5f5', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#fed7d7',
  },
  cancelBtnText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
  paymentsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.canvas, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  paymentsBtnText: { flex: 1, color: colors.lanternDeep, fontWeight: '600', fontSize: 15 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { color: colors.lanternDeep, fontWeight: '600', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.steel, marginBottom: 20 },
  planCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14,
    borderWidth: 2, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  planCardActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  planCardCurrent: { borderColor: colors.steel, opacity: 0.7 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planName: { fontSize: 17, fontWeight: '700', color: colors.lanternDeep },
  planPrice: { fontSize: 20, fontWeight: '800', color: colors.lanternDeep },
  planPer: { fontSize: 13, fontWeight: '400', color: colors.steel },
  planDesc: { fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 18 },
  planFeature: { fontSize: 13, color: '#444', lineHeight: 22 },
  currentLabel: { marginTop: 8, fontSize: 12, color: colors.steel, fontStyle: 'italic' },
  termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginRight: 10,
    borderWidth: 1.5, borderColor: colors.steel, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  termsText: { flex: 1, fontSize: 13, color: colors.steel, lineHeight: 18 },
  termsLink: { color: colors.lanternDeep, fontWeight: '600', textDecorationLine: 'underline' },
  button: {
    backgroundColor: colors.lantern, borderRadius: 14, padding: 17,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', marginTop: 14 },
  skipText: { color: colors.steel, fontSize: 14 },
});
