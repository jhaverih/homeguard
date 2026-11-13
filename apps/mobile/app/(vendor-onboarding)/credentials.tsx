import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, Linking, TextInput, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi, uploadsApi, VendorCredentials } from '../../src/services/api';
import { pickDocument, PickedFile } from '../../src/utils/pickDocument';
import { FutureDateField, LICENSE_LABEL, PrimaryButton, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { LicenseUpload } from '../../src/components/onboarding/LicenseUpload';
import { ExpiryText, LICENSE_STATUS, LicenseStatusBadge } from '../../src/components/onboarding/LicenseStatus';
import { colors } from '../../src/theme';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

function ExpiryLine({ c }: { c: { expirationDate: string | null; daysLeft: number | null; expired: boolean; expiringSoon: boolean } }) {
  if (c.expired) {
    return (
      <View style={[ui.warnBox, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder }]}>
        <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
        <Text style={[ui.warnText, { color: colors.dangerText }]}>Expired {fmt(c.expirationDate)}. Upload the renewed one to get access back.</Text>
      </View>
    );
  }
  if (c.expiringSoon) {
    return (
      <View style={ui.warnBox}>
        <Ionicons name="warning-outline" size={18} color={colors.warningText} />
        <Text style={ui.warnText}>Expires {fmt(c.expirationDate)}, in {c.daysLeft} day{c.daysLeft === 1 ? '' : 's'}. Renew it before then to keep your access.</Text>
      </View>
    );
  }
  return <Text style={ui.label}>Current until {fmt(c.expirationDate)}</Text>;
}

