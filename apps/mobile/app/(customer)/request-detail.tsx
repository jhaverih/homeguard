import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { requestsApi, inspectionsApi, userApi } from '../../src/services/api';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:         { color: '#6b7280', bg: '#f9fafb', label: 'Pending' },
  ACCEPTED:        { color: '#2563eb', bg: '#eff6ff', label: 'Scheduled' },
  VENDOR_EN_ROUTE: { color: '#d97706', bg: '#fffbeb', label: 'Vendor en route' },
  IN_PROGRESS:     { color: '#7c3aed', bg: '#f5f3ff', label: 'In progress' },
  COMPLETED:       { color: '#059669', bg: '#ecfdf5', label: 'Completed' },
  CANCELLED:       { color: '#dc2626', bg: '#fef2f2', label: 'Cancelled' },
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

  const load = useCallback(async () => {
    try {
      const [req, me]: any[] = await Promise.all([
        requestsApi.getOne(id),
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
    } catch (e: any) {
      Alert.alert('Error', 'Could not load this request.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openReschedule = () => {
    setNewDate(request.scheduledDate ? new Date(request.scheduledDate) : new Date());
    setRescheduleModal(true);
  };

  const cancelRequest = () => {
    Alert.alert(
      'Cancel Inspection',
      'Are you sure you want to cancel this inspection request?',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Request', style: 'destructive',
          onPress: async () => {
            try {
              await requestsApi.cancel(id);
              Alert.alert('Cancelled', 'Your inspection request has been cancelled.');
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
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

  if (loading || !request) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING;
  const canReschedule = !['COMPLETED', 'CANCELLED'].includes(request.status);
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(request.status);
  const canChat = !!request.vendorId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      <Text style={styles.sectionTitle}>Address</Text>
      {(() => {
        const addr = request.address ? request : profileAddress;
        return addr?.address
          ? <Text style={styles.value}>{addr.address}, {addr.city}, {addr.state} {addr.zipCode}</Text>
          : <Text style={[styles.value, { color: '#aaa', fontStyle: 'italic' }]}>No address recorded</Text>;
      })()}

      <Text style={styles.sectionTitle}>Preferred Date</Text>
      <Text style={styles.value}>{new Date(request.preferredDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>

      {request.scheduledDate && (
        <>
          <Text style={styles.sectionTitle}>Scheduled Date</Text>
          <Text style={styles.value}>{new Date(request.scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
        </>
      )}

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

      {notes.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inspection Notes</Text>
          {notes.map((n: any) => (
            <View key={n.id} style={styles.noteCard}>
              <Text style={styles.noteTitle}>{n.title}</Text>
              <Text style={styles.noteContent}>{n.content}</Text>
            </View>
          ))}
        </>
      )}

      {request.additionalServices?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recommended Services</Text>
          {request.additionalServices.map((svc: any) => (
            <View key={svc.id} style={[styles.svcCard, svc.approved && styles.svcCardApproved]}>
              <View style={styles.svcHeader}>
                <Text style={styles.svcName}>{svc.name}</Text>
                <Text style={styles.svcPrice}>${parseFloat(svc.price).toFixed(2)}</Text>
              </View>
              <Text style={styles.svcDesc}>{svc.description}</Text>
              {svc.approved ? (
                <Text style={styles.svcApprovedLabel}>Approved</Text>
              ) : (
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => approveService(svc.id)}
                  disabled={approvingId === svc.id}
                >
                  {approvingId === svc.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.approveBtnText}>Approve</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          ))}
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
          <Text style={styles.cancelRequestText}>Cancel Inspection</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 20 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, marginBottom: 20 },
  statusText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  value: { fontSize: 16, color: '#1e3a5f' },
  noteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  noteTitle: { fontSize: 14, fontWeight: '700', color: '#1e3a5f', marginBottom: 4 },
  noteContent: { fontSize: 14, color: '#555', lineHeight: 20 },
  rescheduleBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  rescheduleBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chatBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  chatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1e3a5f', marginBottom: 16 },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dateBtn: {
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  dateBtnText: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  doneBtn: { backgroundColor: '#1e3a5f', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  confirmBtn: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888' },
  cancelRequestBtn: { backgroundColor: '#fff5f5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1.5, borderColor: '#fed7d7' },
  cancelRequestText: { color: '#c53030', fontWeight: '700', fontSize: 15 },
  svcCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  svcCardApproved: { borderColor: '#059669', backgroundColor: '#f0fdf4' },
  svcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  svcName: { fontSize: 15, fontWeight: '700', color: '#1e3a5f', flex: 1, marginRight: 8 },
  svcPrice: { fontSize: 15, fontWeight: '700', color: '#059669' },
  svcDesc: { fontSize: 13, color: '#555', lineHeight: 18, marginBottom: 10 },
  approveBtn: { backgroundColor: '#059669', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  svcApprovedLabel: { color: '#059669', fontWeight: '700', fontSize: 13 },
  vendorCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  vendorName: { fontSize: 15, fontWeight: '700', color: '#1e3a5f' },
  vendorCompany: { fontSize: 13, color: '#64748b', marginTop: 2 },
});
