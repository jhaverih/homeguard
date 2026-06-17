import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';

export default function CustomerProfileScreen() {
  const { user, logout } = useAuthStore();

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
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Role</Text>
          <Text style={styles.cardValue}>Homeowner (Customer)</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Plans</Text>
          <Text style={styles.cardValue}>{user?.roles?.join(', ')}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 24, alignItems: 'center', paddingTop: 48 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#1e3a5f', marginBottom: 4 },
  email: { fontSize: 14, color: '#888', marginBottom: 32 },
  section: { width: '100%', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e3a5f', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { fontSize: 14, color: '#888' },
  cardValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  logoutBtn: { backgroundColor: '#fed7d7', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
});
