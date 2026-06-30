import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { requestsApi } from '../../src/services/api';

function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{formatted}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker
            value={value}
            mode="date"
            minimumDate={new Date()}
            onChange={(_, d) => {
              setShowDate(false);
              if (d) { setTempDate(d); setShowTime(true); }
            }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate}
            mode="time"
            onChange={(_, d) => {
              setShowTime(false);
              if (d) onChange(d);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <RNDateTimePicker
              value={value}
              mode="datetime"
              minimumDate={new Date()}
              display="inline"
              onChange={(_, d) => { if (d) onChange(d); }}
              style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function RequestInspectionScreen() {
  const [loading, setLoading] = useState(false);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [preferredDate, setPreferredDate] = useState(tomorrow);
  const [notes, setNotes] = useState('');

  const submit = async () => {
    setLoading(true);
    try {
      await requestsApi.create({
        preferredDate: preferredDate.toISOString(),
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

      <DateTimeField label="Preferred Date & Time" value={preferredDate} onChange={setPreferredDate} />

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
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  dateBtn: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dateBtnText: { fontSize: 15, color: '#1e3a5f', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  doneBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
