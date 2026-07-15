import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <AttenteveLogo size="xl" onDark />
          <Text style={styles.tagline}>Professional Home Care & Inspections</Text>
        </View>

        <View style={styles.cards}>
          <Text style={styles.question}>How can we help you today?</Text>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { role: 'CUSTOMER' } })}
          >
            <View style={[styles.cardIconBox, { backgroundColor: '#EBF1EF' }]}>
              <Ionicons name="home-outline" size={30} color="#0B4A45" />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: '#0B4A45' }]}>I'm a Homeowner</Text>
              <Text style={styles.cardDesc}>Schedule inspections, manage your home</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { role: 'VENDOR' } })}
          >
            <View style={[styles.cardIconBox, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="construct-outline" size={30} color="#0B4A45" />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: '#0B4A45' }]}>I'm a Service Provider</Text>
              <Text style={styles.cardDesc}>Manage jobs, schedule visits, grow your business</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© 2026 Houmi. All rights reserved.</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B4A45' },
  safe: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.65)', marginTop: 20, textAlign: 'center', lineHeight: 22 },
  cards: { paddingHorizontal: 24, paddingBottom: 24 },
  question: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 16, fontWeight: '500', letterSpacing: 0.3 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  cardIconBox: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardDesc: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  footer: { fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingBottom: 16 },
});
