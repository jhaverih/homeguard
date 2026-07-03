import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking, ScrollView, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/auth.store';
import { paymentsApi, userApi, teamApi } from '../../src/services/api';

export default function VendorProfileScreen() {
  const { user, logout } = useAuthStore();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [techEmail, setTechEmail] = useState('');
  const [addingTech, setAddingTech] = useState(false);

  useFocusEffect(
    useCallback(() => {
      userApi.getMe().then((res: any) => {
        const vp = res?.vendorProfile;
        if (vp?.companyName) setCompanyName(vp.companyName);
      }).catch(() => {});
      teamApi.getMembers().then((res: any) => {
        setTeamMembers(Array.isArray(res) ? res : []);
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

  const addTechnician = async () => {
    if (!techEmail.trim()) { Alert.alert('Required', 'Enter the technician\'s email'); return; }
    setAddingTech(true);
    try {
      await teamApi.addMember(techEmail.trim().toLowerCase());
      const members: any = await teamApi.getMembers();
      setTeamMembers(Array.isArray(members) ? members : []);
      setTechEmail('');
      setShowTeamForm(false);
      Alert.alert('Added', 'Technician added to your team.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingTech(false);
    }
  };

  const removeTechnician = (member: any) => {
    Alert.alert(
      'Remove Technician',
      `Remove ${member.firstName} ${member.lastName} from your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await teamApi.removeMember(member.id);
              setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
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

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Team</Text>
        <View style={styles.teamCard}>
          {teamMembers.length === 0 && !showTeamForm && (
            <Text style={styles.emptyNote}>No technicians added yet.</Text>
          )}
          {teamMembers.map((m: any) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{m.firstName?.[0]}{m.lastName?.[0]}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.firstName} {m.lastName}</Text>
                <Text style={styles.memberEmail}>{m.email}</Text>
              </View>
              <TouchableOpacity onPress={() => removeTechnician(m)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          {showTeamForm && (
            <View style={styles.formInner}>
              <TextInput
                style={styles.input}
                placeholder="Technician's email"
                value={techEmail}
                onChangeText={setTechEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addTechnician} disabled={addingTech}>
                {addingTech ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Add Technician</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowTeamForm(false); setTechEmail(''); }} style={styles.cancelInlineBtn}>
                <Text style={styles.cancelInlineText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          {!showTeamForm && (
            <TouchableOpacity style={styles.addTeamBtn} onPress={() => setShowTeamForm(true)}>
              <Text style={styles.addTeamBtnText}>+ Add Technician</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8f9fa' },
  container: { padding: 24, alignItems: 'center', paddingTop: 48, paddingBottom: 40 },
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
  teamCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  emptyNote: { fontSize: 14, color: '#aaa', paddingHorizontal: 16, paddingVertical: 14, fontStyle: 'italic' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2d4a22', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  memberAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: '#2d4a22' },
  memberEmail: { fontSize: 12, color: '#888', marginTop: 1 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff5f5', borderRadius: 8, borderWidth: 1, borderColor: '#fed7d7' },
  removeBtnText: { fontSize: 12, color: '#c53030', fontWeight: '600' },
  formInner: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 10, backgroundColor: '#f8f9fa' },
  addBtn: { backgroundColor: '#2d4a22', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelInlineBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelInlineText: { color: '#888', fontSize: 14 },
  addTeamBtn: { margin: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#2d4a22', borderStyle: 'dashed', padding: 13, alignItems: 'center' },
  addTeamBtnText: { fontSize: 14, fontWeight: '700', color: '#2d4a22' },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
});
