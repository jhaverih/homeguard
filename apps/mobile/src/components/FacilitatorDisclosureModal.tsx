import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Linking, ScrollView } from 'react-native';
import { TERMS_URL } from '../services/api';
import { colors } from '../theme';

// Shown once, at the moment a customer first submits a service request (see
// app/(customer)/request.tsx) — not at login/signup like TermsGateModal.
// Same centered-card-over-scrim chrome as TermsGateModal and request.tsx's
// own "Confirm Service Request" modal, for visual consistency with every
// other modal in this app (a full-screen takeover was considered, to match
// Uber's own presentation more literally, but would have been the only
// full-screen modal anywhere in the app).
export default function FacilitatorDisclosureModal({
  visible,
  onAccept,
  loading,
}: {
  visible: boolean;
  onAccept: () => Promise<void>;
  loading: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Image source={require('../../assets/images/facilitator-disclosure-vendor.jpg')} style={styles.image} />
            <Text style={styles.kicker}>Before you request service</Text>
            <Text style={styles.title}>
              Your agreement is with the vendor, not with Attent<Text style={styles.eve}>eve</Text>
            </Text>
            <Text style={styles.body}>
              Attenteve connects you with <Text style={styles.bold}>independent, vetted vendors</Text> for home services — we don't perform the work ourselves.
            </Text>
            <Text style={styles.body}>
              The service agreement for this job is between you and the vendor. Attenteve facilitates scheduling and payment, but is not a party to that agreement.
            </Text>
            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>Read the full Terms and Conditions</Text>
          </ScrollView>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onAccept} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Confirm</Text>}
          </TouchableOpacity>
          <Text style={styles.finePrint}>You'll only see this once.</Text>
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
    width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: colors.surface,
    borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  image: { width: '100%', height: 150, borderRadius: 14, marginBottom: 18 },
  kicker: {
    fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
    color: colors.lanternDeep, marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 14, lineHeight: 26 },
  eve: { color: colors.lanternDeep },
  body: { fontSize: 14, color: colors.steel, lineHeight: 21, marginBottom: 10 },
  bold: { color: colors.ink, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '700', color: colors.ink, textDecorationLine: 'underline', marginTop: 4, marginBottom: 4 },
  button: { width: '100%', backgroundColor: colors.lantern, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  finePrint: { textAlign: 'center', fontSize: 11.5, color: colors.steel, marginTop: 10 },
});
