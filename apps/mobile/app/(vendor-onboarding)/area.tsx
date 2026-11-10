import { useEffect, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { LockedNotice, PrimaryButton, ReviewerNote, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

export default function ServiceAreaScreen() {
  const { app, loading, item } = useVendorApplication();
  const [counties, setCounties] = useState<Record<string, { fips: string; name: string }[]> | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onboardingApi.getCountyOptions().then(setCounties).catch((e) => Alert.alert('Could not load counties', e.message));
  }, []);
  useEffect(() => {
    if (app && !selected) setSelected(new Set(app.serviceCounties));
  }, [app, selected]);

  if (loading || !app || !counties || !selected) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const status = item('counties');
  const editable = !!status?.editable;

  const toggle = (fips: string) => {
    if (!editable) return;
    const next = new Set(selected);
    if (next.has(fips)) next.delete(fips); else next.add(fips);
    setSelected(next);
  };

  const toggleState = (list: { fips: string }[]) => {
    if (!editable) return;
    const next = new Set(selected);
    const all = list.every((c) => next.has(c.fips));
    for (const c of list) { if (all) next.delete(c.fips); else next.add(c.fips); }
    setSelected(next);
  };

  const save = async () => {
    if (!selected.size) { Alert.alert('Choose a county', 'Select at least one county your company serves.'); return; }
    setSaving(true);
    try {
      await onboardingApi.setCounties([...selected]);
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <ReviewerNote note={status?.reviewerNote} />
      {!editable && <LockedNotice />}
      <Text style={ui.subtitle}>Select every county your team can travel to. Homeowners in these counties will be able to book your services. {selected.size} selected.</Text>

      {Object.keys(counties).length === 0 && <Text style={ui.sectionHint}>Attenteve isn't open in any state yet.</Text>}
      {Object.entries(counties).map(([state, list]) => (
        <Section key={state} title={state}>
          {editable && (
            <Text style={[ui.link, { marginBottom: 8 }]} onPress={() => toggleState(list)}>
              {list.every((c) => selected.has(c.fips)) ? 'Deselect all' : 'Select all'}
            </Text>
          )}
          <View style={styles.grid}>
            {list.map((c) => {
              const on = selected.has(c.fips);
              return (
                <TouchableOpacity key={c.fips} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(c.fips)} disabled={!editable}>
                  {on && <Ionicons name="checkmark" size={14} color={colors.lanternDeep} />}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>
      ))}

      {editable && <PrimaryButton label="Save service area" onPress={save} loading={saving} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  chipOn: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  chipText: { fontSize: 13, color: colors.steel },
  chipTextOn: { color: colors.lanternDeep, fontWeight: '700' },
});
