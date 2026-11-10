import { ScrollView, Text, View, Image, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { LICENSE_LABEL, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

// Read-only copy of what the company submitted — all a vendor sees of their
// application while it's under review or after a rejection.
export default function SubmissionScreen() {
  const { app, loading } = useVendorApplication();
  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const c = app.company;
  const d = app.documents;
  const bc = app.backgroundCheck;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Section title="Company">
        <Row label="Name" value={c.name} />
        <Row label="EIN" value={c.ein} />
        <Row label="Address" value={[c.address, c.city, [c.state, c.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
      </Section>

      <Section title="Profile photo">
        {app.photoUrl ? <Image source={{ uri: app.photoUrl }} style={styles.photo} /> : <Text style={ui.sectionHint}>No photo</Text>}
      </Section>

      <Section title="Services">
        {app.services.map((s) => <Text key={s.id} style={styles.listItem}>• {s.name}</Text>)}
      </Section>

      {app.licenses.length > 0 && (
        <Section title="Licenses">
          {app.licenses.map((l) => (
            <Text key={l.id} style={styles.listItem}>
              • {LICENSE_LABEL[l.certificationType] ?? l.certificationType}, {l.issuingState} #{l.licenseNumber}, expires {new Date(l.expirationDate).toLocaleDateString()}
            </Text>
          ))}
        </Section>
      )}

      <Section title="Service area">
        <Text style={styles.listItem}>{app.serviceCounties.length} {app.serviceCounties.length === 1 ? 'county' : 'counties'}</Text>
      </Section>

      <Section title="Documents">
        <Row label="State registration" value={d.stateRegistrationOnFile ? 'On file' : null} />
        {d.stateRegistrationUrl && <Text style={ui.link} onPress={() => Linking.openURL(d.stateRegistrationUrl!)}>View registration</Text>}
        <Row label="Insurance" value={d.coiExpirationDate ? `Expires ${new Date(d.coiExpirationDate).toLocaleDateString()}` : null} />
        {d.coiUrl && <Text style={ui.link} onPress={() => Linking.openURL(d.coiUrl!)}>View certificate</Text>}
      </Section>

      <Section title="Background check statement">
        <Row label="Signed by" value={bc.signerName ? `${bc.signerName}, ${bc.signerTitle}` : null} />
        <Row label="Date" value={bc.signedAt ? new Date(bc.signedAt).toLocaleDateString() : null} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: colors.steel },
  rowValue: { fontSize: 13, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listItem: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  photo: { width: 96, height: 96, borderRadius: 48 },
});
