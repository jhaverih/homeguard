import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { paymentsApi } from '../../src/services/api';

export default function VendorProfileScreen() {
  const { user, logout } = useAuthStore();
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const startOnboarding = async () => {
    setOnboardingLoading(true);
    try {
      const res: any = await paymentsApi.getOnboardingLink();
      await Linking.openURL(res.url);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/(auth)/login');
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
      </View>
      <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payments</Text>
        <TouchableOpacity style={styles.stripeBtn} onPress={startOnboarding} disabled={onboardingLoading}>
          {onboardingLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.stripeBtnText}>💳 Set Up / Manage Stripe Payouts</Text>
          }
        </TouchableOpacity>
        <Text style={styles.stripeHint}>Required to receive payments. Stripe will verify your identity.</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 24, alignItems: 'center', paddingTop: 48 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2d4a22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#2d4a22', marginBottom: 4 },
  email: { fontSize: 14, color: '#888', marginBottom: 32 },
  section: { width: '100%', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', marginBottom: 12 },
  stripeBtn: { backgroundColor: '#635bff', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  stripeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stripeHint: { fontSize: 12, color: '#888', textAlign: 'center' },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
});
