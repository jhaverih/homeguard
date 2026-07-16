import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TERMS_URL, VENDOR_TERMS_URL } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { colors } from '../theme';

export default function TermsGateModal({
  visible,
  termsType,
  onAccept,
  loading,
}: {
  visible: boolean;
  termsType: 'CUSTOMER' | 'VENDOR';
  onAccept: () => Promise<void>;
  loading: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const { logout } = useAuthStore();
  const url = termsType === 'VENDOR' ? VENDOR_TERMS_URL : TERMS_URL;
  const docLabel = termsType === 'VENDOR' ? 'Vendor Terms and Conditions' : 'Terms and Conditions';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons name="document-text-outline" size={36} color={colors.lanternDeep} style={{ marginBottom: 14 }} />
          <Text style={styles.title}>Updated Terms & Conditions</Text>
          <Text style={styles.body}>
            Please review and accept our {termsType === 'VENDOR' ? 'Vendor' : ''} Terms and Conditions to continue using Attenteve.
          </Text>

          <TouchableOpacity style={styles.checkRow} onPress={() => setChecked((v) => !v)} activeOpacity={0.7}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Ionicons name="checkmark" size={14} color={colors.ink} />}
            </View>
            <Text style={styles.checkText}>
              I have read and agree to the{' '}
              <Text style={styles.link} onPress={() => Linking.openURL(url)}>{docLabel}</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, !checked && styles.buttonDisabled]}
            onPress={onAccept}
            disabled={!checked || loading}
          >
            {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Accept & Continue</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutRow} onPress={() => logout()}>
            <Text style={styles.logoutText}>Not now — Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(18,24,28,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 20,
    padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: colors.steel, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', width: '100%', marginBottom: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginRight: 10, marginTop: 1,
    borderWidth: 1.5, borderColor: colors.steel, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  checkText: { flex: 1, fontSize: 13, color: colors.steel, lineHeight: 18 },
  link: { color: colors.lanternDeep, fontWeight: '600', textDecorationLine: 'underline' },
  button: {
    width: '100%', backgroundColor: colors.lantern, borderRadius: 14, padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  logoutRow: { marginTop: 14, padding: 6 },
  logoutText: { color: colors.steel, fontSize: 13 },
});
