import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HoumiLogo } from '../../src/components/HoumiLogo';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#64748b" />
        </TouchableOpacity>

        <View style={styles.logoRow}><HoumiLogo size="md" /></View>

        <Text style={styles.title}>Verify Your Email</Text>

        <View style={styles.infoBox}>
          <Ionicons name="mail-outline" size={52} color="#0B4A45" style={{ marginBottom: 12 }} />
          <Text style={styles.infoText}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ fontWeight: '700', color: '#0B4A45' }}>{resolvedEmail}</Text>
          </Text>
        </View>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="000000"
          placeholderTextColor="#94a3b8"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(t) => { setCode(t); setError(''); }}
          textAlign="center"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={cooldown > 0}>
          <Text style={[styles.resendText, cooldown > 0 && { color: '#94a3b8' }]}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get the code? Resend"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  backBtn: { marginBottom: 8 },
  logoRow: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 20 },
  infoBox: {
    backgroundColor: '#EBF1EF', borderRadius: 16, padding: 28,
    alignItems: 'center', marginBottom: 24,
  },
  infoText: { fontSize: 15, color: '#334155', lineHeight: 22, textAlign: 'center' },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    padding: 20, fontSize: 28, fontWeight: '700', letterSpacing: 8,
    textAlign: 'center', marginBottom: 4, color: '#0f172a',
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 12, marginBottom: 8, marginLeft: 2 },
  button: {
    backgroundColor: '#0B4A45', borderRadius: 14, padding: 17,
    alignItems: 'center', marginTop: 12, marginBottom: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 12, padding: 8 },
  resendText: { fontSize: 14, color: '#0B4A45', fontWeight: '600' },
});
