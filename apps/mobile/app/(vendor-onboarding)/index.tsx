import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, RefreshControl, AppState,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi, userApi, VENDOR_TERMS_URL, ChecklistItem } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { useAuthStore } from '../../src/store/auth.store';
import { PrimaryButton, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

const ROUTE: Record<ChecklistItem['key'], string | null> = {
  company: '/(vendor-onboarding)/company',
  photo: '/(vendor-onboarding)/photo',
  services: '/(vendor-onboarding)/services',
  licenses: '/(vendor-onboarding)/services',
  counties: '/(vendor-onboarding)/area',
  stateRegistration: '/(vendor-onboarding)/documents',
  insurance: '/(vendor-onboarding)/documents',
  backgroundCheck: '/(vendor-onboarding)/background-check',
  terms: null, // accepted inline below
};

export default function VendorApplicationScreen() {
  const { app, setApp, loading, reload } = useVendorApplication();
  const { setUser } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Approved → (vendor)/_layout, which sends the vendor to Stripe payout setup
  // when it isn't finished yet.
  useEffect(() => {
    if (app?.applicationStatus === 'APPROVED') router.replace('/(vendor)');
  }, [app?.applicationStatus]);

  // A vendor waiting on Under Review usually leaves the app; check again when
  // they come back so an approval moves them on without a manual refresh.
  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (prev.match(/inactive|background/) && next === 'active') reload();
      prev = next;
    });
    return () => sub.remove();
  }, [reload]);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const status = app.applicationStatus;
  const { items, completeCount, totalCount, canSubmit } = app.checklist;
  const editing = status === 'INCOMPLETE' || status === 'NEEDS_INFO';

  const acceptTerms = () => {
    Alert.alert('Vendor Terms', 'Read the Attenteve Vendor Terms and Conditions, then accept them to continue.', [
      { text: 'Read terms', onPress: () => Linking.openURL(VENDOR_TERMS_URL) },
      {
        text: 'I accept',
        onPress: async () => {
          try {
            setUser(await userApi.acceptTerms('VENDOR') as any);
            reload();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openItem = (item: ChecklistItem) => {
    if (item.key === 'terms') { if (!item.complete) acceptTerms(); return; }
    const route = ROUTE[item.key];
    if (route) router.push(route as any);
  };

  const submit = () => {
    Alert.alert(
      status === 'NEEDS_INFO' ? 'Resubmit for review?' : 'Submit for review?',
      'You won\'t be able to change your application while Attenteve reviews it. We\'ll notify you when there\'s a decision.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              setApp(await onboardingApi.submit());
            } catch (e: any) {
              Alert.alert('Not ready yet', e.message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  // Under review / rejected: status only, plus a read-only copy of what was sent.
  if (!editing) {
    const rejected = status === 'REJECTED';
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
        <View style={[styles.hero, rejected ? styles.heroRejected : styles.heroReview]}>
          <Ionicons name={rejected ? 'close-circle' : 'hourglass-outline'} size={44} color={rejected ? '#b91c1c' : colors.lanternDeep} />
          <Text style={styles.heroTitle}>{rejected ? 'Application not approved' : 'Your application is under review'}</Text>
          <Text style={styles.heroText}>
            {rejected
              ? 'Attenteve was not able to approve your company at this time.'
              : `Submitted ${app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : ''}. We'll notify you as soon as there's a decision. Most reviews take one to three business days.`}
          </Text>
          {rejected && app.reviewNotes && <Text style={styles.heroNote}>{app.reviewNotes}</Text>}
        </View>
        <TouchableOpacity style={ui.secondaryBtn} onPress={() => router.push('/(vendor-onboarding)/submission')}>
          <Ionicons name="document-text-outline" size={18} color={colors.lanternDeep} />
          <Text style={ui.secondaryBtnText}>View what you submitted</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const needsInfo = status === 'NEEDS_INFO';
  const ordered = needsInfo
    ? [...items.filter((i) => i.editable), ...items.filter((i) => !i.editable)]
    : items;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
      <Text style={ui.title}>{needsInfo ? 'A few things to update' : 'Finish your application'}</Text>
      <Text style={ui.subtitle}>
        {needsInfo
          ? 'Our reviewer sent some items back. Update each one, then resubmit.'
          : 'Complete every item below, then submit your application. Attenteve reviews each company before it can see or accept jobs.'}
      </Text>

      {needsInfo && app.reviewNotes && (
        <View style={ui.noteBox}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color="#1d4ed8" />
          <Text style={[ui.noteText, { flex: 1 }]}>{app.reviewNotes}</Text>
        </View>
      )}

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{completeCount} of {totalCount} complete</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(completeCount / totalCount) * 100}%` }]} />
      </View>

      <View style={styles.list}>
        {ordered.map((item, idx) => {
          const tappable = item.editable && (item.key !== 'terms' || !item.complete);
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, idx > 0 && styles.rowBorder, !item.editable && styles.rowLocked]}
              onPress={() => openItem(item)}
              disabled={!tappable}
            >
              <Ionicons
                name={item.complete ? 'checkmark-circle' : item.reviewerNote ? 'alert-circle' : 'ellipse-outline'}
                size={24}
                color={item.complete ? '#059669' : item.reviewerNote ? '#2563eb' : colors.steel}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.reviewerNote && !item.complete && <Text style={styles.rowNote}>Reviewer: {item.reviewerNote}</Text>}
                {!item.complete && item.missing && <Text style={styles.rowMissing}>{item.missing}</Text>}
              </View>
              {tappable && <Ionicons name="chevron-forward" size={18} color={colors.steel} />}
              {!item.editable && <Ionicons name="lock-closed-outline" size={16} color={colors.steel} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <PrimaryButton
        label={needsInfo ? 'Resubmit for Review' : 'Submit for Review'}
        onPress={submit}
        loading={submitting}
        disabled={!canSubmit}
      />
      {!canSubmit && <Text style={styles.submitHint}>Finish every item above to submit.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1 },
  heroReview: { backgroundColor: colors.mist, borderColor: colors.border },
  heroRejected: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: 10, marginBottom: 8 },
  heroText: { fontSize: 14, color: colors.steel, textAlign: 'center', lineHeight: 20 },
  heroNote: { fontSize: 14, color: '#7f1d1d', textAlign: 'center', lineHeight: 20, marginTop: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: 8, backgroundColor: colors.lantern },
  list: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLocked: { opacity: 0.6 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowNote: { fontSize: 13, color: '#1d4ed8', marginTop: 3, lineHeight: 18 },
  rowMissing: { fontSize: 13, color: colors.steel, marginTop: 3, lineHeight: 18 },
  submitHint: { fontSize: 12, color: colors.steel, textAlign: 'center', marginTop: 8 },
});
