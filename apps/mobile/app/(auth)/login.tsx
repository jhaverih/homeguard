import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router, Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const { control, handleSubmit, formState: { errors } } = useForm();

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
        Alert.alert('Login Failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.logo}>🏠 HomeGuard</Text>
        <Text style={styles.title}>Welcome Back</Text>

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
              value={value}
              onChangeText={onChange}
            />
          )}
        />
        {errors.password && <Text style={styles.error}>{errors.password.message as string}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/register" style={styles.link}>
          Don't have an account? <Text style={styles.linkBold}>Register here</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#1e3a5f', textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, fontSize: 16, marginBottom: 12,
  },
  inputError: { borderColor: '#e53e3e' },
  error: { color: '#e53e3e', fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 },
  button: {
    backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 24, color: '#666', fontSize: 14 },
  linkBold: { color: '#1e3a5f', fontWeight: '600' },
});
