import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi, subscriptionsApi, teamApi } from '../../src/services/api';
import { api } from '../../src/services/api';

const BIOMETRIC_ENABLED_KEY = 'hg_biometric_enabled';
const SAVED_EMAIL_KEY = 'hg_saved_email';
const SAVED_PASSWORD_KEY = 'hg_saved_password';

export default function CustomerProfileScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyEmail, setFamilyEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

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
        const [me, sub, members]: any[] = await Promise.all([
          userApi.getMe(),
          subscriptionsApi.getMySubscription().catch(() => null),
          teamApi.getMembers().catch(() => []),
        ]);
        setProfile(me?.customerProfile);
        setSubscription(sub);
        setFamilyMembers(Array.isArray(members) ? members : []);

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
          setBiometricEnabled(enabled === 'true');
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBiometricLabel('Face ID');
          else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBiometricLabel('Fingerprint');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const addFamilyMember = async () => {
    if (!familyEmail.trim()) { Alert.alert('Required', 'Enter the family member\'s email address'); return; }
    setAddingMember(true);
    try {
      await teamApi.addMember(familyEmail.trim().toLowerCase());
      const members: any = await teamApi.getMembers();
      setFamilyMembers(Array.isArray(members) ? members : []);
      setFamilyEmail('');
      setShowFamilyForm(false);
      Alert.alert('Added', 'Family member added. They can now see your inspections.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingMember(false);
    }
  };

  const removeFamilyMember = (member: any) => {
    Alert.alert(
      'Remove Family Member',
      `Remove ${member.firstName} ${member.lastName} from your household?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await teamApi.removeMember(member.id);
              setFamilyMembers((prev) => prev.filter((m) => m.id !== member.id));
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  const disableBiometric = () => {
    Alert.alert(
      `Disable ${biometricLabel} Sign-In`,
      'You will need to enter your password the next time you sign in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable', style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
            await SecureStore.deleteItemAsync(SAVED_EMAIL_KEY);
            await SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY);
            setBiometricEnabled(false);
          },
        },
      ],
    );
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  const address = profile?.address
    ? `${profile.address}, ${profile.city}, ${profile.state} ${profile.zipCode}`
    : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

      <Text style={styles.sectionTitle}>Family Members</Text>
      <View style={styles.card}>
        {familyMembers.length === 0 && !showFamilyForm && (
          <Text style={styles.emptyNote}>No family members added yet.</Text>
        )}
        {familyMembers.map((m: any) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>{m.firstName?.[0]}{m.lastName?.[0]}</Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.firstName} {m.lastName}</Text>
              <Text style={styles.memberEmail}>{m.email}</Text>
            </View>
            <TouchableOpacity onPress={() => removeFamilyMember(m)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {showFamilyForm && (
          <View style={styles.formInner}>
            <TextInput
              style={styles.input}
              placeholder="Family member's email"
              placeholderTextColor="#94a3b8"
              value={familyEmail}
              onChangeText={setFamilyEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={addFamilyMember} disabled={addingMember}>
              {addingMember ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Add Member</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowFamilyForm(false); setFamilyEmail(''); }} style={styles.cancelInlineBtn}>
              <Text style={styles.cancelInlineText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {!showFamilyForm && (
          <TouchableOpacity style={styles.addFamilyBtn} onPress={() => setShowFamilyForm(true)}>
            <Text style={styles.addFamilyBtnText}>+ Add Family Member</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>Payment & Plan</Text>
      <View style={styles.card}>
        {subscription ? (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Active Plan</Text>
              <Text style={styles.rowValue}>{subscription.plan?.name ?? 'Active'}</Text>
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.rowLabel}>Status</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={[styles.rowValue, { color: '#059669' }]}>Payments active</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="alert-circle-outline" size={20} color="#d97706" />
              <Text style={{ fontSize: 14, color: '#d97706', fontWeight: '600', flex: 1 }}>
                No active plan — required to request services
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#0B4A45', borderRadius: 10, padding: 14, alignItems: 'center' }}
              onPress={() => router.push('/(customer)/subscribe')}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>View Plans & Subscribe</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        {biometricEnabled && (
          <>
            <View style={styles.actionRow}>
              <Ionicons name="finger-print-outline" size={20} color="#059669" style={{ marginRight: 8 }} />
              <Text style={[styles.actionLabel, { color: '#059669', flex: 1 }]}>{biometricLabel} Sign-In Active</Text>
              <TouchableOpacity onPress={disableBiometric} style={styles.disableBtn}>
                <Text style={styles.disableBtnText}>Disable</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
          </>
        )}
        <TouchableOpacity style={styles.actionRow} onPress={() => { setShowEmailForm(!showEmailForm); setShowPasswordForm(false); }}>
          <Text style={styles.actionLabel}>Change Email</Text>
          <Text style={styles.actionChevron}>{showEmailForm ? '▲' : '▶'}</Text>
        </TouchableOpacity>
        {showEmailForm && (
          <View style={styles.formInner}>
            <TextInput
              style={styles.input}
              placeholder="New email address"
              placeholderTextColor="#94a3b8"
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
            <TextInput style={styles.input} placeholder="Current password" placeholderTextColor="#94a3b8" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="New password" placeholderTextColor="#94a3b8" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor="#94a3b8" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
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
    </KeyboardAvoidingView>
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
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0B4A45', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#0B4A45' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { fontSize: 14, color: '#888', flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#0B4A45', flex: 2, textAlign: 'right' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  actionLabel: { fontSize: 15, fontWeight: '600', color: '#0B4A45' },
  actionChevron: { fontSize: 12, color: '#aaa' },
  divider: { height: 1, backgroundColor: '#f0f0f0' },
  formInner: { paddingHorizontal: 16, paddingBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 10, backgroundColor: '#f8f9fa', color: '#0f172a' },
  saveBtn: { backgroundColor: '#0B4A45', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
  emptyNote: { fontSize: 14, color: '#aaa', paddingHorizontal: 16, paddingVertical: 14, fontStyle: 'italic' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0B4A45', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  memberAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: '#0B4A45' },
  memberEmail: { fontSize: 12, color: '#888', marginTop: 1 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff5f5', borderRadius: 8, borderWidth: 1, borderColor: '#fed7d7' },
  removeBtnText: { fontSize: 12, color: '#c53030', fontWeight: '600' },
  addFamilyBtn: { margin: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#0B4A45', borderStyle: 'dashed', padding: 13, alignItems: 'center' },
  addFamilyBtnText: { fontSize: 14, fontWeight: '700', color: '#0B4A45' },
  cancelInlineBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelInlineText: { color: '#888', fontSize: 14 },
  disableBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff5f5', borderRadius: 8, borderWidth: 1, borderColor: '#fed7d7' },
  disableBtnText: { fontSize: 12, color: '#c53030', fontWeight: '600' },
});
