import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View, Alert, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { AddressPicker } from '../../src/components/AddressPicker';
import { LockedNotice, PrimaryButton, ReviewerNote, Section, StatePicker, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

const formatEin = (text: string) => {
  const clean = text.replace(/[^\d]/g, '');
  return clean.length <= 2 ? clean : `${clean.slice(0, 2)}-${clean.slice(2, 9)}`;
};

export default function CompanyDetailsScreen() {
  const { app, loading, item } = useVendorApplication();
  const [form, setForm] = useState({ name: '', ein: '', address: '', city: '', state: '', zipCode: '' });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!app || loaded) return;
    const c = app.company;
    setForm({ name: c.name ?? '', ein: c.ein ?? '', address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', zipCode: c.zipCode ?? '' });
    setLoaded(true);
  }, [app, loaded]);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const status = item('company');
  const editable = !!status?.editable;
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Enter your company name.'); return; }
    if (!/^\d{2}-\d{7}$/.test(form.ein)) { Alert.alert('Check your EIN', 'Your EIN should look like 12-3456789.'); return; }
    if (!form.address.trim() || !form.city.trim() || !form.state || !/^\d{5}$/.test(form.zipCode)) {
      Alert.alert('Address required', 'Enter your full business address, including a 5-digit ZIP code.');
      return;
    }
    setSaving(true);
    try {
      await onboardingApi.updateCompany(form);
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
        {!editable && <LockedNotice />}

        <Section title="Company">
          <Text style={ui.label}>Legal business name</Text>
          <TextInput style={ui.textInput} value={form.name} onChangeText={set('name')} editable={editable} placeholder="Company name" placeholderTextColor={colors.steel} />
          <Text style={ui.label}>EIN</Text>
          <TextInput
            style={ui.textInput} value={form.ein} onChangeText={(t) => set('ein')(formatEin(t))} editable={editable}
            placeholder="12-3456789" placeholderTextColor={colors.steel} keyboardType="numbers-and-punctuation" maxLength={10}
          />
        </Section>

        <Section title="Business address" hint="Where your business is registered. It's shown to Attenteve reviewers, not to customers.">
          {editable && (
            <AddressPicker
              placeholder="Search your business address..."
              validated={false}
              onClear={() => {}}
              onSelect={(a) => setForm((f) => ({ ...f, address: a.address, city: a.city || f.city, state: a.state || f.state, zipCode: a.zipCode || f.zipCode }))}
            />
          )}
          <Text style={ui.label}>Street</Text>
          <TextInput style={ui.textInput} value={form.address} onChangeText={set('address')} editable={editable} placeholder="Street address" placeholderTextColor={colors.steel} />
          <Text style={ui.label}>City</Text>
          <TextInput style={ui.textInput} value={form.city} onChangeText={set('city')} editable={editable} placeholder="City" placeholderTextColor={colors.steel} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Text style={ui.label}>State</Text>
              {editable ? <StatePicker value={form.state} onChange={set('state')} /> : <TextInput style={ui.textInput} value={form.state} editable={false} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>ZIP</Text>
              <TextInput style={ui.textInput} value={form.zipCode} onChangeText={set('zipCode')} editable={editable} keyboardType="number-pad" maxLength={5} placeholder="ZIP" placeholderTextColor={colors.steel} />
            </View>
          </View>
        </Section>

        {editable && <PrimaryButton label="Save" onPress={save} loading={saving} />}
        {status?.complete && !editable && (
          <View style={[ui.onFile, { marginTop: 4 }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={ui.onFileText}>Company details complete</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
