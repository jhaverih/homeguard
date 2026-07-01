import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi, subscriptionsApi } from '../../src/services/api';
import { api } from '../../src/services/api';

export default function CustomerProfileScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [me, sub]: any[] = await Promise.all([
          userApi.getMe(),
          subscriptionsApi.getMySubscription().catch(() => null),
        ]);
        setProfile(me?.customerProfile);
        setSubscription(sub);
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/(auth)/login');
      }},
    ]);
  };

  const changeEmail = async () => {
    if (!newEmail) { Alert.alert('Required', 'Please enter a new email'); return; }
    setSaving(true);
    try {
      await api.patch('/users/me/profile', { email: newEmail });
      Alert.alert('Done', 'Email updated. Please log in again.', [
        { text: 'OK', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) { Alert.alert('Required', 'Fill in all password fields'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Mismatch', 'New passwords do not match'); return; }
    if (newPassword.length < 8) { Alert.alert('Too short', 'Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      Alert.alert('Done', 'Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  const address = profile?.address
    ? `${profile.address}, ${profile.city}, ${profile.state} ${profile.zipCode}`
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
        </View>
        <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
      </View>

      <Text style={styles.sectionTitle}>Account Details</Text>
      <View style={styles.card}>
        <Row label="Email" value={user?.email} />
        {address && <Row label="Home Address" value={address} />}
        {subscription?.plan && <Row label="Current Plan" value={subscription.plan.name} />}
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.actionRow} onPress={() => { setShowEmailForm(!showEmailForm); setShowPasswordForm(false); }}>
          <Text style={styles.actionLabel}>Change Email</Text>
          <Text style={styles.actionChevron}>{showEmailForm ? '▲' : '▶'}</Text>
        </TouchableOpacity>
        {showEmailForm && (
          <View style={styles.formInner}>
            <TextInput
              style={styles.input}
              placeholder="New email address"
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={changeEmail} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Email</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.divider} />

        <TouchableOpacity style={styles.actionRow} onPress={() => { setShowPasswordForm(!showPasswordForm); setShowEmailForm(false); }}>
          <Text style={styles.actionLabel}>Change Password</Text>
          <Text style={styles.actionChevron}>{showPasswordForm ? '▲' : '▶'}</Text>
        </TouchableOpacity>
        {showPasswordForm && (
          <View style={styles.formInner}>
            <TextInput style={styles.input} placeholder="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            <TouchableOpacity style={styles.saveBtn} onPress={changePassword} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 32 },
  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#1e3a5f' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { fontSize: 14, color: '#888', flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1e3a5f', flex: 2, textAlign: 'right' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  actionLabel: { fontSize: 15, fontWeight: '600', color: '#1e3a5f' },
  actionChevron: { fontSize: 12, color: '#aaa' },
  divider: { height: 1, backgroundColor: '#f0f0f0' },
  formInner: { paddingHorizontal: 16, paddingBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 10, backgroundColor: '#f8f9fa' },
  saveBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
});