// One renewal form: attach the renewed document and enter its new expiry date
// (plus, for a license, an optional new number).
function RenewForm({ title, withNumber, onSave }: {
  title: string;
  withNumber?: boolean;
  onSave: (file: PickedFile, expiry: Date, number: string) => Promise<void>;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!file) { Alert.alert('Document needed', 'Attach a photo or PDF of the renewed document.'); return; }
    if (!expiry) { Alert.alert('Expiry date needed', 'Enter the new expiry date printed on it.'); return; }
    setSaving(true);
    try {
      await onSave(file, expiry, number.trim());
      setFile(null); setExpiry(null); setNumber('');
    } catch (e: any) {
      Alert.alert('Upload failed', `${e.message}\n\nNothing was saved. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <TouchableOpacity style={ui.secondaryBtn} onPress={async () => { const f = await pickDocument(title); if (f) setFile(f); }}>
        <Ionicons name={file ? 'checkmark-circle' : 'attach'} size={18} color={colors.lanternDeep} />
        <Text style={ui.secondaryBtnText}>{file ? `Attached: ${file.name}` : 'Attach the renewed document'}</Text>
      </TouchableOpacity>
      {withNumber && (
        <>
          <Text style={ui.label}>New license number (leave blank if unchanged)</Text>
          <TextInput placeholderTextColor={colors.steel} style={ui.input} value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder="License number" />
        </>
      )}
      <Text style={ui.label}>New expiry date</Text>
      <FutureDateField value={expiry} onChange={setExpiry} placeholder="Choose the expiry date" />
      <PrimaryButton label="Submit renewal" onPress={save} loading={saving} disabled={!file || !expiry} />
    </View>
  );
}

// Shown in place of the vendor tabs while an approved company's insurance or
// the vendor's own trade license has expired ((vendor)/_layout and the API
// client's CREDENTIALS_EXPIRED handler send them here). Also reachable from
// the expiry reminder to renew early.
export default function CredentialsScreen() {
  const [creds, setCreds] = useState<VendorCredentials | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCreds(await onboardingApi.getCredentials());
    } catch (e: any) {
      Alert.alert('Could not load your credentials', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A renewed license is read by the AI in the background; check back every
  // 10 seconds until it's done, and tell the vendor when access comes back.
  const reading = !!creds?.licenses.some((l) => l.status === 'READING');
  const wasLocked = useRef<boolean | null>(null);
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => { load(); }, 10_000);
    return () => clearInterval(timer);
  }, [reading, load]);
  useEffect(() => {
    if (!creds) return;
    if (wasLocked.current && !creds.locked) {
      Alert.alert('Thanks, access restored', 'Your renewed license was read. Attenteve will verify it.', [
        { text: 'Continue', onPress: () => router.replace('/(vendor)') },
      ]);
    }
    wasLocked.current = creds.locked;
  }, [creds]);

  if (!creds) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const applied = (next: VendorCredentials) => {
    setCreds(next);
    if (!next.locked) {
      Alert.alert('Thanks, access restored', 'Your renewal was submitted. Attenteve will verify it.', [
        { text: 'Continue', onPress: () => router.replace('/(vendor)') },
      ]);
    }
  };

  const renewInsurance = async (file: PickedFile, expiry: Date) => {
    const { key } = await uploadsApi.uploadDocument(file.uri, 'vendor-applications', file.mimeType, file.name);
    applied(await onboardingApi.renewInsurance({ coiDocumentKey: key, coiExpirationDate: expiry.toISOString() }));
  };

  // The renewed license is read automatically; the screen updates when it's done.
  const renewLicense = (id: string) => async (documentKey: string) => {
    setCreds(await onboardingApi.renewLicenseUpload(id, documentKey));
  };

  const ins = creds.insurance;
  const insNeedsAction = ins.expired || ins.expiringSoon;
  // A trade with a renewal already being read or checked doesn't need another upload.
  const inProgress = creds.licenses.filter((l) => l.status === 'READING' || l.status === 'NEEDS_REVIEW');
  const renewingTypes = new Set(inProgress.map((l) => l.certificationType));
  const licenses = creds.licenses.filter((l) => (l.blocking || l.expiringSoon) && !inProgress.includes(l));
  const current = creds.licenses.filter((l) => !l.blocking && !l.expiringSoon && !l.expired && !inProgress.includes(l));

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {creds.locked ? (
        <>
          <Text style={ui.title}>Renew your credentials</Text>
          <Text style={ui.subtitle}>
            A credential below has expired, so jobs and customer details are locked. Upload the renewed document to get access back right away.
          </Text>
        </>
      ) : (
        <>
          <Text style={ui.title}>Your credentials</Text>
          <Text style={ui.subtitle}>Keep these current. You'll get reminder emails 60, 30 and 7 days before each one expires.</Text>
        </>
      )}

      <Section title="Certificate of insurance" hint="Your company's general liability certificate.">
        <ExpiryLine c={ins} />
        {ins.documentUrl && <Text style={ui.link} onPress={() => Linking.openURL(ins.documentUrl!)}>View current certificate</Text>}
        {insNeedsAction && (ins.canRenew
          ? <RenewForm title="Certificate of Insurance" onSave={renewInsurance} />
          : <Text style={ui.label}>Your company admin needs to upload the renewed certificate. Ask them to open the Attenteve app.</Text>)}
      </Section>

      {licenses.map((l) => (
        <Section key={l.id} title={LICENSE_LABEL[l.certificationType] ?? l.certificationType} hint={[l.issuingState, l.licenseNumber && `#${l.licenseNumber}`].filter(Boolean).join(' ')}>
          <ExpiryLine c={l} />
          {l.documentUrl && <Text style={ui.link} onPress={() => Linking.openURL(l.documentUrl!)}>View current license</Text>}
          {renewingTypes.has(l.certificationType)
            ? <Text style={[ui.label, { marginTop: 6 }]}>Your renewed license is being checked (below).</Text>
            : <LicenseUpload type={l.certificationType} title="Upload your renewed license" submit={renewLicense(l.id)} />}
          <Text style={[ui.label, { marginTop: 6 }]}>Attenteve re-verifies a renewed license before matching you to jobs that need it.</Text>
        </Section>
      ))}

      {inProgress.length > 0 && (
        <Section title="Renewals being checked">
          {inProgress.map((l) => (
            <View key={l.id} style={{ marginBottom: 10 }}>
              <Text style={ui.label}>{LICENSE_LABEL[l.certificationType] ?? l.certificationType}</Text>
              <LicenseStatusBadge status={l.status} />
              {l.status === 'READING'
                ? <ActivityIndicator style={{ alignSelf: 'flex-start', marginTop: 6 }} color={colors.lanternDeep} />
                : <ExpiryText date={l.expirationDate} status={l.status} />}
              <Text style={ui.label}>{LICENSE_STATUS[l.status]?.hint}</Text>
              {l.reviewReasons?.map((r) => <Text key={r} style={[ui.label, { color: colors.warningText }]}>• {r}</Text>)}
            </View>
          ))}
        </Section>
      )}

      {current.length > 0 && (
        <Section title="Current licenses">
          {current.map((l) => (
            <View key={l.id} style={{ marginBottom: 10 }}>
              <Text style={ui.label}>
                {LICENSE_LABEL[l.certificationType] ?? l.certificationType}
                {[l.issuingState, l.licenseNumber && `#${l.licenseNumber}`].filter(Boolean).length ? ` · ${[l.issuingState, l.licenseNumber && `#${l.licenseNumber}`].filter(Boolean).join(' ')}` : ''}
              </Text>
              <LicenseStatusBadge status={l.status} />
              <ExpiryText date={l.expirationDate} status={l.status} />
            </View>
          ))}
        </Section>
      )}

      {!creds.locked && (
        <TouchableOpacity style={[ui.secondaryBtn, { marginTop: 8 }]} onPress={() => router.replace('/(vendor)')}>
          <Text style={ui.secondaryBtnText}>Back to dashboard</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
