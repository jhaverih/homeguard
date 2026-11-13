import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView, Text, TextInput, View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Linking, KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi, API_URL, ServiceOption, VendorLicense } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import {
  LICENSE_LABEL, LockedNotice, PrimaryButton, ReviewerNote, Section, ui,
} from '../../src/components/onboarding/OnboardingUI';
import { LicenseUpload } from '../../src/components/onboarding/LicenseUpload';
import { ExpiryText, formatDay, LICENSE_STATUS, LicenseStatusBadge } from '../../src/components/onboarding/LicenseStatus';
import { colors } from '../../src/theme';

// Training links in the catalog are site-relative (/training/...), served by
// the same host as the API.
const trainingUrl = (url: string) => (url.startsWith('http') ? url : `${API_URL.replace(/\/api\/?$/, '')}${url}`);

export default function ServicesScreen() {
  const { app, setApp, loading, reload, item } = useVendorApplication();
  const [options, setOptions] = useState<ServiceOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const opts = await onboardingApi.getServiceOptions();
      setOptions(opts);
      setSelected((prev) => (dirty ? prev : new Set(opts.filter((o) => o.selected).map((o) => o.id))));
    } catch (e: any) {
      Alert.alert('Could not load services', e.message);
    } finally {
      setOptionsLoaded(true);
    }
  }, [dirty]);

  useFocusEffect(useCallback(() => { loadOptions(); }, [loadOptions]));

  // While the AI is still reading a license, check back every 10 seconds so
  // the result appears without the contractor having to refresh.
  const reading = !!app?.licenses.some((l) => l.status === 'READING');
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => { reload(); }, 10_000);
    return () => clearInterval(timer);
  }, [reading, reload]);

  if (loading || !app || !optionsLoaded) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const servicesItem = item('services');
  const licensesItem = item('licenses');
  const editable = !!servicesItem?.editable || !!licensesItem?.editable;

  const toggle = (opt: ServiceOption) => {
    if (!editable) return;
    const next = new Set(selected);
    if (next.has(opt.id)) { next.delete(opt.id); setSelected(next); setDirty(true); return; }
    if (opt.requiresAcknowledgment && !opt.acknowledged) {
      Alert.alert(
        'Training required',
        `Read the training material for "${opt.name}" before offering it.`,
        [
          { text: 'Cancel', style: 'cancel' },
          ...(opt.trainingDocumentUrl ? [{ text: 'Open training', onPress: () => Linking.openURL(trainingUrl(opt.trainingDocumentUrl!)) }] : []),
          {
            text: 'I have read it',
            onPress: async () => {
              try {
                await onboardingApi.acknowledgeService(opt.id);
                setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, acknowledged: true } : o)));
                next.add(opt.id);
                setSelected(new Set(next));
                setDirty(true);
              } catch (e: any) {
                Alert.alert('Error', e.message);
              }
            },
          },
        ],
      );
      return;
    }
    next.add(opt.id);
    setSelected(next);
    setDirty(true);
  };

  const save = async () => {
    if (!selected.size) { Alert.alert('Choose a service', 'Select at least one service you offer.'); return; }
    setSaving(true);
    try {
      setApp(await onboardingApi.setServices([...selected]));
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeLicense = (id: string) => {
    Alert.alert('Remove license?', 'You can add it again afterwards.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { setApp(await onboardingApi.removeLicense(id)); } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  // License types the saved selection needs that aren't on file yet.
  const now = Date.now();
  const neededTypes = [...new Set(app.services.map((s) => s.requiredCertificationType).filter((t) => t !== 'NONE'))];
  // A trade is covered while its license is being read or checked, or once it
  // has a current expiry date; rejected and expired ones don't count.
  const covers = (l: VendorLicense) => l.status === 'READING' || l.status === 'NEEDS_REVIEW'
    || (l.status !== 'REJECTED' && l.status !== 'EXPIRED' && !!l.expirationDate && new Date(l.expirationDate).getTime() > now);
  const coveredTypes = new Set(app.licenses.filter(covers).map((l) => l.certificationType));
  const missingTypes = neededTypes.filter((t) => !coveredTypes.has(t));

  const general = options.filter((o) => o.requiredCertificationType === 'NONE');
  const trades = options.filter((o) => o.requiredCertificationType !== 'NONE');

  const renderOption = (opt: ServiceOption) => {
    const on = selected.has(opt.id);
    return (
      <TouchableOpacity key={opt.id} style={styles.option} onPress={() => toggle(opt)} disabled={!editable}>
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.lanternDeep : colors.steel} />
        <View style={{ flex: 1 }}>
          <Text style={styles.optionName}>{opt.name}</Text>
          {opt.requiredCertificationType !== 'NONE' && <Text style={styles.optionTag}>Needs a {LICENSE_LABEL[opt.requiredCertificationType] ?? opt.requiredCertificationType} license</Text>}
          {opt.requiresAcknowledgment && <Text style={styles.optionTag}>{opt.acknowledged ? 'Training read' : 'Training required'}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <ReviewerNote note={servicesItem?.reviewerNote ?? licensesItem?.reviewerNote} />
        {!editable && <LockedNotice />}

        <Section title="Services you offer" hint="Choose everything your company does. You'll only be offered jobs for these services.">
          {options.length === 0 && <Text style={ui.sectionHint}>No services are open for sign-up right now.</Text>}
          {general.map(renderOption)}
          {trades.length > 0 && <Text style={[ui.label, { marginTop: 12 }]}>Licensed trades</Text>}
          {trades.map(renderOption)}
          {editable && dirty && <PrimaryButton label="Save services" onPress={save} loading={saving} />}
        </Section>

        <Section title="Licenses" hint="Trade services need a current license in your company's name. Attenteve verifies each one.">
          {app.licenses.length === 0 && <Text style={ui.sectionHint}>No licenses added.</Text>}
          {app.licenses.map((l) => (
            <View key={l.id} style={styles.licenseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionName}>{LICENSE_LABEL[l.certificationType] ?? l.certificationType}</Text>
                <LicenseStatusBadge status={l.status} />
                {l.status === 'READING' ? (
                  <View style={styles.readingRow}>
                    <ActivityIndicator size="small" color={colors.lanternDeep} />
                    <Text style={styles.optionTag}>{LICENSE_STATUS.READING.hint}</Text>
                  </View>
                ) : (
                  <>
                    {/* What was read from the license (read-only; re-upload to change). */}
                    <Text style={styles.optionTag}>
                      {[l.issuingState, l.licenseNumber ? `#${l.licenseNumber}` : null].filter(Boolean).join(' · ') || 'License number not found'}
                    </Text>
                    {(l.holderName || l.businessName) && (
                      <Text style={styles.optionTag}>{[l.holderName, l.businessName].filter(Boolean).join(' · ')}</Text>
                    )}
                    {l.issueDate && <Text style={styles.optionTag}>Issued {formatDay(l.issueDate)}</Text>}
                    <ExpiryText date={l.expirationDate} status={l.status} />
                    <Text style={[styles.optionTag, (l.status === 'REJECTED' || l.status === 'EXPIRED') && { color: colors.danger }]}>
                      {l.status === 'REJECTED' && l.reviewNotes ? l.reviewNotes : LICENSE_STATUS[l.status]?.hint}
                    </Text>
                    {l.status === 'NEEDS_REVIEW' && l.reviewReasons.map((r) => (
                      <Text key={r} style={styles.reason}>• {r}</Text>
                    ))}
                  </>
                )}
                {l.documentUrl && <Text style={ui.link} onPress={() => Linking.openURL(l.documentUrl!)}>View document</Text>}
              </View>
              {licensesItem?.editable && l.status !== 'APPROVED' && (
                <TouchableOpacity onPress={() => removeLicense(l.id)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {licensesItem?.editable && !dirty && missingTypes.map((t) => (
            <LicenseUpload
              key={t}
              type={t}
              submit={async (documentKey) => { setApp(await onboardingApi.uploadLicense({ certificationType: t, documentKey })); }}
            />
          ))}
          {dirty && editable && <Text style={ui.sectionHint}>Save your services first. Any licenses they need will appear here.</Text>}
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionName: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  optionTag: { fontSize: 12, color: colors.steel, marginTop: 2 },
  licenseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  reason: { fontSize: 12, color: colors.warningText, marginTop: 2 },
});
