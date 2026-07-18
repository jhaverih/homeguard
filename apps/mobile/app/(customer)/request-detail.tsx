import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, userApi, reviewsApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { formatRelativeAge } from '../../src/utils/datetime';
import { colors } from '../../src/theme';
import CancellationFeedbackModal from '../../src/components/CancellationFeedbackModal';

import { TextInput } from 'react-native';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:                  { color: '#6b7280', bg: '#f9fafb', label: 'Pending' },
  PENDING_CUSTOMER_REVIEW:  { color: '#b45309', bg: '#fffbeb', label: 'Action Required' },
  ACCEPTED:                 { color: '#2563eb', bg: '#eff6ff', label: 'Scheduled' },
  VENDOR_EN_ROUTE:          { color: '#d97706', bg: '#fffbeb', label: 'Vendor en route' },
  IN_PROGRESS:              { color: '#7c3aed', bg: '#f5f3ff', label: 'In progress' },
  COMPLETED:                { color: '#059669', bg: '#ecfdf5', label: 'Completed' },
  CANCELLED:                { color: '#dc2626', bg: '#fef2f2', label: 'Cancelled' },
};

function DateTimeField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <RNDateTimePicker
              value={value}
              mode="datetime"
              minimumDate={new Date()}
              display="inline"
              onChange={(_, d) => { if (d) onChange(d); }}
              style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [profileAddress, setProfileAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date());
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [solarQuote, setSolarQuote] = useState<any>(null);
  const [solarConsultation, setSolarConsultation] = useState<any>(null);
  const [showConsultationPicker, setShowConsultationPicker] = useState(false);
  const [consultationDate, setConsultationDate] = useState(new Date());
  const [consultationBusy, setConsultationBusy] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showCancelFeedback, setShowCancelFeedback] = useState(false);

  const load = useCallback(async () => {
    try {
      const [req, me]: any[] = await Promise.all([
        requestsApi.getOneWithPhotos(id),
        userApi.getMe().catch(() => null),
      ]);
      setRequest(req);
      if (me?.customerProfile) setProfileAddress(me.customerProfile);
      try {
        const n: any = await inspectionsApi.getNotes(id);
        setNotes(n || []);
      } catch {
        setNotes([]);
      }
      try {
        const rv: any = await reviewsApi.getMyReview(id);
        setExistingReview(rv);
      } catch {
        setExistingReview(null);
      }
      if (req?.type === 'ADDITIONAL_SERVICE') {
        const svcName = (req.additionalServices?.[0]?.name || '').toLowerCase();
        if (svcName.includes('solar')) {
          try {
            const [sq, sc]: any[] = await Promise.all([
              requestsApi.getSolarQuote(id).catch(() => null),
              requestsApi.getSolarConsultation(id).catch(() => null),
            ]);
            setSolarQuote(sq);
            setSolarConsultation(sc);
          } catch {
            setSolarQuote(null);
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not load this request.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ETA is computed server-side from the vendor's live location to the
  // service address's ZIP centroid (see ServiceRequest.etaMinutes) — not the
  // customer's own device location, which isn't a meaningful reference point
  // since the customer may not be physically at the property.
  const etaMinutes: number | null = request?.etaMinutes ?? null;

  const [scheduleBusy, setScheduleBusy] = useState(false);

  const confirmSchedule = async () => {
    setScheduleBusy(true);
    try {
      await requestsApi.confirmSchedule(id);
      Alert.alert('Confirmed', 'The inspection time has been confirmed.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setScheduleBusy(false);
    }
  };

  const declineSchedule = async () => {
    Alert.alert(
      'Decline Proposed Time',
      'The request will go back to the vendor pool and another vendor can accept it at a different time.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            setScheduleBusy(true);
            try {
              await requestsApi.declineSchedule(id);
              Alert.alert('Declined', 'The proposed time has been declined. Your request is back in the queue.');
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setScheduleBusy(false);
            }
          },
        },
      ],
    );
  };

  const openReschedule = () => {
    setNewDate(request.scheduledDate ? new Date(request.scheduledDate) : new Date());
    setRescheduleModal(true);
  };

  const cancelRequest = () => {
    const isEnRoute = request.status === 'VENDOR_EN_ROUTE';
    Alert.alert(
      'Cancel Service Request',
      isEnRoute
        ? 'Your vendor is already on the way. Cancelling now will result in a $25 cancellation fee. Are you sure you want to cancel?'
        : 'Are you sure you want to cancel this service request?',
      [
        { text: 'Keep It', style: 'cancel' },
        { text: 'Cancel Request', style: 'destructive', onPress: () => setShowCancelFeedback(true) },
      ],
    );
  };

  const finalizeCancelRequest = async () => {
    setShowCancelFeedback(false);
    try {
      await requestsApi.cancel(id);
      Alert.alert('Cancelled', 'Your service request has been cancelled.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const approveService = async (serviceId: string) => {
    setApprovingId(serviceId);
    try {
      await requestsApi.approveService(serviceId);
      Alert.alert('Approved', 'The recommended service has been approved.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setApprovingId(null);
    }
  };

  const declineService = (serviceId: string) => {
    Alert.alert(
      'Decline Recommendation',
      'Are you sure you want to decline this recommended service?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            setDecliningId(serviceId);
            try {
              await requestsApi.declineService(serviceId);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setDecliningId(null);
            }
          },
        },
      ],
    );
  };

  const submitReschedule = async () => {
    try {
      await requestsApi.reschedule(id, newDate.toISOString());
      setRescheduleModal(false);
      Alert.alert('Updated', 'Your inspection has been rescheduled.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading || !request) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING;
  const canReschedule = !['COMPLETED', 'CANCELLED', 'PENDING_CUSTOMER_REVIEW', 'VENDOR_EN_ROUTE', 'IN_PROGRESS'].includes(request.status);
  const canCancel = request.type === 'ADDITIONAL_SERVICE'
    ? !['COMPLETED', 'CANCELLED'].includes(request.status)
    // VENDOR_EN_ROUTE is now cancellable (with the $25 late-cancellation fee
    // charged server-side) — IN_PROGRESS stays blocked, that's a materially
    // different already-started-work scenario.
    : !['COMPLETED', 'CANCELLED', 'IN_PROGRESS'].includes(request.status);
  const canChat = !!request.vendorId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg, marginBottom: 0 }]}>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        {request.ticketNumber && <Text style={{ fontSize: 12, color: colors.steel, fontFamily: 'monospace' }}>{request.ticketNumber}</Text>}
      </View>

      {request.isPaidAddon && (
        <View style={styles.addonBanner}>
          <Text style={styles.addonBannerText}>
            Additional Inspection — {fmtUSD(request.addonPrice)} billed upon completion
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Address</Text>
      {(() => {
        const addr = request.address ? request : profileAddress;
        return addr?.address
          ? <Text style={styles.value}>{addr.address}, {addr.city}, {addr.state} {addr.zipCode}</Text>
          : <Text style={[styles.value, { color: colors.steel, fontStyle: 'italic' }]}>No address recorded</Text>;
      })()}

      <Text style={styles.sectionTitle}>Preferred Date</Text>
      <Text style={styles.value}>{new Date(request.preferredDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>

      {request.scheduledDate && (
        <>
          <Text style={styles.sectionTitle}>
            {request.status === 'PENDING_CUSTOMER_REVIEW' ? 'Vendor Proposed Time' : 'Scheduled Date'}
          </Text>
          <Text style={styles.value}>{new Date(request.scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
        </>
      )}

      {request.status === 'PENDING_CUSTOMER_REVIEW' && (
        <View style={styles.reviewBanner}>
          <Ionicons name="time-outline" size={20} color="#b45309" />
          <Text style={styles.reviewBannerText}>
            Your vendor proposed a different time than your preferred date. Do you accept this time?
          </Text>
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={[styles.reviewAcceptBtn, scheduleBusy && { opacity: 0.6 }]}
              onPress={confirmSchedule}
              disabled={scheduleBusy}
            >
              {scheduleBusy
                ? <ActivityIndicator color={colors.ink} size="small" />
                : <Text style={styles.reviewAcceptText}>Accept Time</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewDeclineBtn, scheduleBusy && { opacity: 0.6 }]}
              onPress={declineSchedule}
              disabled={scheduleBusy}
            >
              <Text style={styles.reviewDeclineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Vendor en-route ETA banner */}
      {request.status === 'VENDOR_EN_ROUTE' && (() => {
        const hasVendorLocation = request.vendorLatitude != null && request.vendorLongitude != null;
        const freshness = formatRelativeAge(request.vendorLocationAt);
        return (
          <View style={styles.enRouteBanner}>
            <Ionicons name="car-outline" size={22} color="#92400e" />
            <View style={{ flex: 1 }}>
              <Text style={styles.enRouteTitle}>Your vendor is on the way!</Text>
              <Text style={styles.enRouteBody}>
                {etaMinutes != null
                  ? `Estimated arrival: ~${etaMinutes} min`
                  : hasVendorLocation
                    ? "We haven't heard from your vendor's location recently, but they're on the way."
                    : 'Please make sure to be home when they arrive.'}
              </Text>
              {freshness !== '' && (
                <Text style={styles.enRouteMeta}>{freshness}</Text>
              )}
            </View>
          </View>
        );
      })()}

      {request.customerNotes && (
        <>
          <Text style={styles.sectionTitle}>Your Notes</Text>
          <Text style={styles.value}>{request.customerNotes}</Text>
        </>
      )}

      {request.vendor && (
        <>
          <Text style={styles.sectionTitle}>Service Provider</Text>
          <View style={styles.vendorCard}>
            <Text style={styles.vendorName}>{request.vendor.firstName} {request.vendor.lastName}</Text>
            {request.vendor.vendorProfile?.companyName && (
              <Text style={styles.vendorCompany}>{request.vendor.vendorProfile.companyName}</Text>
            )}
          </View>
        </>
      )}

      {request.vendorNotes && (
        <>
          <Text style={styles.sectionTitle}>Vendor Notes</Text>
          <Text style={styles.value}>{request.vendorNotes}</Text>
        </>
      )}

      {request.completionPhotoUrls?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Completion Photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {request.completionPhotoUrls.map((url: string, i: number) => (
              <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
            ))}
          </ScrollView>
        </>
      )}

      {notes.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inspection Notes</Text>
          {notes.map((n: any) => (
            <View key={n.id} style={[styles.noteCard, n.type === 'FINDING' && styles.noteCardFinding]}>
              {n.type === 'FINDING' && (
                <View style={styles.findingBadge}>
                  <Ionicons name="warning" size={12} color="#c05621" />
                  <Text style={styles.findingBadgeText}>Finding</Text>
                </View>
              )}
              <Text style={styles.noteTitle}>{n.title}</Text>
              <Text style={styles.noteContent}>{n.content}</Text>
              {n.photoUrls?.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {n.photoUrls.map((url: string, i: number) => (
                    <Image key={i} source={{ uri: url }} style={styles.notePhotoThumb} />
                  ))}
                </ScrollView>
              )}
            </View>
          ))}
        </>
      )}

      {solarQuote && request.type === 'ADDITIONAL_SERVICE' && (request.additionalServices?.[0]?.name || '').toLowerCase().includes('solar') && (
        <>
          <Text style={styles.sectionTitle}>Solar Quote</Text>
          <View style={[styles.svcCard, { borderColor: colors.lanternDeep }]}>
            {/* Status badge */}
            <View style={[styles.svcHeader, { marginBottom: 8 }]}>
              <Text style={[styles.svcName, { flex: 1 }]}>Contractor Proposal</Text>
              <View style={{
                backgroundColor: solarConsultation?.status === 'CONFIRMED' ? '#dcfce7' : solarConsultation?.status === 'DECLINED' ? '#fee2e2' : '#fef9c3',
                borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3,
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: solarConsultation?.status === 'CONFIRMED' ? '#059669' : solarConsultation?.status === 'DECLINED' ? '#dc2626' : '#92400e',
                }}>
                  {solarConsultation?.status === 'CONFIRMED' ? 'Site Visit Confirmed'
                    : solarConsultation?.status === 'COMPLETED' ? 'Visit Complete'
                    : solarConsultation?.status === 'DECLINED' ? 'Declined'
                    : solarConsultation ? 'Consultation Requested'
                    : 'Pending Consultation'}
                </Text>
              </View>
            </View>

            {/* Quote details */}
            <View style={{ gap: 5, marginBottom: 10 }}>
              <Text style={styles.svcDesc}>System: <Text style={{ fontWeight: '700', color: colors.ink }}>{Number(solarQuote.systemSizeKw).toFixed(1)} kW • {solarQuote.numInverters}x {solarQuote.inverterManufacturer} {solarQuote.inverterModel}</Text></Text>
              <Text style={styles.svcDesc}>PV System: <Text style={{ fontWeight: '700', color: '#059669' }}>${Number(solarQuote.pvSystemPrice).toLocaleString()}</Text></Text>
              {solarQuote.storageManufacturer && (
                <>
                  <Text style={styles.svcDesc}>Storage: <Text style={{ fontWeight: '700', color: colors.ink }}>{solarQuote.storageSizeKwh} kWh • {solarQuote.storageManufacturer} {solarQuote.storageModel}</Text></Text>
                  {solarQuote.storagePrice && (
                    <Text style={styles.svcDesc}>Storage: <Text style={{ fontWeight: '700', color: '#059669' }}>${Number(solarQuote.storagePrice).toLocaleString()}</Text></Text>
                  )}
                </>
              )}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
              <Text style={[styles.svcDesc, { fontWeight: '800', fontSize: 15, color: colors.lanternDeep }]}>
                Total: ${(Number(solarQuote.pvSystemPrice) + Number(solarQuote.storagePrice || 0)).toLocaleString()}
              </Text>
            </View>

            {/* Consultation flow */}
            {!solarConsultation && (
              <View style={{ marginTop: 4, gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.slate, marginBottom: 2 }}>Preferred Site Visit Date</Text>
                <DateTimeField value={consultationDate} onChange={setConsultationDate} />
                <TouchableOpacity
                  style={{ backgroundColor: colors.lantern, borderRadius: 12, padding: 14, alignItems: 'center' }}
                  disabled={consultationBusy}
                  onPress={async () => {
                    setConsultationBusy(true);
                    try {
                      const c: any = await requestsApi.requestConsultation(id, consultationDate.toISOString());
                      setSolarConsultation(c);
                    } catch (e: any) { Alert.alert('Error', e.message); }
                    finally { setConsultationBusy(false); }
                  }}
                >
                  {consultationBusy
                    ? <ActivityIndicator color={colors.ink} />
                    : <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>Request Site Visit</Text>}
                </TouchableOpacity>
              </View>
            )}

            {solarConsultation?.status === 'REQUESTED' && (
              <View style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>Site Visit Requested</Text>
                <Text style={{ fontSize: 13, color: '#1e40af', marginTop: 4 }}>
                  Proposed: {new Date(solarConsultation.customerProposedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: 13, color: '#1e40af', marginTop: 4 }}>Waiting for contractor to confirm the date.</Text>
                <TouchableOpacity
                  style={{ marginTop: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', alignItems: 'center' }}
                  disabled={consultationBusy}
                  onPress={async () => {
                    Alert.alert('Decline', 'This will close the solar quote request.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Decline', style: 'destructive', onPress: async () => {
                        setConsultationBusy(true);
                        try {
                          const c: any = await requestsApi.updateConsultation(id, 'DECLINE');
                          setSolarConsultation(c);
                          load();
                        } catch (e: any) { Alert.alert('Error', e.message); }
                        finally { setConsultationBusy(false); }
                      }},
                    ]);
                  }}
                >
                  <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>Decline Quote</Text>
                </TouchableOpacity>
              </View>
            )}

            {solarConsultation?.status === 'VENDOR_COUNTER' && (
              <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>Contractor Proposed a New Date</Text>
                <Text style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>
                  {new Date(solarConsultation.vendorProposedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.lantern, borderRadius: 10, padding: 12, alignItems: 'center' }}
                    disabled={consultationBusy}
                    onPress={async () => {
                      setConsultationBusy(true);
                      try {
                        const c: any = await requestsApi.updateConsultation(id, 'ACCEPT');
                        setSolarConsultation(c);
                      } catch (e: any) { Alert.alert('Error', e.message); }
                      finally { setConsultationBusy(false); }
                    }}
                  >
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>Accept Date</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 12, alignItems: 'center' }}
                    disabled={consultationBusy}
                    onPress={async () => {
                      Alert.alert('Decline', 'This will close the solar quote request.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Decline', style: 'destructive', onPress: async () => {
                          setConsultationBusy(true);
                          try {
                            const c: any = await requestsApi.updateConsultation(id, 'DECLINE');
                            setSolarConsultation(c);
                            load();
                          } catch (e: any) { Alert.alert('Error', e.message); }
                          finally { setConsultationBusy(false); }
                        }},
                      ]);
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {solarConsultation?.status === 'CONFIRMED' && (
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>✓ Site Visit Scheduled</Text>
                <Text style={{ fontSize: 13, color: '#065f46', marginTop: 4 }}>
                  {new Date(solarConsultation.confirmedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: 13, color: '#065f46', marginTop: 8 }}>Your contractor will visit to assess your home. After the site visit, they will provide a final installation proposal.</Text>
              </View>
            )}

            {solarConsultation?.status === 'DECLINED' && (
              <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>Quote Declined</Text>
                <Text style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4 }}>You have declined this solar quote. The request has been closed.</Text>
              </View>
            )}
          </View>

        </>
      )}

      {(() => {
        const isSolarReq = request.type === 'ADDITIONAL_SERVICE' &&
          (request.additionalServices?.[0]?.name || '').toLowerCase().includes('solar');
        const recServices = (request.additionalServices || [])
          .filter((s: any) => !(isSolarReq && s.name?.toLowerCase().includes('solar')));
        if (recServices.length === 0) return null;
        return (
        <>
          <Text style={styles.sectionTitle}>Recommended Services</Text>
          {recServices.map((svc: any) => (
            <View key={svc.id} style={[styles.svcCard, svc.approved && styles.svcCardApproved]}>
              <View style={styles.svcHeader}>
                <Text style={styles.svcName}>{svc.name}</Text>
                <Text style={styles.svcPrice}>{fmtUSD(svc.price)}</Text>
              </View>
              <Text style={styles.svcDesc}>{svc.description}</Text>
              {svc.approved ? (
                <Text style={styles.svcApprovedLabel}>Approved</Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.approveBtn, { flex: 1 }]}
                    onPress={() => approveService(svc.id)}
                    disabled={approvingId === svc.id || decliningId === svc.id}
                  >
                    {approvingId === svc.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.approveBtnText}>Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveBtn, { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc2626' }]}
                    onPress={() => declineService(svc.id)}
                    disabled={approvingId === svc.id || decliningId === svc.id}
                  >
                    {decliningId === svc.id
                      ? <ActivityIndicator color="#dc2626" size="small" />
                      : <Text style={[styles.approveBtnText, { color: '#dc2626' }]}>Decline</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
        );
      })()}

      {request.status === 'COMPLETED' && (
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => router.push(`/(customer)/inspection-report?id=${id}`)}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.ink} />
          <Text style={styles.reportBtnText}>
            {(request.additionalServices?.[0]?.name || '').toLowerCase().includes('hvac')
              ? 'View HVAC Inspection Report'
              : 'View Inspection Report'}
          </Text>
        </TouchableOpacity>
      )}

      {request.status === 'COMPLETED' && (
        <>
          <Text style={styles.sectionTitle}>Rate Your Experience</Text>
          {existingReview ? (
            <View style={styles.reviewSubmitted}>
              <Text style={styles.reviewStars}>{'★'.repeat(existingReview.rating)}{'☆'.repeat(5 - existingReview.rating)}</Text>
              <Text style={styles.reviewSubmittedText}>Thank you for your review!</Text>
              {existingReview.comment ? <Text style={styles.reviewComment}>{existingReview.comment}</Text> : null}
            </View>
          ) : (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewHint}>How was your experience with this vendor?</Text>
              <View style={styles.starsRow}>
                {[1,2,3,4,5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                    <Text style={[styles.star, star <= reviewRating && styles.starFilled]}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.reviewInput}
                placeholder="Leave a comment (optional)..."
                placeholderTextColor={colors.steel}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.reviewBtn, (reviewRating === 0 || submittingReview) && styles.reviewBtnDisabled]}
                disabled={reviewRating === 0 || submittingReview}
                onPress={async () => {
                  setSubmittingReview(true);
                  try {
                    const rv: any = await reviewsApi.submit({ serviceRequestId: id, rating: reviewRating, comment: reviewComment || undefined });
                    setExistingReview(rv);
                  } catch (e: any) {
                    Alert.alert('Error', e.message);
                  } finally {
                    setSubmittingReview(false);
                  }
                }}
              >
                <Text style={styles.reviewBtnText}>{submittingReview ? 'Submitting…' : 'Submit Review'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {canReschedule && (
        <TouchableOpacity style={styles.rescheduleBtn} onPress={openReschedule}>
          <Text style={styles.rescheduleBtnText}>Reschedule</Text>
        </TouchableOpacity>
      )}

      {canChat && (
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => router.push(`/chat/${id}?recipientId=${request.vendorId}&recipientName=Vendor`)}
        >
          <Text style={styles.chatBtnText}>💬 Message Vendor</Text>
        </TouchableOpacity>
      )}

      {canCancel && (
        <TouchableOpacity style={styles.cancelRequestBtn} onPress={cancelRequest}>
          <Text style={styles.cancelRequestText}>Cancel Service Request</Text>
        </TouchableOpacity>
      )}

      <Modal visible={rescheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reschedule Inspection</Text>
            <DateTimeField value={newDate} onChange={setNewDate} />
            <TouchableOpacity style={styles.confirmBtn} onPress={submitReschedule}>
              <Text style={styles.confirmText}>Confirm New Date</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRescheduleModal(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    <CancellationFeedbackModal
      visible={showCancelFeedback}
      type="SERVICE_REQUEST"
      serviceRequestId={id}
      stopTimingMessage="This request will be cancelled immediately."
      onDone={finalizeCancelRequest}
    />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, marginBottom: 20 },
  statusText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.steel, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  value: { fontSize: 16, color: colors.lanternDeep },
  noteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  noteCardFinding: { borderLeftWidth: 3, borderLeftColor: '#ed8936' },
  noteTitle: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  noteContent: { fontSize: 14, color: colors.steel, lineHeight: 20 },
  findingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff4e5', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6 },
  findingBadgeText: { fontSize: 11, fontWeight: '700', color: '#c05621' },
  photoThumb: { width: 120, height: 90, borderRadius: 10, marginRight: 8 },
  notePhotoThumb: { width: 80, height: 60, borderRadius: 8, marginRight: 6 },
  rescheduleBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  rescheduleBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.lanternDeep, marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: {
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  dateBtnText: { fontSize: 15, color: colors.ink, fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel },
  cancelRequestBtn: { backgroundColor: '#fff5f5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1.5, borderColor: '#fed7d7' },
  cancelRequestText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
  svcCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  svcCardApproved: { borderColor: '#059669', backgroundColor: '#f0fdf4' },
  svcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  svcName: { fontSize: 15, fontWeight: '700', color: colors.lanternDeep, flex: 1, marginRight: 8 },
  svcPrice: { fontSize: 15, fontWeight: '700', color: '#059669' },
  svcDesc: { fontSize: 13, color: colors.steel, lineHeight: 18, marginBottom: 10 },
  approveBtn: { backgroundColor: '#059669', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  reviewBanner: {
    backgroundColor: '#fffbeb', borderRadius: 14, padding: 16, marginTop: 16,
    borderWidth: 1.5, borderColor: '#fde68a', gap: 10,
  },
  reviewBannerText: { fontSize: 14, color: '#78350f', lineHeight: 20 },
  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  reviewAcceptBtn: { flex: 1, backgroundColor: colors.lantern, borderRadius: 10, padding: 13, alignItems: 'center' },
  reviewAcceptText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  reviewDeclineBtn: { flex: 1, backgroundColor: '#fff5f5', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#fed7d7' },
  reviewDeclineText: { color: '#c53030', fontWeight: '700', fontSize: 14 },
  addonBanner: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#fde68a' },
  addonBannerText: { fontSize: 13, color: '#92400e', fontWeight: '600' },
  enRouteBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fffbeb', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: '#f59e0b' },
  enRouteTitle: { fontSize: 15, fontWeight: '800', color: '#92400e', marginBottom: 2 },
  enRouteBody: { fontSize: 13, color: '#78350f', lineHeight: 20 },
  enRouteMeta: { fontSize: 11, color: '#b45309', marginTop: 2 },
  svcApprovedLabel: { color: '#059669', fontWeight: '700', fontSize: 13 },
  vendorCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 4, borderWidth: 1, borderColor: colors.border },
  vendorName: { fontSize: 15, fontWeight: '700', color: colors.lanternDeep },
  vendorCompany: { fontSize: 13, color: colors.steel, marginTop: 2 },
  reviewCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  reviewHint: { fontSize: 14, color: colors.steel, marginBottom: 12 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  star: { fontSize: 36, color: '#d1d5db' },
  starFilled: { color: '#f59e0b' },
  reviewInput: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: '#333', height: 80, textAlignVertical: 'top', marginBottom: 12 },
  reviewBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center' },
  reviewBtnDisabled: { backgroundColor: colors.steel },
  reviewBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  reviewSubmitted: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#6ee7b7', alignItems: 'center' },
  reviewStars: { fontSize: 28, color: '#f59e0b', letterSpacing: 2, marginBottom: 4 },
  reviewSubmittedText: { fontSize: 14, color: '#059669', fontWeight: '600', marginBottom: 4 },
  reviewComment: { fontSize: 13, color: colors.steel, textAlign: 'center', fontStyle: 'italic' },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.lantern, borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 4,
  },
  reportBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
