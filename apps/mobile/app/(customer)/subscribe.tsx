import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { subscriptionsApi } from '../../src/services/api';

export default function SubscribeScreen() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    subscriptionsApi.getPlans()
      .then((data: any) => setPlans(data || []))
      .catch(() => setPlans([]))
      .finally(() => setFetching(false));
  }, []);

  const subscribe = async () => {
    if (!selectedPlanId) {
      Alert.alert('Select a Plan', 'Please select a subscription plan to continue.');
      return;
    }
    setLoading(true);
    try {
      await subscriptionsApi.subscribe(selectedPlanId);
      Alert.alert('Success!', 'Your subscription is now active.', [
        { text: 'OK', onPress: () => router.replace('/(customer)') },
      ]);
    } catch (e: any) {
      Alert.alert('Subscription Failed', e.message === 'NETWORK_ERROR'
        ? 'Cannot connect to server. Make sure you are on home WiFi.'
        : e.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose Your Plan</Text>
      <Text style={styles.subtitle}>Select the plan that best fits your home.</Text>

      {plans.map((plan: any) => (
        <TouchableOpacity
          key={plan.id}
          style={[styles.planCard, selectedPlanId === plan.id && styles.planCardActive]}
          onPress={() => setSelectedPlanId(plan.id)}
        >
          <View style={styles.planHeader}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>${plan.price}<Text style={styles.planPer}>/yr</Text></Text>
          </View>
          <Text style={styles.planDesc}>{plan.description}</Text>
          {plan.features?.map((f: string, i: number) => (
            <Text key={i} style={styles.planFeature}>✓  {f}</Text>
          ))}
          {selectedPlanId === plan.id && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>Selected</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.button, !selectedPlanId && styles.buttonDisabled]}
        onPress={subscribe}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Activate Subscription</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
        <Text style={styles.skipText}>Maybe later</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#1e3a5f', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  planCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 2, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  planCardActive: { borderColor: '#1e3a5f', backgroundColor: '#f0f4ff' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planName: { fontSize: 18, fontWeight: '700', color: '#1e3a5f' },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#2d7d46' },
  planPer: { fontSize: 14, fontWeight: '400', color: '#888' },
  planDesc: { fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18 },
  planFeature: { fontSize: 14, color: '#444', lineHeight: 24 },
  selectedBadge: {
    marginTop: 12, alignSelf: 'flex-start',
    backgroundColor: '#1e3a5f', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4,
  },
  selectedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { color: '#888', fontSize: 14 },
});
