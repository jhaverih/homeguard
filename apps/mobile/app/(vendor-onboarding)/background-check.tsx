import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { LockedNotice, PrimaryButton, ReviewerNote, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

export default function BackgroundCheckScreen() {
  const { app, loading, item } = useVendorApplication();
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (app?.backgroundCheck.signerName && !signerName) setSignerName(app.backgroundCheck.signerName);
    if (app?.backgroundCheck.signerTitle && !signerTitle) setSignerTitle(app.backgroundCheck.signerTitle);
  }, [app]);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const status = item('backgroundCheck');
  const bc = app.backgroundCheck;
  const signedCurrent = bc.signedVersion === bc.version;
  const editable = !!status?.editable;

  const sign = async () => {
    if (!agreed) { Alert.alert('Agreement needed', 'Tick the box to confirm you agree to the statement.'); return; }
    if (!signerName.trim() || !signerTitle.trim()) { Alert.alert('Signature needed', 'Type your full name and your title at the company.'); return; }
    setSaving(true);
    try {
      await onboardingApi.signBackgroundCheck({ signerName: signerName.trim(), signerTitle: signerTitle.trim(), agreed });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <ReviewerNote note={status?.reviewerNote} />
        <Section title={bc.title}>
          {bc.paragraphs.map((p, i) => <Text key={i} style={styles.paragraph}>{p}</Text>)}
        </Section>

        {signedCurrent && (
          <View style={ui.onFile}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={ui.onFileText}>
              Signed by {bc.signerName}, {bc.signerTitle}{bc.signedAt ? ` on ${new Date(bc.signedAt).toLocaleDateString()}` : ''}
            </Text>
          </View>
        )}

        {editable && (!signedCurrent || status?.reviewerNote) ? (
          <Section title="Sign for your company">
            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed((v) => !v)}>
              <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? colors.lanternDeep : colors.steel} />
              <Text style={styles.agreeText}>I have read this statement and agree to it on behalf of my company.</Text>
            </TouchableOpacity>
            <Text style={ui.label}>Full name</Text>
            <TextInput style={ui.textInput} value={signerName} onChangeText={setSignerName} placeholder="Your full legal name" placeholderTextColor={colors.steel} autoCapitalize="words" />
            <Text style={ui.label}>Title</Text>
            <TextInput style={ui.textInput} value={signerTitle} onChangeText={setSignerTitle} placeholder="e.g. Owner, President" placeholderTextColor={colors.steel} autoCapitalize="words" />
            <PrimaryButton label="Sign statement" onPress={sign} loading={saving} disabled={!agreed} />
          </Section>
        ) : !editable && <LockedNotice />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  paragraph: { fontSize: 14, color: colors.ink, lineHeight: 21, marginBottom: 10 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  agreeText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
});
