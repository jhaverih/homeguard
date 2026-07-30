import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { colors } from '../../src/theme';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { user, token } = useAuthStore();
  const resolvedEmail = email || user?.email || '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { setAuth } = useAuthStore();

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setCooldown(60);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(cooldownRef.current!); return 0; } return c - 1; });
    }, 1000);
  };

  const handleVerify = async () => {
    if (code.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.verifyEmail(resolvedEmail, code.trim());
      // If we have a current user/token, just navigate home
      if (user && token) {
        await setAuth(user, token);
      } else {
        router.replace('/(auth)/login');
      }
    } catch (e: any) {
      setError(e.message || 'Invalid or expired code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await authApi.resendVerification(resolvedEmail);
      startCooldown();
      Alert.alert('Code Sent', `A new code was sent to ${resolvedEmail}`);
    } catch {
      Alert.alert('Error', 'Could not resend code. Try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.steel} />
        </TouchableOpacity>

        <View style={styles.logoRow}><AttenteveLogo size="md" /></View>

        <Text style={styles.title}>Verify Your Email</Text>

        <View style={styles.infoBox}>
          <Ionicons name="mail-outline" size={52} color={colors.lanternDeep} style={{ marginBottom: 12 }} />
          <Text style={styles.infoText}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ fontWeight: '700', color: colors.lanternDeep }}>{resolvedEmail}</Text>
          </Text>
        </View>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="000000"
          placeholderTextColor={colors.steel}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(t) => { setCode(t); setError(''); }}
          textAlign="center"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={cooldown > 0}>
          <Text style={[styles.resendText, cooldown > 0 && { color: colors.steel }]}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get the code? Resend"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  backBtn: { marginBottom: 8 },
  logoRow: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 20 },
  infoBox: {
    backgroundColor: colors.mist, borderRadius: 16, padding: 28,
    alignItems: 'center', marginBottom: 24,
  },
  infoText: { fontSize: 15, color: colors.slate, lineHeight: 22, textAlign: 'center' },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    padding: 20, fontSize: 28, fontWeight: '700', letterSpacing: 8,
    textAlign: 'center', marginBottom: 4, color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: 8, marginLeft: 2 },
  button: {
    backgroundColor: colors.lantern, borderRadius: 14, padding: 17,
    alignItems: 'center', marginTop: 12, marginBottom: 8,
  },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 12, padding: 8 },
  resendText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },
});
