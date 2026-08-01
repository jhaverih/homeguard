import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Modal, Platform, TextInput,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, paymentsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

function DateTimeField({
  label, value, onChange, accentColor = colors.lanternDeep,
}: { label: string; value: Date; onChange: (d: Date) => void; accentColor?: string }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={[styles.pickerLabel, { color: accentColor }]}>{label}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{formatted}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker
            value={value}
            mode="date"
            minimumDate={new Date()}
            onChange={(_, d) => {
              setShowDate(false);
              if (d) { setTempDate(d); setShowTime(true); }
            }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate}
            mode="time"
            onChange={(_, d) => {
              setShowTime(false);
              if (d) onChange(d);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.pickerLabel, { color: accentColor }]}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.iosOverlay}>
          <View style={styles.iosPickerCard}>
            <RNDateTimePicker
              value={value}
              mode="datetime"
              minimumDate={new Date()}
              display="inline"
              onChange={(_, d) => { if (d) onChange(d); }}
              style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity
              style={[styles.iosDoneBtn, { backgroundColor: accentColor }]}
              onPress={() => setShowDate(false)}
            >
              <Text style={styles.iosDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type ViewKey = 'open' | 'rejected';

export default function OpenRequestsScreen() {
  const [view, setView] = useState<ViewKey>('open');
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeReady, setStripeReady] = useState(true);
  const [acceptModal, setAcceptModal] = useState<{ visible: boolean; requestId: string; bookingGroupId: string | null; requestIds: string[] | null; preferredDate: Date | null }>({ visible: false, requestId: '', bookingGroupId: null, requestIds: null, preferredDate: null });
  const [vendorNotes, setVendorNotes] = useState('');

  // Ad-hoc multi-select: lets a vendor pick several separate tickets from
  // ONE homeowner (regardless of whether they already share a bookingGroupId
  // from the customer's own submission) and accept them together as one
  // bundled visit — see acceptSelected() below. Mirrors the Set<string>
  // checkbox pattern already used in app/(vendor)/capabilities.tsx.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const requests = view === 'open' ? openRequests : rejectedRequests;

  // Groups requests that came from the same multi-service customer
  // submission (shared bookingGroupId) so they can be claimed together —
  // ungrouped requests (bookingGroupId null) each stay their own group of 1.
  // Secondarily ordered by customerId so one homeowner's cards sit together,
  // making it easy to spot every open ticket for one house.
  const grouped = (() => {
    const order: string[] = [];
    const map = new Map<string, any[]>();
    for (const req of requests) {
      const key = req.bookingGroupId || req.id;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(req);
    }
    const groups = order.map((key) => ({ key, bookingGroupId: map.get(key)![0].bookingGroupId || null, items: map.get(key)! }));
    return groups.sort((a, b) => (a.items[0].customerId || '').localeCompare(b.items[0].customerId || ''));
  })();

  const customerName = (req: any) =>
    req.customer?.customerProfile?.fullName || req.customer?.name || 'Customer';

  // The homeowner of the first selected card — once set, cards from a
  // different homeowner are disabled in the UI (the backend enforces this
  // too, but disabling client-side avoids a doomed submission).
  const selectedCustomerId = (() => {
    for (const req of requests) if (selectedIds.has(req.id)) return req.customerId;
    return null;
  })();

  const toggleSelected = (req: any) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(req.id)) { next.delete(req.id); return next; }
      if (selectedCustomerId && req.customerId !== selectedCustomerId) return prev; // different homeowner — ignore
      next.add(req.id);
      return next;
    });
  };

  const acceptSelected = () => {
    if (selectedIds.size < 2) return;
    const ids = [...selectedIds];
    const members = requests.filter((r) => ids.includes(r.id));
    const preferred = members[0]?.preferredDate ? new Date(members[0].preferredDate) : null;
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(9, 0, 0, 0);
    setScheduledDate(preferred && preferred > new Date() ? preferred : fallback);
    setAcceptModal({ visible: true, requestId: '', bookingGroupId: null, requestIds: ids, preferredDate: preferred });
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [scheduledDate, setScheduledDate] = useState(tomorrow);

  const sortByCreatedDesc = (data: any[]) =>
    (data || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const load = async () => {
    try {
      const [stripeStatus, pending, rejected]: any = await Promise.all([
        paymentsApi.getVendorStripeStatus(),
        requestsApi.getPending(),
        requestsApi.getRejected(),
      ]);
      const onboardingComplete = !!stripeStatus?.onboardingComplete;
      setStripeReady(onboardingComplete);
      setOpenRequests(onboardingComplete ? sortByCreatedDesc(pending) : []);
      setRejectedRequests(onboardingComplete ? sortByCreatedDesc(rejected) : []);
    } catch {
      setOpenRequests([]);
      setRejectedRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const rejectJob = (requestId: string) => {
    Alert.alert(
      'Reject this job?',
      "It'll move to your Rejected tab — you can still accept it later if no one else has.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestsApi.reject(requestId);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  const acceptJob = async () => {
    try {
      if (acceptModal.requestIds) {
        await requestsApi.acceptBundle(acceptModal.requestIds, scheduledDate.toISOString(), vendorNotes.trim() || undefined);
      } else if (acceptModal.bookingGroupId) {
        await requestsApi.acceptGroup(acceptModal.bookingGroupId, scheduledDate.toISOString(), vendorNotes.trim() || undefined);
      } else {
        await requestsApi.accept(acceptModal.requestId, scheduledDate.toISOString(), vendorNotes.trim() || undefined);
      }
      const preferred = acceptModal.preferredDate;
      const diffMs = preferred ? Math.abs(scheduledDate.getTime() - preferred.getTime()) : Infinity;
      const sameTime = diffMs < 5 * 60 * 1000;
      setAcceptModal({ visible: false, requestId: '', bookingGroupId: null, requestIds: null, preferredDate: null });
      setVendorNotes('');
      setSelectMode(false);
      setSelectedIds(new Set());
      Alert.alert(
        sameTime ? 'Job Confirmed!' : 'Time Proposed!',
        sameTime
          ? 'The job is locked in. Get ready for your inspection!'
          : 'Your proposed time has been sent to the customer. The job will be confirmed once they accept.',
      );
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  if (!stripeReady) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedCard}>
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={36} color="#635bff" />
          </View>
          <Text style={styles.lockedTitle}>Stripe Setup Required</Text>
          <Text style={styles.lockedBody}>
            You need to connect your Stripe account before you can receive leads and accept jobs.
            This protects both you and your customers.
          </Text>
          <TouchableOpacity
            style={styles.lockedBtn}
            onPress={() => router.push('/(vendor)/profile')}
          >
            <Ionicons name="card-outline" size={18} color="#fff" />
            <Text style={styles.lockedBtnText}>Set Up Stripe in Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16 }}>
        <Text style={[styles.pageTitle, { margin: 0 }]}>Open Requests</Text>
        {view === 'open' && requests.length > 1 && (
          <TouchableOpacity
            onPress={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
            style={styles.selectToggle}
          >
            <Text style={styles.selectToggleText}>{selectMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.subtitle}>
        {selectMode
          ? 'Pick several tickets from the same homeowner to accept as one bundled visit.'
          : 'Accept a request to get started. First to accept wins the job.'}
      </Text>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, view === 'open' && styles.filterChipActive]}
          onPress={() => setView('open')}
        >
          <Text style={[styles.filterChipText, view === 'open' && styles.filterChipTextActive]}>
            Open ({openRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, view === 'rejected' && styles.filterChipActive]}
          onPress={() => setView('rejected')}
        >
          <Text style={[styles.filterChipText, view === 'rejected' && styles.filterChipTextActive]}>
            Rejected ({rejectedRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {view === 'open'
              ? 'No open requests right now. Check back soon!'
              : "You haven't rejected any jobs. Rejected jobs you can still claim will show up here."}
          </Text>
        </View>
      ) : (
        grouped.map((group) => {
          if (group.items.length === 1) {
            const req = group.items[0];
            const disabled = selectMode && selectedCustomerId != null && req.customerId !== selectedCustomerId;
            const selected = selectedIds.has(req.id);
            return (
              <TouchableOpacity
                key={req.id}
                activeOpacity={selectMode ? 0.7 : 1}
                disabled={!selectMode || disabled}
                onPress={() => toggleSelected(req)}
                style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }, req.type === 'ADDITIONAL_SERVICE' ? { backgroundColor: '#f0effe' } : { backgroundColor: colors.mist }]}>
                    <Text style={[{ fontSize: 11, fontWeight: '700' }, req.type === 'ADDITIONAL_SERVICE' ? { color: '#635bff' } : { color: colors.lanternDeep }]}>
                      {req.type === 'ADDITIONAL_SERVICE' ? 'Service' : 'Inspection'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {req.ticketNumber && <Text style={{ fontSize: 11, color: colors.steel }}>{req.ticketNumber}</Text>}
                    {selectMode && (
                      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={disabled ? colors.border : colors.lanternDeep} />
                    )}
                  </View>
                </View>

                <Text style={styles.cardHomeowner}>{customerName(req)}</Text>

                {/* Service details for service requests */}
                {req.type === 'ADDITIONAL_SERVICE' && req.additionalServices?.length > 0 && (
                  <View style={styles.serviceDetailBox}>
                    {req.additionalServices.map((svc: any) => (
                      <View key={svc.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.serviceDetailName}>{svc.name}</Text>
                        <Text style={styles.serviceDetailPrice}>${parseFloat(svc.price).toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Inspection scope summary */}
                {req.type === 'SCHEDULED_INSPECTION' && (
                  <View style={styles.serviceDetailBox}>
                    <Text style={styles.serviceDetailName}>Full home inspection — HVAC, plumbing, water leak check &amp; bulb replacement</Text>
                  </View>
                )}

                <Text style={styles.cardDate}>Preferred: {new Date(req.preferredDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
                <Text style={styles.cardAddress}>{req.address}, {req.city}, {req.state} {req.zipCode}</Text>
                {req.customerNotes && <Text style={styles.cardNotes}>"{req.customerNotes}"</Text>}
                <Text style={styles.cardPosted}>Posted: {new Date(req.createdAt).toLocaleDateString()}</Text>
                {!selectMode && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {view === 'open' && (
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => rejectJob(req.id)}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.acceptBtn, { flex: 1 }]}
                      onPress={() => {
                        const preferred = req.preferredDate ? new Date(req.preferredDate) : null;
                        const fallback = new Date();
                        fallback.setDate(fallback.getDate() + 1);
                        fallback.setHours(9, 0, 0, 0);
                        setScheduledDate(preferred && preferred > new Date() ? preferred : fallback);
                        setAcceptModal({ visible: true, requestId: req.id, bookingGroupId: null, requestIds: null, preferredDate: preferred });
                      }}
                    >
                      <Text style={styles.acceptBtnText}>Accept This Job</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }

          // Bundle: multiple services from one customer submission this vendor
          // is eligible for — claim them all in one action.
          const first = group.items[0];
          return (
            <View key={group.key} style={[styles.card, styles.bundleCard]}>
              <View style={styles.bundleBadge}>
                <Text style={styles.bundleBadgeText}>🧰 {group.items.length} services — one visit</Text>
              </View>
              <Text style={styles.cardHomeowner}>{customerName(first)}</Text>
              <View style={styles.serviceDetailBox}>
                {group.items.map((req: any) => (
                  req.additionalServices?.map((svc: any) => (
                    <View key={svc.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.serviceDetailName}>{svc.name}</Text>
                      <Text style={styles.serviceDetailPrice}>${parseFloat(svc.price).toFixed(2)}</Text>
                    </View>
                  ))
                ))}
              </View>
              <Text style={styles.cardDate}>Preferred: {new Date(first.preferredDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
              <Text style={styles.cardAddress}>{first.address}, {first.city}, {first.state} {first.zipCode}</Text>
              <Text style={styles.cardPosted}>Posted: {new Date(first.createdAt).toLocaleDateString()}</Text>
              {!selectMode && (
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => {
                    const preferred = first.preferredDate ? new Date(first.preferredDate) : null;
                    const fallback = new Date();
                    fallback.setDate(fallback.getDate() + 1);
                    fallback.setHours(9, 0, 0, 0);
                    setScheduledDate(preferred && preferred > new Date() ? preferred : fallback);
                    setAcceptModal({ visible: true, requestId: '', bookingGroupId: group.bookingGroupId, requestIds: null, preferredDate: preferred });
                  }}
                >
                  <Text style={styles.acceptBtnText}>Accept All ({group.items.length})</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </ScrollView>

      {selectMode && selectedIds.size >= 2 && (
        <View style={styles.selectBar}>
          <TouchableOpacity style={styles.selectBarBtn} onPress={acceptSelected}>
            <Text style={styles.selectBarBtnText}>Accept Selected as One Visit ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={acceptModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Confirm Scheduled Date</Text>
            <Text style={styles.modalSubtitle}>Pre-filled with the customer's requested date. Change it if needed.</Text>
            <DateTimeField
              label="Inspection Date & Time"
              value={scheduledDate}
              onChange={setScheduledDate}
              accentColor={colors.lanternDeep}
            />
            <Text style={styles.modalSubtitle}>Notes for this job (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any notes about this job..."
              placeholderTextColor={colors.steel}
              value={vendorNotes}
              onChangeText={setVendorNotes}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={acceptJob}>
              <Text style={styles.confirmText}>Confirm & Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAcceptModal({ visible: false, requestId: '', bookingGroupId: null, requestIds: null, preferredDate: null }); setVendorNotes(''); }} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  lockedContainer: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockedCard: { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  lockedIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0effe', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  lockedTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 12 },
  lockedBody: { fontSize: 14, color: colors.steel, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  lockedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#635bff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  lockedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: colors.lanternDeep, margin: 16, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginHorizontal: 16, marginBottom: 16 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: colors.steel, textAlign: 'center' },
  card: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, marginBottom: 12 },
  cardDate: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  cardAddress: { fontSize: 14, color: colors.steel, marginBottom: 4 },
  cardNotes: { fontSize: 13, color: '#666', marginBottom: 4, fontStyle: 'italic' },
  serviceDetailBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  serviceDetailName: { fontSize: 13, color: colors.lanternDeep, fontWeight: '600', flex: 1 },
  serviceDetailPrice: { fontSize: 13, color: '#059669', fontWeight: '700' },
  cardPosted: { fontSize: 12, color: colors.steel, marginBottom: 12 },
  acceptBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center' },
  acceptBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, padding: 14, alignItems: 'center', paddingHorizontal: 18 },
  rejectBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
  bundleCard: { borderWidth: 1, borderColor: colors.lanternDeep },
  bundleBadge: { alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  bundleBadgeText: { color: colors.mist, fontSize: 12, fontWeight: '700' },
  cardHomeowner: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  cardSelected: { borderWidth: 2, borderColor: colors.lanternDeep, backgroundColor: '#f0fdf4' },
  cardDisabled: { opacity: 0.4 },
  selectToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: colors.mist },
  selectToggleText: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  selectBar: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  selectBarBtn: { backgroundColor: colors.lanternDeep, borderRadius: 12, padding: 16, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  selectBarBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.mist },
  filterChipActive: { backgroundColor: colors.lantern },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  filterChipTextActive: { color: colors.ink },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginBottom: 8 },
  modalSubtitle: { color: '#666', marginBottom: 8 },
  confirmBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel },
  notesInput: {
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.ink, minHeight: 72, textAlignVertical: 'top', marginBottom: 12,
  },
  fieldWrap: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  dateBtn: {
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dateBtnText: { fontSize: 15, color: colors.ink, fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  iosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  iosPickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosDoneBtn: { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  iosDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
