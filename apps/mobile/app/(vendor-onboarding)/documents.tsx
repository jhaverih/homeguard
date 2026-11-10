import { useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi, uploadsApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { pickDocument, PickedFile } from '../../src/utils/pickDocument';
import { FutureDateField, LockedNotice, PrimaryButton, ReviewerNote, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

function OnFile({ label, url }: { label: string; url: string | null }) {
  return (
    <View style={ui.onFile}>
      <Ionicons name="checkmark-circle" size={18} color="#059669" />
      <Text style={ui.onFileText}>{label}</Text>
      {url && <Text style={ui.link} onPress={() => Linking.openURL(url)}>View</Text>}
    </View>
  );
}

export default function DocumentsScreen() {
  const { app, setApp, loading, item } = useVendorApplication();
  const [savingReg, setSavingReg] = useState(false);
  const [coiFile, setCoiFile] = useState<PickedFile | null>(null);
  const [coiExpiry, setCoiExpiry] = useState<Date | null>(null);
  const [savingCoi, setSavingCoi] = useState(false);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const reg = item('stateRegistration');
  const ins = item('insurance');
  const docs = app.documents;

  // Uploaded and saved in one step, so a failure is reported right away and
  // nothing half-saved is left behind.
  const uploadRegistration = async () => {
    const file = await pickDocument('State Business Registration');
    if (!file) return;
    setSavingReg(true);
    try {
      const uploaded = await uploadsApi.uploadDocument(file.uri, 'vendor-applications', file.mimeType, file.name);
      setApp(await onboardingApi.updateDocuments({ stateRegistrationDocKey: uploaded.key }));
    } catch (e: any) {
      Alert.alert('Upload failed', `${e.message}\n\nYour registration was not saved. Please try again.`);
    } finally {
      setSavingReg(false);
    }
  };

  const saveInsurance = async () => {
    if (!coiExpiry) { Alert.alert('Expiry date needed', 'Enter the expiry date printed on the certificate.'); return; }
    if (!coiFile && !docs.coiOnFile) { Alert.alert('Certificate needed', 'Attach your certificate of insurance.'); return; }
    setSavingCoi(true);
    try {
      const coiDocumentKey = coiFile
        ? (await uploadsApi.uploadDocument(coiFile.uri, 'vendor-applications', coiFile.mimeType, coiFile.name)).key
        : undefined;
      setApp(await onboardingApi.updateDocuments({ coiDocumentKey, coiExpirationDate: coiExpiry.toISOString() }));
      setCoiFile(null);
      setCoiExpiry(null);
    } catch (e: any) {
      Alert.alert('Upload failed', `${e.message}\n\nYour insurance was not saved. Please try again.`);
    } finally {
      setSavingCoi(false);
    }
  };

  const daysLeft = docs.coiExpirationDate ? Math.ceil((new Date(docs.coiExpirationDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Section title="State business registration" hint="Your state's certificate of formation, business license or registration showing your company name. A photo or PDF works.">
        <ReviewerNote note={reg?.reviewerNote} />
        {docs.stateRegistrationOnFile && <OnFile label="Registration on file" url={docs.stateRegistrationUrl} />}
        {reg?.editable
          ? (
            <TouchableOpacity style={ui.secondaryBtn} onPress={uploadRegistration} disabled={savingReg}>
              {savingReg ? <ActivityIndicator color={colors.lanternDeep} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.lanternDeep} />}
              <Text style={ui.secondaryBtnText}>{docs.stateRegistrationOnFile ? 'Replace document' : 'Upload document'}</Text>
            </TouchableOpacity>
          )
          : <LockedNotice />}
      </Section>

      <Section title="Certificate of insurance" hint="Your general liability certificate of insurance (COI). It must be current, and its expiry date must match the certificate.">
        <ReviewerNote note={ins?.reviewerNote} />
        {docs.coiOnFile && (
          <OnFile
            label={`Insurance on file${docs.coiExpirationDate ? `, expires ${new Date(docs.coiExpirationDate).toLocaleDateString()}` : ''}`}
            url={docs.coiUrl}
          />
        )}
        {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
          <View style={ui.warnBox}>
            <Ionicons name="warning-outline" size={18} color="#92400e" />
            <Text style={ui.warnText}>Your insurance expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}. Upload the renewed certificate as soon as you have it.</Text>
          </View>
        )}
        {ins?.editable ? (
          <>
            <TouchableOpacity style={ui.secondaryBtn} onPress={async () => { const f = await pickDocument('Certificate of Insurance'); if (f) setCoiFile(f); }}>
              <Ionicons name={coiFile ? 'checkmark-circle' : 'attach'} size={18} color={colors.lanternDeep} />
              <Text style={ui.secondaryBtnText}>{coiFile ? `Attached: ${coiFile.name}` : docs.coiOnFile ? 'Attach a new certificate' : 'Attach certificate'}</Text>
            </TouchableOpacity>
            <Text style={ui.label}>Expiry date on the certificate</Text>
            <FutureDateField value={coiExpiry} onChange={setCoiExpiry} placeholder="Choose the expiry date" />
            <PrimaryButton label="Save insurance" onPress={saveInsurance} loading={savingCoi} disabled={!coiFile && !coiExpiry} />
          </>
        ) : <LockedNotice />}
      </Section>
    </ScrollView>
  );
}
