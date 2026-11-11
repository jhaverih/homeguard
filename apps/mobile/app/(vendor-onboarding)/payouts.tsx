import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, AppState } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { paymentsApi } from '../../src/services/api';
import { deferPayoutSetup } from '../../src/utils/payoutPrompt';
import { PrimaryButton, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

// The first screen an approved vendor sees: (vendor)/_layout sends them here
// until the company's Stripe payout account is finished, because the API
// refuses every job Accept until then (vendor-access.ts assertCanAcceptJobs).
export default function PayoutSetupScreen() {
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState(false);
  const appState = useRef(AppState.currentState);

  const check = useCallback(async (announce: boolean) => {
    setChecking(true);
    try {
      const s = await paymentsApi.getVendorStripeStatus();
      setConnected(s.connected);
      if (s.onboardingComplete) {
        router.replace('/(vendor)');
        if (announce) Alert.alert('Payouts are set up', 'You can now accept jobs.');
      } else if (announce) {
        Alert.alert('Not finished yet', s.connected
          ? 'Stripe still needs a few details. Tap Continue Stripe setup to finish.'
          : 'Tap Connect Stripe Account to start.');
      }
    } catch (e: any) {
      if (announce) Alert.alert('Could not check payouts', e?.message || 'Try again.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(false); }, [check]);

  // Stripe opens in the browser; re-check when the vendor comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') check(true);
      appState.current = next;
    });
    return () => sub.remove();
  }, [check]);

  const openStripe = async () => {
    setOpening(true);
    try {
      const res: any = await paymentsApi.getOnboardingLink();
      await Linking.openURL(res.url);
    } catch (e: any) {
      Alert.alert('Could not open Stripe', e?.response?.data?.message || e?.message || 'Try again.');
    } finally {
      setOpening(false);
    }
  };

  const browseFirst = () => {
    deferPayoutSetup();
    router.replace('/(vendor)');
  };

  return (
    <ScrollView style={ui.screen}contentContainerStyle={ui.content}>
      <View style={styles.hero}>
        <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        <Text style={styles.title}>Your company is approved</Text>
        <Text style={styles.body}>
          One last step: connect a Stripe account so Attenteve can pay you. You can't accept jobs until payouts are set up.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What Stripe asks for</Text>
        <Text style={styles.bullet}>• Your business details and EIN</Text>
        <Text style={styles.bullet}>• A bank account for deposits</Text>
        <Text style={styles.bullet}>• Identity verification for the account owner</Text>
        <Text style={styles.note}>It takes about 5 minutes. When you finish, come back to the app.</Text>
      </View>

      <TouchableOpacity style={styles.stripeBtn} onPress={openStripe} disabled={opening}>
        {opening
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.stripeBtnText}>{connected ? 'Continue Stripe setup' : 'Connect Stripe Account'}</Text>}
      </TouchableOpacity>

      <PrimaryButton label="I've finished, check again" onPress={() => check(true)} loading={checking} />

      <TouchableOpacity style={styles.later} onPress={browseFirst}>
        <Text style={styles.laterText}>Browse open jobs first</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 10, textAlign: 'center' },
  body: { fontSize: 15, color: colors.steel, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#635bff' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  bullet: { fontSize: 14, color: colors.steel, lineHeight: 22 },
  note: { fontSize: 13, color: colors.steel, marginTop: 10 },
  stripeBtn: { backgroundColor: '#635bff', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 12 },
  stripeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  later: { alignItems: 'center', padding: 14 },
  laterText: { color: colors.lanternDeep, fontWeight: '600', fontSize: 14 },
});
