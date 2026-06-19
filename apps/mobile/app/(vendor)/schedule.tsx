import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { requestsApi } from '../../src/services/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_SHORT = ['S','M','T','W','T','F','S'];

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACCEPTED:        { color: '#2563eb', bg: '#eff6ff', label: 'Scheduled' },
  VENDOR_EN_ROUTE: { color: '#d97706', bg: '#fffbeb', label: 'En Route' },
  IN_PROGRESS:     { color: '#7c3aed', bg: '#f5f3ff', label: 'In Progress' },
  COMPLETED:       { color: '#059669', bg: '#ecfdf5', label: 'Completed' },
  CANCELLED:       { color: '#dc2626', bg: '#fef2f2', label: 'Cancelled' },
  PENDING:         { color: '#6b7280', bg: '#f9fafb', label: 'Pending' },
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFullDate(iso: string) {
  const d = new Date(iso);
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function buildWeekDays(anchor: Date): Date[] {
  const dow = anchor.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - dow + i);
    return d;
  });
}

export default function VendorSchedule() {
  const today = new Date();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekAnchor, setWeekAnchor] = useState<Date>(today);

  const load = useCallback(async () => {
    try {
      const data: any = await requestsApi.getVendorJobs();
      setJobs(data || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scheduled = jobs.filter((j) => j.scheduledDate && j.status !== 'CANCELLED');
  const upcoming = scheduled
    .filter((j) => new Date(j.scheduledDate) >= today)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  const past = scheduled
    .filter((j) => new Date(j.scheduledDate) < today)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 5);

  const weekDays = buildWeekDays(weekAnchor);
  const selectedDayItems = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), selectedDate));

  const hasEventOnDay = (d: Date) => scheduled.some((j) => isSameDay(new Date(j.scheduledDate), d));

  const todayJobs = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), today));

  const prevWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() - 7);
    setWeekAnchor(d);
  };
  const nextWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + 7);
    setWeekAnchor(d);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#2d4a22" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Today summary banner */}
      {todayJobs.length > 0 && (
        <View style={styles.todayBanner}>
          <Text style={styles.todayBannerTitle}>Today's Jobs</Text>
          <Text style={styles.todayBannerCount}>{todayJobs.length} visit{todayJobs.length > 1 ? 's' : ''} scheduled</Text>
        </View>
      )}

      {/* Week strip */}
      <View style={styles.weekStrip}>
        <View style={styles.weekHeader}>
          <TouchableOpacity onPress={prevWeek} style={styles.weekNavBtn}>
            <Text style={styles.weekNavText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekTitle}>
            {MONTHS[weekDays[0].getMonth()]} {weekDays[0].getDate()} – {MONTHS[weekDays[6].getMonth()]} {weekDays[6].getDate()}, {weekDays[6].getFullYear()}
          </Text>
          <TouchableOpacity onPress={nextWeek} style={styles.weekNavBtn}>
            <Text style={styles.weekNavText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.weekDays}>
          {weekDays.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const count = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), d)).length;
            return (
              <TouchableOpacity key={i} style={styles.weekDay} onPress={() => setSelectedDate(d)}>
                <Text style={[styles.dowText, isSelected && styles.selectedDowText]}>{DOW_SHORT[i]}</Text>
                <View style={[styles.dayCircle, isSelected && styles.selectedDayCircle, isToday && !isSelected && styles.todayCircle]}>
                  <Text style={[styles.dayNum, isSelected && styles.selectedDayNum, isToday && !isSelected && styles.todayNum]}>
                    {d.getDate()}
                  </Text>
                </View>
                {count > 0 && (
                  <View style={[styles.countBadge, isSelected && styles.selectedCountBadge]}>
                    <Text style={[styles.countText, isSelected && styles.selectedCountText]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected day jobs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {isSameDay(selectedDate, today) ? 'Today' : formatFullDate(selectedDate.toISOString())}
        </Text>
        {selectedDayItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No jobs scheduled for this day</Text>
          </View>
        ) : (
          selectedDayItems.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </View>

      {/* Upcoming jobs */}
      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
          {upcoming.map((job) => <JobCard key={job.id} job={job} />)}
        </View>
      )}

      {/* Past jobs */}
      {past.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Jobs</Text>
          {past.map((job) => <JobCard key={job.id} job={job} />)}
        </View>
      )}

      {scheduled.length === 0 && (
        <View style={[styles.emptyCard, { margin: 16 }]}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>No scheduled jobs yet.{'\n'}Accept open requests to fill your calendar!</Text>
          <TouchableOpacity style={styles.requestBtn} onPress={() => router.push('/(vendor)/requests')}>
            <Text style={styles.requestBtnText}>View Open Requests</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function JobCard({ job }: { job: any }) {
  const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
  const isActive = ['VENDOR_EN_ROUTE', 'IN_PROGRESS'].includes(job.status);
  return (
    <TouchableOpacity
      style={[styles.jobCard, isActive && styles.activeJobCard]}
      onPress={() => router.push(`/(vendor)/active-job?id=${job.id}`)}
    >
      <View style={[styles.jobTimeline, { backgroundColor: cfg.color }]} />
      <View style={styles.jobContent}>
        <View style={styles.jobHeader}>
          <Text style={styles.jobTime}>{formatTime(job.scheduledDate)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={styles.jobDate}>{formatFullDate(job.scheduledDate)}</Text>
        <Text style={styles.jobAddress}>{job.address}</Text>
        <Text style={styles.jobCity}>{job.city}, {job.state} {job.zipCode}</Text>
        {job.customerNotes && (
          <Text style={styles.jobNote} numberOfLines={1}>Customer: {job.customerNotes}</Text>
        )}
        {isActive && <Text style={styles.tapHint}>Tap to manage active job →</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  todayBanner: { backgroundColor: '#2d4a22', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayBannerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  todayBannerCount: { color: '#a8d5a2', fontSize: 13, fontWeight: '600' },
  weekStrip: { backgroundColor: '#2d4a22', paddingBottom: 16 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  weekNavBtn: { padding: 4 },
  weekNavText: { color: '#a8d5a2', fontSize: 28, lineHeight: 28 },
  weekTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  weekDays: { flexDirection: 'row', paddingHorizontal: 8 },
  weekDay: { flex: 1, alignItems: 'center', gap: 4 },
  dowText: { fontSize: 11, color: '#a8d5a2', fontWeight: '500' },
  selectedDowText: { color: '#fff' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  selectedDayCircle: { backgroundColor: '#fff' },
  todayCircle: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dayNum: { fontSize: 15, color: '#a8d5a2', fontWeight: '500' },
  selectedDayNum: { color: '#2d4a22', fontWeight: '800' },
  todayNum: { color: '#fff', fontWeight: '700' },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  selectedCountBadge: { backgroundColor: '#2d4a22' },
  countText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  selectedCountText: { color: '#fff' },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d4a22', paddingHorizontal: 16, paddingVertical: 12 },
  jobCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6 },
  activeJobCard: { borderWidth: 2, borderColor: '#2d4a22' },
  jobTimeline: { width: 4 },
  jobContent: { flex: 1, padding: 14 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobTime: { fontSize: 15, fontWeight: '700', color: '#111' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: '600' },
  jobDate: { fontSize: 13, color: '#555', marginBottom: 2 },
  jobAddress: { fontSize: 14, fontWeight: '600', color: '#333' },
  jobCity: { fontSize: 13, color: '#777' },
  jobNote: { fontSize: 12, color: '#999', marginTop: 4, fontStyle: 'italic' },
  tapHint: { fontSize: 12, color: '#2d4a22', fontWeight: '600', marginTop: 6 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 28, marginHorizontal: 16, marginBottom: 10 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22, fontSize: 14 },
  requestBtn: { marginTop: 16, backgroundColor: '#2d4a22', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
