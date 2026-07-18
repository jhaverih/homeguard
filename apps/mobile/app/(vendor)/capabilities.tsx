import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { vendorApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const CERT_TYPE_LABEL: Record<string, string> = {
  HVAC: 'HVAC (Mechanical) license required',
  ELECTRICAL: 'Electrical license required',
  PLUMBING: 'Plumbing license required',
  ROOFING: 'Roofing license required',
  GENERAL_CONTRACTOR: 'General Contractor license required',
  NABCEP: 'NABCEP solar certification required',
};

export default function CapabilitiesScreen() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, mine]: any = await Promise.all([
        vendorApi.getCapabilities(),
        vendorApi.getMyCapabilities(),
      ]);
      setCatalog(all || []);
      // getMyCapabilities() returns resolved Capability entities (shaped
      // { id, name, ... }), not the raw selection join-rows — .capabilityId
      // doesn't exist on this shape and was always undefined, which
      // serialized to null and blew up the save's NOT NULL constraint
      // whenever the vendor already had any prior selection.
      setSelectedIds(new Set((mine || []).map((s: any) => s.id)));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (cap: any) => {
    const isSelected = selectedIds.has(cap.id);
    if (!isSelected && cap.requiresAcknowledgment && !cap.acknowledged) {
      Alert.alert(
        'Training required',
        'You need to review the training material before selecting this capability.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Training',
            onPress: async () => {
              if (cap.trainingDocumentUrl) {
                const base = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://192.168.86.29';
                await Linking.openURL(`${base}${cap.trainingDocumentUrl}`);
              }
              Alert.alert(
                'Confirm training reviewed',
                `Have you reviewed the training material for "${cap.name}"?`,
                [
                  { text: 'Not yet', style: 'cancel' },
                  {
                    text: 'Yes, acknowledge',
                    onPress: async () => {
                      try {
                        await vendorApi.acknowledgeCapability(cap.id);
                        setCatalog((prev) => prev.map((c) => (c.id === cap.id ? { ...c, acknowledged: true } : c)));
                        setSelectedIds((prev) => new Set(prev).add(cap.id));
                      } catch (e: any) {
                        Alert.alert('Error', e.message);
                      }
                    },
                  },
                ],
              );
            },
          },
        ],
      );
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cap.id)) next.delete(cap.id); else next.add(cap.id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await vendorApi.setMyCapabilities([...selectedIds]);
      Alert.alert('Saved', 'Your capabilities have been updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>My Capabilities</Text>
      <Text style={styles.subtitle}>Select the work you do. You'll be matched to jobs based on your selections.</Text>

      {catalog.map((cap) => {
        const isSelected = selectedIds.has(cap.id);
        const isLicensed = cap.requiredCertificationType && cap.requiredCertificationType !== 'NONE';
        return (
          <TouchableOpacity key={cap.id} style={styles.row} onPress={() => toggle(cap)}>
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={24}
              color={isSelected ? colors.lanternDeep : colors.steel}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.rowLabel}>{cap.name}</Text>
              {isLicensed && (
                <Text style={styles.rowSub}>{CERT_TYPE_LABEL[cap.requiredCertificationType] || 'License required'}</Text>
              )}
              {cap.requiresAcknowledgment && !cap.acknowledged && (
                <Text style={styles.rowTraining}>Training required before selecting</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveBtnText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  title: { fontSize: 22, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: '#b45309', marginTop: 2 },
  rowTraining: { fontSize: 12, color: '#635bff', marginTop: 2 },
  saveBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12, marginBottom: 24 },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
