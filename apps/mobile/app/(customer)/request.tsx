import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { requestsApi } from '../../src/services/api';

export default function RequestInspectionScreen() {
  const [loading, setLoading] = useState(false);
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!preferredDate) {
      Alert.alert('Missing Info', 'Please enter a preferred date');
      return;
    }
    setLoading(true);
    try {
      await requestsApi.create({
        preferredDate: new Date(preferredDate).toISOString(),
        customerNotes: notes,
        address: '',
        city: '',
        state: '',
        zipCode: '',
      });
      Alert.alert(
        'Request Sent!',
        'We are finding available vendors. You will be notified when one accepts.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Request an Inspection</Text>
      <Text style={styles.subtitle}>
        Tell us when works best for you. An available vendor will accept and confirm the date.
      </Text>

      <Text style={styles.label}>Preferred Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD (e.g. 2025-03-15)"
        value={preferredDate}
        onChangeText={setPreferredDate}
        keyboardType="numbers-and-punctuation"
      />

      <Text style={styles.label}>Notes for the Vendor (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Any special instructions or things the vendor should know..."
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
      />

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>What's included in your inspection:</Text>
        <Text style={styles.infoItem}>✓ AC visual inspection & filter replacement</Text>
        <Text style={styles.infoItem}>✓ Toilet water leakage check</Text>
        <Text style={styles.infoItem}>✓ Light bulb replacement</Text>
        <Text style={styles.infoItem}>✓ Any additional items from your plan</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Request</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, fontSize: 16, marginBottom: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  infoBox: { backgroundColor: '#e8f0fe', borderRadius: 12, padding: 16, marginBottom: 24 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  infoItem: { fontSize: 14, color: '#2c5282', lineHeight: 24 },
  button: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888', fontSize: 14 },
});
