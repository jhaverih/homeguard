import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ActivityIndicator, SafeAreaView, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';
import { authApi } from '../../src/services/api';
import { colors } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(trimmed);
      setSent(true);
    } catch (e: any) {
      // Show generic success even on error to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.steel} />
        </TouchableOpacity>

        <View style={styles.inner}>
          <View style={styles.logoRow}>
            <AttenteveLogo size="md" />
          </View>

          {sent ? (
            <View style={styles.successBox}>
              <Ionicons name="mail-outline" size={48} color={colors.lanternDeep} style={{ marginBottom: 16 }} />
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                If that email address is registered, we've sent a 6-digit reset code. Check your inbox (and spam folder).
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => router.push('/(auth)/reset-password')}>
                <Text style={styles.buttonText}>Enter Code</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelRow} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.cancelText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Enter your email address and we'll send you a 6-digit code to reset your password.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Email address"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />

              <TouchableOpacity
                style={[styles.button, (!email.trim() || loading) && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={loading || !email.trim()}
              >
                {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Send Reset Code</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelRow} onPress={() => router.back()}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  backBtn: { padding: 16 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },
  logoRow: { alignItems: 'center', marginBottom: 24 },
  successBox: { alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, color: colors.steel, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
    padding: 16, fontSize: 16, marginBottom: 16, color: colors.ink,
  },
  button: { backgroundColor: colors.lantern, borderRadius: 14, padding: 17, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  cancelRow: { alignItems: 'center' },
  cancelText: { color: colors.steel, fontSize: 14 },
});
