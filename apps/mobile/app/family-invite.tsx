import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Linking, SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { familyApi, FamilyInviteInfo, TERMS_URL } from '../src/services/api';
import { useAuthStore } from '../src/store/auth.store';
import { PrimaryButton, ui } from '../src/components/onboarding/OnboardingUI';
import { colors } from '../src/theme';

// Family invitation (apps/api/src/family). Opened from the email's Join link
// (homeguard://family-invite?code=…), a push, the home-screen banner, or
// "I have an invitation" on the welcome screen. Works signed in or out:
//   - signed in: Accept or Decline;
//   - signed out, new to Attenteve: a short sign-up (name and password only);
//   - signed out, has an account: sign in, then accept from the banner.
export default function FamilyInviteScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { user, setUser, setAuth } = useAuthStore();
  const [code, setCode] = useState(String(params.code ?? ''));
  const [info, setInfo] = useState<FamilyInviteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sign-up form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);

  const lookup = async (c: string) => {
    const clean = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 6) { setError('Enter the 8-character code from the email.'); return; }
    setLoading(true); setError(null);
    try {
      const i = await familyApi.info(clean);
      setInfo(i);
      if (i.inviteeFirstName && !firstName) setFirstName(i.inviteeFirstName);
    } catch (e: any) {
      setInfo(null);
      setError(e.message === 'NETWORK_ERROR' ? 'Could not reach Attenteve. Check your connection.' : e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.code) { lookup(String(params.code)); return; }
    // Opened from a push or the banner without a code: show the newest invite.
    if (user) {
      setLoading(true);
      familyApi.received()
        .then((list) => { if (list[0]) { setInfo(list[0]); setCode(list[0].code); } })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [params.code]);

  const leave = () => {
    if (!user) router.replace('/(auth)/welcome');
    else router.replace(user.activeRole === 'VENDOR' ? '/(vendor)' : '/(customer)');
  };

  const accept = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const updated = await familyApi.accept(info.code);
      setUser(updated);
      Alert.alert('Welcome home', `You've joined ${info.inviterName}'s home.`);
      router.replace(updated?.activeRole === 'VENDOR' ? '/(vendor)' : '/(customer)');
    } catch (e: any) {
      Alert.alert('Could not accept', e.message);
    } finally {
      setBusy(false);
    }
  };

  const decline = () => {
    if (!info) return;
    Alert.alert('Decline invitation?', `${info.inviterName} won't be told why. They can invite you again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: async () => {
          try { await familyApi.decline(info.code); } catch (e: any) { Alert.alert('Error', e.message); return; }
          leave();
        },
      },
    ]);
  };

  const signUp = async () => {
    if (!info) return;
    if (!firstName.trim() || !lastName.trim()) { Alert.alert('Required', 'Enter your first and last name.'); return; }
    if (password.length < 8) { Alert.alert('Password', 'Use at least 8 characters, with upper and lower case letters, a number and a symbol.'); return; }
    if (!agreed) { Alert.alert('Terms', 'Please agree to the Terms & Conditions to continue.'); return; }
    setBusy(true);
    try {
      const res = await familyApi.registerInvited({ code: info.code, firstName: firstName.trim(), lastName: lastName.trim(), password });
      await setAuth(res.user, res.accessToken);
      router.replace('/(customer)');
    } catch (e: any) {
      Alert.alert('Could not create your account', e.message);
    } finally {
      setBusy(false);
    }
  };

  const open = info?.status === 'PENDING';

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={leave} accessibilityLabel="Close" style={{ padding: 6 }}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family invitation</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
          {loading && <ActivityIndicator color={colors.lanternDeep} size="large" style={{ marginTop: 40 }} />}

          {!loading && !info && (
            <View style={ui.section}>
              <Text style={ui.sectionTitle}>Enter your invitation code</Text>
              <Text style={ui.sectionHint}>It's the 8-character code in the invitation email.</Text>
              <TextInput
                style={[ui.textInput, styles.codeInput]}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="ABCD-EFGH"
                placeholderTextColor={colors.steel}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
              />
              {error && <View style={ui.warnBox}><Text style={ui.warnText}>{error}</Text></View>}
              <PrimaryButton label="Continue" onPress={() => lookup(code)} />
            </View>
          )}

          {!loading && info && (
            <>
              <View style={styles.hero}>
                <View style={styles.heroIcon}><Ionicons name="home" size={34} color={colors.ink} /></View>
                <Text style={styles.heroTitle}>
                  {open ? `${info.inviterName} invited you to join their home` : statusTitle(info)}
                </Text>
                <Text style={styles.heroBody}>
                  {open
                    ? 'You\'ll share the home on Attenteve: its plan, visits, reports and services. You won\'t need a plan of your own.'
                    : statusBody(info)}
                </Text>
              </View>

              {open && user && (
                <View style={ui.section}>
                  <PrimaryButton label={`Join ${info.inviterName}'s home`} onPress={accept} loading={busy} />
                  <TouchableOpacity onPress={decline} style={{ padding: 14, alignItems: 'center' }}>
                    <Text style={[ui.link, { color: colors.steel }]}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}

              {open && !user && info.hasAccount && (
                <View style={ui.section}>
                  <Text style={ui.sectionTitle}>You already have an account</Text>
                  <Text style={ui.sectionHint}>Sign in with {info.maskedEmail}. The invitation will be waiting on your home screen.</Text>
                  <PrimaryButton label="Sign in" onPress={() => router.push({ pathname: '/(auth)/login', params: { role: 'CUSTOMER' } })} />
                </View>
              )}

              {open && !user && !info.hasAccount && (
                <View style={ui.section}>
                  <Text style={ui.sectionTitle}>Create your account</Text>
                  <Text style={ui.sectionHint}>For {info.maskedEmail}. No address or plan needed, you'll use {info.inviterName}'s.</Text>
                  <Text style={ui.label}>First name</Text>
                  <TextInput style={ui.textInput} value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" />
                  <Text style={ui.label}>Last name</Text>
                  <TextInput style={ui.textInput} value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" />
                  <Text style={ui.label}>Password</Text>
                  <TextInput
                    style={ui.textInput} value={password} onChangeText={setPassword} secureTextEntry
                    autoComplete="new-password" textContentType="newPassword"
                  />
                  <Text style={styles.hint}>8+ characters, with upper and lower case letters, a number and a symbol.</Text>
                  <TouchableOpacity style={styles.terms} onPress={() => setAgreed(!agreed)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
                    <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? colors.lanternDeep : colors.steel} />
                    <Text style={styles.termsText}>
                      I agree to the{' '}
                      <Text style={ui.link} onPress={() => Linking.openURL(TERMS_URL)}>Terms & Conditions</Text>
                    </Text>
                  </TouchableOpacity>
                  <PrimaryButton label="Create account and join" onPress={signUp} loading={busy} />
                </View>
              )}

              {!open && <PrimaryButton label={user ? 'Back to home' : 'Back'} onPress={leave} />}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function statusTitle(i: FamilyInviteInfo) {
  if (i.status === 'ACCEPTED') return 'This invitation was already accepted';
  if (i.status === 'EXPIRED') return 'This invitation has expired';
  return 'This invitation is no longer active';
}

function statusBody(i: FamilyInviteInfo) {
  if (i.status === 'ACCEPTED') return 'Sign in to see the home.';
  return `Ask ${i.inviterName} to send you a new invitation from the Attenteve app.`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: Platform.OS === 'android' ? 36 : 6, paddingBottom: 6 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  codeInput: { fontSize: 22, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  hero: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.lantern, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  heroBody: { fontSize: 14.5, color: colors.steel, textAlign: 'center', lineHeight: 21 },
  hint: { fontSize: 12.5, color: colors.steel, marginTop: -4, marginBottom: 12 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  termsText: { fontSize: 14, color: colors.ink, flex: 1 },
});
