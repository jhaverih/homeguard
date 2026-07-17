import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, PanResponder,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { requestsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

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
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function VendorSchedule() {
  const today = new Date();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekAnchor, setWeekAnchor] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const prevWeek = useCallback(() => {
    setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }, []);
  const nextWeek = useCallback(() => {
    setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }, []);
  const prevMonth = useCallback(() => {
    setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);
  const nextMonth = useCallback(() => {
    setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  // The date numbers swap instantly on swipe with no visual cue — this slide
  // + fade makes the change unmistakable without porting PanResponder to a
  // full gesture-handler Pan (no live drag-following, just a release-triggered
  // transition, which is enough to make the swap noticeable).
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const gridAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));
  const triggerSlideAnim = (direction: 'left' | 'right') => {
    slideX.value = direction === 'left' ? 24 : -24;
    slideOpacity.value = 0.4;
    slideX.value = withTiming(0, { duration: 200 });
    slideOpacity.value = withTiming(1, { duration: 200 });
  };

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > Math.abs(dy) + 8 && Math.abs(dx) > 12,
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -60) { viewModeRef.current === 'week' ? nextWeek() : nextMonth(); triggerSlideAnim('left'); }
        else if (dx > 60) { viewModeRef.current === 'week' ? prevWeek() : prevMonth(); triggerSlideAnim('right'); }
      },
    }),
  ).current;

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
  const weekDays = buildWeekDays(weekAnchor);
  const selectedDayItems = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), selectedDate));
  const todayJobs = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), today));
  const upcoming = scheduled
    .filter((j) => new Date(j.scheduledDate) >= today)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  const past = scheduled
    .filter((j) => new Date(j.scheduledDate) < today)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 5);

  const monthCells = buildMonthGrid(monthAnchor.getFullYear(), monthAnchor.getMonth());

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {todayJobs.length > 0 && viewMode === 'week' && (
        <View style={styles.todayBanner}>
          <Text style={styles.todayBannerTitle}>Today's Jobs</Text>
          <Text style={styles.todayBannerCount}>{todayJobs.length} visit{todayJobs.length > 1 ? 's' : ''} scheduled</Text>
        </View>
      )}

      {/* Calendar strip — swipeable */}
      <View style={styles.weekStrip} {...swipe.panHandlers}>
        <View style={styles.weekHeader}>
          <TouchableOpacity onPress={viewMode === 'week' ? prevWeek : prevMonth} style={styles.weekNavBtn}>
            <Text style={styles.weekNavText}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setViewMode(v => v === 'week' ? 'month' : 'week')} style={styles.viewToggle}>
            <Text style={styles.weekTitle}>
              {viewMode === 'week'
                ? `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
                : `${FULL_MONTHS[monthAnchor.getMonth()]} ${monthAnchor.getFullYear()}`
              }
            </Text>
            <Text style={styles.viewToggleHint}>{viewMode === 'week' ? 'Month ▾' : 'Week ▴'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={viewMode === 'week' ? nextWeek : nextMonth} style={styles.weekNavBtn}>
            <Text style={styles.weekNavText}>›</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={gridAnimatedStyle}>
        {viewMode === 'week' ? (
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
        ) : (
          <View style={styles.monthGrid}>
            {DOW_SHORT.map((d) => (
              <Text key={d} style={styles.monthDowLabel}>{d}</Text>
            ))}
            {monthCells.map((cell, idx) => {
              if (!cell) return <View key={`e-${idx}`} style={styles.monthCell} />;
              const isSelected = isSameDay(cell, selectedDate);
              const isToday = isSameDay(cell, today);
              const count = scheduled.filter((j) => isSameDay(new Date(j.scheduledDate), cell)).length;
              return (
                <TouchableOpacity key={idx} style={styles.monthCell} onPress={() => { setSelectedDate(cell); }}>
                  <View style={[styles.monthDayCircle, isSelected && styles.selectedDayCircle, isToday && !isSelected && styles.todayCircle]}>
                    <Text style={[styles.monthDayNum, isSelected && styles.selectedDayNum, isToday && !isSelected && styles.todayNum]}>
                      {cell.getDate()}
                    </Text>
                  </View>
                  {count > 0 && (
                    <View style={[styles.monthDot, isSelected && styles.monthDotSelected]}>
                      <Text style={styles.monthDotText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </Animated.View>
      </View>

      {/* Selected day */}
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

      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
          {upcoming.map((job) => <JobCard key={job.id} job={job} />)}
        </View>
      )}

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
        {job.customerNotes && <Text style={styles.jobNote} numberOfLines={1}>Customer: {job.customerNotes}</Text>}
        {isActive && <Text style={styles.tapHint}>Tap to manage active job →</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  todayBanner: { backgroundColor: colors.ink, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayBannerTitle: { color: colors.mist, fontSize: 15, fontWeight: '700' },
  todayBannerCount: { color: colors.mistDim, fontSize: 13, fontWeight: '600' },
  weekStrip: { backgroundColor: colors.ink, paddingBottom: 16 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  weekNavBtn: { padding: 4 },
  weekNavText: { color: colors.mistDim, fontSize: 28, lineHeight: 28 },
  viewToggle: { alignItems: 'center', flex: 1 },
  weekTitle: { color: colors.mist, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  viewToggleHint: { color: colors.mistDim, fontSize: 11, marginTop: 2 },
  weekDays: { flexDirection: 'row', paddingHorizontal: 8 },
  weekDay: { flex: 1, alignItems: 'center', gap: 4 },
  dowText: { fontSize: 11, color: colors.mistDim, fontWeight: '500' },
  selectedDowText: { color: colors.mist },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  selectedDayCircle: { backgroundColor: colors.surface },
  todayCircle: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dayNum: { fontSize: 15, color: colors.mistDim, fontWeight: '500' },
  selectedDayNum: { color: colors.lanternDeep, fontWeight: '800' },
  todayNum: { color: colors.mist, fontWeight: '700' },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  selectedCountBadge: { backgroundColor: colors.lantern },
  countText: { fontSize: 10, color: colors.mist, fontWeight: '700' },
  selectedCountText: { color: colors.ink },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 4 },
  monthDowLabel: { width: '14.28%', textAlign: 'center', color: colors.mistDim, fontSize: 11, fontWeight: '600', paddingBottom: 6 },
  monthCell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  monthDayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthDayNum: { fontSize: 13, color: colors.mistDim, fontWeight: '500' },
  monthDot: { marginTop: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  monthDotSelected: { backgroundColor: colors.lantern },
  monthDotText: { fontSize: 9, color: colors.mist, fontWeight: '700' },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.lanternDeep, paddingHorizontal: 16, paddingVertical: 12 },
  jobCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6 },
  activeJobCard: { borderWidth: 2, borderColor: colors.lanternDeep },
  jobTimeline: { width: 4 },
  jobContent: { flex: 1, padding: 14 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobTime: { fontSize: 15, fontWeight: '700', color: colors.ink },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: '600' },
  jobDate: { fontSize: 13, color: colors.steel, marginBottom: 2 },
  jobAddress: { fontSize: 14, fontWeight: '600', color: '#333' },
  jobCity: { fontSize: 13, color: colors.steel },
  jobNote: { fontSize: 12, color: colors.steel, marginTop: 4, fontStyle: 'italic' },
  tapHint: { fontSize: 12, color: colors.lanternDeep, fontWeight: '600', marginTop: 6 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 28, marginHorizontal: 16, marginBottom: 10 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: colors.steel, textAlign: 'center', lineHeight: 22, fontSize: 14 },
  requestBtn: { marginTop: 16, backgroundColor: colors.lantern, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  requestBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
