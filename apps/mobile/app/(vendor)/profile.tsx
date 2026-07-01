import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/auth.store';
import { paymentsApi, userApi } from '../../src/services/api';

export default function VendorProfileScreen() {
  const { user, logout } = useAuthStore();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      userApi.getMe().then((res: any) => {
        const vp = res?.vendorProfile;
        if (vp?.companyName) setCompanyName(vp.companyName);
      }).catch(() => {});
    }, [])
  );

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
      {companyName ? <Text style={styles.companyName}>{companyName}</Text> : null}
      <Text style={styles.email}>{user?.email}</Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email}</Text>
        </View>
        {companyName ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Company</Text>
            <Text style={styles.infoValue}>{companyName}</Text>
          </View>
        ) : null}
      </View>

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
  name: { fontSize: 22, fontWeight: '700', color: '#2d4a22', marginBottom: 2 },
  companyName: { fontSize: 16, fontWeight: '600', color: '#4a7c59', marginBottom: 2 },
  email: { fontSize: 14, color: '#888', marginBottom: 20 },
  infoCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { fontSize: 14, color: '#888', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#2d4a22', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  section: { width: '100%', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', marginBottom: 12 },
  stripeBtn: { backgroundColor: '#635bff', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  stripeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stripeHint: { fontSize: 12, color: '#888', textAlign: 'center' },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
});
