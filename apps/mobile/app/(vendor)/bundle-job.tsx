import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  ACCEPTED: { label: "I'm On My Way", next: 'VENDOR_EN_ROUTE', color: '#9f7aea' },
  VENDOR_EN_ROUTE: { label: 'I Have Arrived', next: 'IN_PROGRESS', color: '#f6ad55' },
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_CUSTOMER_REVIEW: '#b45309',
  ACCEPTED: '#4299e1',
  VENDOR_EN_ROUTE: '#9f7aea',
  IN_PROGRESS: '#f6ad55',
  COMPLETED: '#68d391',
  CANCELLED: '#fc8181',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_CUSTOMER_REVIEW: 'Awaiting Confirmation',
  ACCEPTED: 'Accepted',
  VENDOR_EN_ROUTE: 'En Route',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// Shared visit view for a bundle of ServiceRequests sharing one
// bookingGroupId (either the customer's own multi-select submission, or a
// vendor's "Accept Selected as One Visit"). "On My Way"/"Arrived" here
// advances every member together; each member's own checklist/photo/comment/
// Complete flow stays entirely on the existing, unmodified active-job.tsx —
// tapping into one below just navigates there like it always has.
export default function BundleJobScreen() {
  const { bookingGroupId } = useLocalSearchParams<{ bookingGroupId: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const all: any = await requestsApi.getVendorJobs();
    setMembers((all || []).filter((j: any) => j.bookingGroupId === bookingGroupId));
    setLoading(false);
  }, [bookingGroupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stopLocationReporting = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  };

  // Only one representative member needs its location pinged — every member
  // shares one customerId, so there's only one customer-facing tracking view
  // for the whole visit regardless of how many services are bundled.
  const reportLocationOnce = async (repId: string): Promise<boolean> => {
    try {
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
      await requestsApi.updateLocation(repId, l.coords.latitude, l.coords.longitude, l.coords.heading);
      return true;
    } catch (err: any) {
      console.warn('[bundle-job] location report failed:', err?.message ?? err);
      return false;
    }
  };

  const performAdvance = async (next: { next: string }) => {
    if (advancing || members.length === 0) return;
    setAdvancing(true);
    const repId = members[0].id;

    if (next.next === 'VENDOR_EN_ROUTE') {
      const existing = await Location.getForegroundPermissionsAsync();
      const { status, canAskAgain } = existing.status === 'granted' ? existing : await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Location Required',
            "Location access is required so the customer can see when you're on the way. Please enable it in Settings.",
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
          );
        } else {
          Alert.alert('Location Required', "Please allow location access so the customer can see when you're on the way.");
        }
        setAdvancing(false);
        return;
      }
      const firstOk = await reportLocationOnce(repId);
      if (!firstOk) {
        Alert.alert('Location Not Sent', "We couldn't get your current location — we'll keep trying automatically.");
      }
      if (!locationIntervalRef.current) {
        locationIntervalRef.current = setInterval(() => reportLocationOnce(repId), 90000);
      }
    }

    if (next.next === 'IN_PROGRESS') {
      stopLocationReporting();
    }

    try {
      await requestsApi.updateBundleStatus(bookingGroupId, next.next);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAdvancing(false);
    }
  };

  const advanceStatus = () => {
    if (members.length === 0) return;
    const commonStatus = members.every((m) => m.status === members[0].status) ? members[0].status : null;
    const next = commonStatus ? NEXT_STATUS[commonStatus] : null;
    if (!next) return;

    if (next.next === 'IN_PROGRESS') {
      Alert.alert(
        'Confirm Arrival',
        "Have you arrived at the customer's home?",
        [{ text: 'Not yet', style: 'cancel' }, { text: "Yes, I'm Here", onPress: () => performAdvance(next) }],
      );
      return;
    }
    performAdvance(next);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  if (members.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>This bundled visit is no longer available.</Text>
      </View>
    );
  }

  const first = members[0];
  const customerName = (first.customer?.firstName || first.customer?.lastName)
    ? `${first.customer?.firstName ?? ''} ${first.customer?.lastName ?? ''}`.trim()
    : 'Customer';
  const commonStatus = members.every((m) => m.status === members[0].status) ? members[0].status : null;
  const nextAction = commonStatus ? NEXT_STATUS[commonStatus] : null;
  const hasInProgress = members.some((m) => m.status === 'IN_PROGRESS');
  const allDone = members.every((m) => ['COMPLETED', 'CANCELLED'].includes(m.status));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.customerBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.customerLabel}>Bundled Visit — {members.length} services</Text>
        </View>
        <Text style={styles.customerName}>{customerName}</Text>
        <Text style={styles.customerAddress}>{first.address}</Text>
        <Text style={styles.customerCity}>{first.city}, {first.state} {first.zipCode}</Text>
      </View>

      {nextAction && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: advancing ? colors.steel : nextAction.color }]}
          onPress={advanceStatus}
          disabled={advancing}
        >
          {advancing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionBtnText}>{nextAction.label}</Text>}
        </TouchableOpacity>
      )}

      {!nextAction && !allDone && (
        <View style={styles.driftNotice}>
          <Ionicons name="information-circle-outline" size={18} color={colors.steel} />
          <Text style={styles.driftNoticeText}>
            These services are no longer all at the same stage — manage each one individually below.
          </Text>
        </View>
      )}

      {allDone && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>✓ Visit Complete</Text>
        </View>
      )}

      {hasInProgress && (
        <TouchableOpacity
          style={styles.closeAllBtn}
          onPress={() => router.push(`/(vendor)/bundle-close-all?bookingGroupId=${bookingGroupId}`)}
        >
          <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
          <Text style={styles.closeAllBtnText}> Close All Remaining</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Services in This Visit</Text>
      {members.map((m) => {
        const serviceName = m.type === 'ADDITIONAL_SERVICE' ? (m.additionalServices?.[0]?.name || 'Service Request') : 'Preventative Home Assessment';
        return (
          <TouchableOpacity key={m.id} style={styles.memberCard} onPress={() => router.push(`/(vendor)/active-job?id=${m.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{serviceName}</Text>
              {m.ticketNumber && <Text style={styles.memberTicket}>{m.ticketNumber}</Text>}
            </View>
            <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[m.status] || colors.steel) + '20' }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLOR[m.status] || colors.steel }]}>
                {STATUS_LABEL[m.status] || m.status.replace(/_/g, ' ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.steel} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: colors.steel, textAlign: 'center' },
  customerBox: { backgroundColor: colors.ink, borderRadius: 16, padding: 20, marginBottom: 12 },
  customerLabel: { fontSize: 12, color: '#a8d5a2', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  customerName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  customerAddress: { fontSize: 14, color: '#e2e8f0' },
  customerCity: { fontSize: 14, color: '#e2e8f0' },
  actionBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  driftNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  driftNoticeText: { flex: 1, fontSize: 13, color: colors.steel },
  completedBadge: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  completedText: { color: '#15803d', fontWeight: '700', fontSize: 15 },
  closeAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lanternDeep, borderRadius: 14, padding: 16, marginBottom: 16 },
  closeAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  memberName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  memberTicket: { fontSize: 11, color: colors.steel, fontFamily: 'monospace', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
