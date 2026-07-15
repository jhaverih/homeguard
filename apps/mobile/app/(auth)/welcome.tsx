import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';
import { colors } from '../../src/theme';

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
            <View style={styles.cardIconBox}>
              <Ionicons name="home-outline" size={30} color={colors.lanternDeep} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>I'm a Homeowner</Text>
              <Text style={styles.cardDesc}>Schedule inspections, manage your home</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.border} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { role: 'VENDOR' } })}
          >
            <View style={styles.cardIconBox}>
              <Ionicons name="construct-outline" size={30} color={colors.lanternDeep} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>I'm a Service Provider</Text>
              <Text style={styles.cardDesc}>Manage jobs, schedule visits, grow your business</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.border} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© 2026 Attenteve. All rights reserved.</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  safe: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  tagline: { fontSize: 15, color: colors.mistDim, marginTop: 20, textAlign: 'center', lineHeight: 22 },
  cards: { paddingHorizontal: 24, paddingBottom: 24 },
  question: { fontSize: 14, color: colors.mistDim, textAlign: 'center', marginBottom: 16, fontWeight: '500', letterSpacing: 0.3 },
  card: {
    backgroundColor: colors.surface, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  cardIconBox: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14, backgroundColor: colors.mist },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3, color: colors.ink },
  cardDesc: { fontSize: 13, color: colors.steel, lineHeight: 18 },
  footer: { fontSize: 12, color: colors.slateSoft, textAlign: 'center', paddingBottom: 16 },
});
