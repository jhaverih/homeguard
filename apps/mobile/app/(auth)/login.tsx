import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { router, Link, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const { control, handleSubmit, formState: { errors } } = useForm();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const isVendor = role === 'VENDOR';
  const accent = isVendor ? '#2d4a22' : '#1e3a5f';
  const roleLabel = isVendor ? 'Service Provider' : 'Homeowner';

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const res: any = await authApi.login(data.email, data.password);
      await setAuth(res.user, res.accessToken);
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        Alert.alert(
          'Cannot Connect to Server',
          'Your phone cannot reach the HomeGuard server.\n\nMake sure your phone is on your home WiFi (not cellular data).\n\nServer: 192.168.86.29',
        );
      } else {
        Alert.alert('Login Failed', 'Incorrect email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#64748b" />
        </TouchableOpacity>

        <View style={styles.inner}>
          <View style={[styles.badge, { backgroundColor: isVendor ? '#e8f5e9' : '#e8f0fe' }]}>
            <Ionicons name={isVendor ? 'construct-outline' : 'home-outline'} size={20} color={accent} />
            <Text style={[styles.badgeText, { color: accent }]}>{roleLabel}</Text>
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your HomeGuard account</Text>

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
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, gap: 6, marginBottom: 24 },
  badgeText: { fontSize: 14, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 16, fontSize: 16, marginBottom: 12, color: '#0f172a',
  },
  inputError: { borderColor: '#e53e3e' },
  error: { color: '#e53e3e', fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 },
  button: {
    borderRadius: 14, padding: 17,
    alignItems: 'center', marginTop: 8, marginBottom: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerRow: { flexDirection: 'row', justifyContent: 'center' },
  registerText: { color: '#64748b', fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '600' },
});
