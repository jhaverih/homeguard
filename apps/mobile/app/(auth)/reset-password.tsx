import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ActivityIndicator, SafeAreaView, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HoumiLogo } from '../../src/components/HoumiLogo';
import { authApi } from '../../src/services/api';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [resetToken, setResetToken] = useState(token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!resetToken.trim()) { Alert.alert('Token Required', 'Enter the reset token from your email.'); return; }
    if (password.length < 8) { Alert.alert('Weak Password', 'Password must be at least 8 characters.'); return; }
    if (password !== confirm) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }

    setLoading(true);
    try {
      await authApi.resetPassword(resetToken.trim(), password);
      setDone(true);
    } catch (e: any) {
      Alert.alert('Reset Failed', e.message === 'NETWORK_ERROR'
        ? 'Cannot reach server. Check your connection.'
        : (e.message || 'The reset link may have expired. Request a new one.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#64748b" />
        </TouchableOpacity>

        <View style={styles.inner}>
          <View style={styles.logoRow}>
            <HoumiLogo size="md" />
          </View>

          {done ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={56} color="#059669" style={{ marginBottom: 16 }} />
              <Text style={styles.title}>Password Updated</Text>
              <Text style={styles.subtitle}>Your password has been reset. Sign in with your new password.</Text>
              <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.buttonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>New Password</Text>
              <Text style={styles.subtitle}>Enter the token from your reset email, then choose a new password.</Text>

              <Text style={styles.label}>Reset Token</Text>
              <TextInput
                style={styles.input}
                placeholder="Paste token from email"
                autoCapitalize="none"
                autoCorrect={false}
                value={resetToken}
                onChangeText={setResetToken}
              />

              <Text style={styles.label}>New Password</Text>
              <View style={styles.passRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="At least 8 characters"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Repeat new password"
                secureTextEntry={!showPass}
                value={confirm}
                onChangeText={setConfirm}
                onSubmitEditing={handleReset}
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset Password</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(auth)/forgot-password')}>
                <Text style={styles.linkText}>Need a new reset link?</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  backBtn: { padding: 16 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },
  logoRow: { alignItems: 'center', marginBottom: 20 },
  successBox: { alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 16, fontSize: 16, marginBottom: 14, color: '#0f172a',
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyeBtn: { padding: 12 },
  button: { backgroundColor: '#0B4A45', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkRow: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#0B4A45', fontSize: 14, fontWeight: '600' },
});
