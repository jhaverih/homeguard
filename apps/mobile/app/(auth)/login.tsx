import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo, AttenteveIcon } from '../../src/components/AttenteveLogo';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

const SAVED_EMAIL_KEY = 'hg_saved_email';
const SAVED_PASSWORD_KEY = 'hg_saved_password';
const BIOMETRIC_ENABLED_KEY = 'hg_biometric_enabled';
const REMEMBERED_EMAIL_KEY = 'hg_remembered_email';

async function getBiometricLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
  return 'Biometrics';
}

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricLoading, setBiometricLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const { control, handleSubmit, setValue, formState: { errors } } = useForm();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const isVendor = role === 'VENDOR';
  const accent = isVendor ? '#0B4A45' : '#0B4A45';
  const roleLabel = isVendor ? 'Service Provider' : 'Homeowner';

  const doLogin = async (email: string, password: string) => {
    const res: any = await authApi.login(email, password);
    await setAuth(res.user, res.accessToken);
    await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, email);
    return res;
  };

  const promptSaveCredentials = (email: string, password: string) => {
    Alert.alert(
      `Enable ${biometricLabel} Sign-In?`,
      `Sign in faster next time using ${biometricLabel} instead of typing your password.`,
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Enable',
          onPress: async () => {
            await SecureStore.setItemAsync(SAVED_EMAIL_KEY, email);
            await SecureStore.setItemAsync(SAVED_PASSWORD_KEY, password);
            await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
            setBiometricEnabled(true);
          },
        },
      ],
    );
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      await doLogin(data.email, data.password);
      if (biometricAvailable && !biometricEnabled) {
        promptSaveCredentials(data.email, data.password);
      }
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        Alert.alert(
          'Cannot Connect to Server',
          'Make sure your phone is on your home WiFi (not cellular data).\n\nServer: 192.168.86.29',
        );
      } else {
        Alert.alert('Login Failed', 'Incorrect email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Houmi',
        fallbackLabel: 'Use Password',
        disableDeviceFallback: false,
      });

      // User cancelled or sensor not available — silently show password form
      if (!result.success) return;

      const email = await SecureStore.getItemAsync(SAVED_EMAIL_KEY);
      const password = await SecureStore.getItemAsync(SAVED_PASSWORD_KEY);

      if (!email || !password) {
        await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(false);
        return;
      }

      await doLogin(email, password);
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        Alert.alert('Cannot Connect to Server', 'Make sure you are on your home WiFi.');
      }
      // Other errors: silently fall through to password form
    } finally {
      setBiometricLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      // Load hardware state
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);
      setBiometricEnabled(available && enabled === 'true');
      if (available) setBiometricLabel(await getBiometricLabel());

      // Pre-fill remembered email
      const savedEmail = await SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY);
      if (savedEmail) setValue('email', savedEmail);

      // Auto-trigger biometric prompt if already enrolled
      if (available && enabled === 'true') {
        setTimeout(handleBiometricLogin, 400);
      }
    })();
  }, []);

  const biometricIcon = biometricLabel === 'Face ID' ? 'scan-outline' : 'finger-print-outline';

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#64748b" />
        </TouchableOpacity>

        <View style={styles.inner}>
          <View style={styles.logoRow}>
            <AttenteveLogo size="md" />
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <View style={[styles.badge, { backgroundColor: isVendor ? '#e8f5e9' : '#EBF1EF' }]}>
            <Ionicons name={isVendor ? 'construct-outline' : 'home-outline'} size={16} color={accent} />
            <Text style={[styles.badgeText, { color: accent }]}>{roleLabel} Sign In</Text>
          </View>

          {/* Biometric quick sign-in — shown while prompt loads or as fallback button */}
          {biometricEnabled && (
            <TouchableOpacity
              style={[styles.biometricBtn, { borderColor: accent }]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading}
            >
              {biometricLoading ? (
                <ActivityIndicator color={accent} />
              ) : (
                <>
                  <Ionicons name={biometricIcon as any} size={28} color={accent} />
                  <Text style={[styles.biometricLabel, { color: accent }]}>Sign in with {biometricLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {biometricEnabled && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use password</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          <Controller
            control={control}
            name="email"
            rules={{ required: 'Email is required' }}
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="Email address"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.email && <Text style={styles.error}>{errors.email.message as string}</Text>}

          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password is required' }}
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="Password"
                secureTextEntry
                autoComplete="password"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.password && <Text style={styles.error}>{errors.password.message as string}</Text>}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: accent }]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { role: role ?? 'CUSTOMER' } })}
          >
            <Text style={[styles.forgotText, { color: accent }]}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerRow}
            onPress={() => router.push({ pathname: '/(auth)/register', params: { role: role ?? 'CUSTOMER' } })}
          >
            <Text style={styles.registerText}>Don't have an account? </Text>
            <Text style={[styles.registerLink, { color: accent }]}>Register here</Text>
          </TouchableOpacity>
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
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, gap: 6, marginBottom: 24 },
  badgeText: { fontSize: 14, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 10 },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 2, borderRadius: 14, padding: 16, marginBottom: 8, backgroundColor: '#fff',
  },
  biometricLabel: { fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { fontSize: 13, color: '#94a3b8' },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 16, fontSize: 16, marginBottom: 12, color: '#0f172a',
  },
  inputError: { borderColor: '#e53e3e' },
  error: { color: '#e53e3e', fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 },
  button: { borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotRow: { alignItems: 'center', marginBottom: 16, marginTop: -8 },
  forgotText: { fontSize: 14, fontWeight: '600' },
  registerRow: { flexDirection: 'row', justifyContent: 'center' },
  registerText: { color: '#64748b', fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '600' },
});
