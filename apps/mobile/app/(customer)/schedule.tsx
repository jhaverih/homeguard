import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, PanResponder,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { requestsApi } from '../../src/services/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_SHORT = ['S','M','T','W','T','F','S'];

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACCEPTED:        { color: '#2563eb', bg: '#eff6ff', label: 'Scheduled' },
  VENDOR_EN_ROUTE: { color: '#d97706', bg: '#fffbeb', label: 'Vendor en route' },
  IN_PROGRESS:     { color: '#7c3aed', bg: '#f5f3ff', label: 'In progress' },
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

export default function CustomerSchedule() {
  const today = new Date();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekAnchor, setWeekAnchor] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const viewModeRef = useRef(viewMode);
  useRef(() => { viewModeRef.current = viewMode; });

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

  // Update ref whenever viewMode changes so PanResponder closure can read it
  const _vmRef = useRef(viewMode);
  _vmRef.current = viewMode;

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > Math.abs(dy) + 8 && Math.abs(dx) > 12,
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -60) { _vmRef.current === 'week' ? nextWeek() : nextMonth(); }
        else if (dx > 60) { _vmRef.current === 'week' ? prevWeek() : prevMonth(); }
      },
    }),
  ).current;

  const load = useCallback(async () => {
    try {
      const data: any = await requestsApi.getMyRequests();
      setRequests(data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const scheduled = requests.filter((r) => r.scheduledDate && r.status !== 'CANCELLED');
  const weekDays = buildWeekDays(weekAnchor);
  const selectedDayItems = scheduled.filter((r) => isSameDay(new Date(r.scheduledDate), selectedDate));
  const upcoming = scheduled
    .filter((r) => new Date(r.scheduledDate) >= today)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  const past = scheduled
    .filter((r) => new Date(r.scheduledDate) < today)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 5);

  const monthCells = buildMonthGrid(monthAnchor.getFullYear(), monthAnchor.getMonth());

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#0B4A45" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
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

        {viewMode === 'week' ? (
          <View style={styles.weekDays}>
            {weekDays.map((d, i) => {
              const isSelected = isSameDay(d, selectedDate);
              const isToday = isSameDay(d, today);
              const hasEvent = scheduled.some((r) => isSameDay(new Date(r.scheduledDate), d));
              return (
                <TouchableOpacity key={i} style={styles.weekDay} onPress={() => setSelectedDate(d)}>
                  <Text style={[styles.dowText, isSelected && styles.selectedDowText]}>{DOW_SHORT[i]}</Text>
                  <View style={[styles.dayCircle, isSelected && styles.selectedDayCircle, isToday && !isSelected && styles.todayCircle]}>
                    <Text style={[styles.dayNum, isSelected && styles.selectedDayNum, isToday && !isSelected && styles.todayNum]}>
                      {d.getDate()}
                    </Text>
                  </View>
                  {hasEvent && <View style={[styles.eventDot, isSelected && styles.selectedEventDot]} />}
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
              const hasEvent = scheduled.some((r) => isSameDay(new Date(r.scheduledDate), cell));
              return (
                <TouchableOpacity key={idx} style={styles.monthCell} onPress={() => setSelectedDate(cell)}>
                  <View style={[styles.monthDayCircle, isSelected && styles.selectedDayCircle, isToday && !isSelected && styles.todayCircle]}>
                    <Text style={[styles.monthDayNum, isSelected && styles.selectedDayNum, isToday && !isSelected && styles.todayNum]}>
                      {cell.getDate()}
                    </Text>
                  </View>
                  {hasEvent && <View style={[styles.eventDot, isSelected && styles.selectedEventDot]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Selected day */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {isSameDay(selectedDate, today) ? 'Today' : formatFullDate(selectedDate.toISOString())}
        </Text>
        {selectedDayItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No visits scheduled for this day</Text>
          </View>
        ) : (
          selectedDayItems.map((req) => <VisitCard key={req.id} req={req} />)
        )}
      </View>

      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Visits</Text>
          {upcoming.map((req) => <VisitCard key={req.id} req={req} />)}
        </View>
      )}

      {past.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Visits</Text>
          {past.map((req) => <VisitCard key={req.id} req={req} />)}
        </View>
      )}

      {scheduled.length === 0 && (
        <View style={[styles.emptyCard, { margin: 16 }]}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>No scheduled visits yet.{'\n'}Request an inspection to get started!</Text>
          <TouchableOpacity style={styles.requestBtn} onPress={() => router.push('/(customer)/request')}>
            <Text style={styles.requestBtnText}>Request Inspection</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function VisitCard({ req }: { req: any }) {
  const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
  return (
    <TouchableOpacity
      style={styles.visitCard}
      onPress={() => router.push(`/(customer)/request-detail?id=${req.id}`)}
    >
      <View style={[styles.visitTimeline, { backgroundColor: cfg.color }]} />
      <View style={styles.visitContent}>
        <View style={styles.visitHeader}>
          <Text style={styles.visitTime}>{formatTime(req.scheduledDate)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={styles.visitDate}>{formatFullDate(req.scheduledDate)}</Text>
        <Text style={styles.visitAddress}>{req.address}, {req.city}, {req.state}</Text>
        {req.customerNotes && <Text style={styles.visitNote} numberOfLines={1}>Note: {req.customerNotes}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  weekStrip: { backgroundColor: '#0B4A45', paddingBottom: 16 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  weekNavBtn: { padding: 4 },
  weekNavText: { color: '#a8c4e5', fontSize: 28, lineHeight: 28 },
  viewToggle: { alignItems: 'center', flex: 1 },
  weekTitle: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  viewToggleHint: { color: '#a8c4e5', fontSize: 11, marginTop: 2 },
  weekDays: { flexDirection: 'row', paddingHorizontal: 8 },
  weekDay: { flex: 1, alignItems: 'center', gap: 4 },
  dowText: { fontSize: 11, color: '#a8c4e5', fontWeight: '500' },
  selectedDowText: { color: '#fff' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  selectedDayCircle: { backgroundColor: '#fff' },
  todayCircle: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dayNum: { fontSize: 15, color: '#a8c4e5', fontWeight: '500' },
  selectedDayNum: { color: '#0B4A45', fontWeight: '800' },
  todayNum: { color: '#fff', fontWeight: '700' },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#60a5fa' },
  selectedEventDot: { backgroundColor: '#0B4A45' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 4 },
  monthDowLabel: { width: '14.28%', textAlign: 'center', color: '#a8c4e5', fontSize: 11, fontWeight: '600', paddingBottom: 6 },
  monthCell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  monthDayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthDayNum: { fontSize: 13, color: '#a8c4e5', fontWeight: '500' },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0B4A45', paddingHorizontal: 16, paddingVertical: 12 },
  visitCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6 },
  visitTimeline: { width: 4 },
  visitContent: { flex: 1, padding: 14 },
  visitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  visitTime: { fontSize: 15, fontWeight: '700', color: '#111' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: '600' },
  visitDate: { fontSize: 13, color: '#555', marginBottom: 2 },
  visitAddress: { fontSize: 13, color: '#777' },
  visitNote: { fontSize: 12, color: '#999', marginTop: 4, fontStyle: 'italic' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 28, marginHorizontal: 16, marginBottom: 10 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22, fontSize: 14 },
  requestBtn: { marginTop: 16, backgroundColor: '#0B4A45', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
