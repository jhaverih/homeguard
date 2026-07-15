import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
  TouchableOpacity, Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { inspectionsApi } from '../../src/services/api';
import { colors } from '../../src/theme';

const STATUS_COLOR: Record<string, string> = {
  OK: '#059669',
  NEEDS_ATTENTION: '#d97706',
  URGENT: '#dc2626',
  NOT_ACCESSIBLE: '#6b7280',
};
const STATUS_LABEL: Record<string, string> = {
  OK: 'Good',
  NEEDS_ATTENTION: 'Needs Attention',
  URGENT: 'Urgent',
  NOT_ACCESSIBLE: 'Not Accessible',
};

function prettyKey(key: string) {
  const part = key.includes('.') ? key.split('.').pop()! : key;
  return part.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByArea(tasks: any[]): { area: string; items: any[] }[] {
  const map = new Map<string, any[]>();
  for (const t of tasks) {
    const section = t.sectionKey || t.taskKey?.split('.')[0] || 'other';
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(t);
  }
  return Array.from(map.entries()).map(([area, items]) => ({ area, items }));
}

function sectionLabel(key: string): string {
  const labels: Record<string, string> = {
    hvac_visual: 'HVAC Visual',
    hvac_filter: 'HVAC Filter',
    toilet_leak: 'Toilet Leak Check',
    sink_leak: 'Sink Leak Check',
    washer_pan: 'Washer Pan',
    gutters: 'Gutters',
    bulb_replacement: 'Bulb Replacement',
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InspectionHistoryScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'timeline' | 'notes'>('timeline');

  const load = async () => {
    try {
      const [taskData, notesData]: any[] = await Promise.all([
        inspectionsApi.getCustomerTaskHistory().catch(() => []),
        inspectionsApi.getHistory().catch(() => []),
      ]);
      setTasks(taskData || []);
      setNotes(notesData || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const toggleArea = (area: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const groups = groupByArea(tasks);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>Inspection History</Text>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'timeline' && styles.tabActive]}
          onPress={() => setTab('timeline')}
        >
          <Text style={[styles.tabText, tab === 'timeline' && styles.tabTextActive]}>By Area</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'notes' && styles.tabActive]}
          onPress={() => setTab('notes')}
        >
          <Text style={[styles.tabText, tab === 'notes' && styles.tabTextActive]}>Notes</Text>
        </TouchableOpacity>
      </View>

      {tab === 'timeline' && (
        <>
          {groups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={styles.emptyTitle}>No History Yet</Text>
              <Text style={styles.emptyText}>Your inspection history by appliance and area will appear here after your first inspection.</Text>
            </View>
          ) : (
            groups.map(({ area, items }) => {
              const expanded = expandedAreas.has(area);
              const lastDate = items.reduce((best: string, t: any) =>
                !best || t.updatedAt > best ? t.updatedAt : best, '');
              const issueCount = items.filter((t: any) => t.status !== 'OK').length;
              return (
                <View key={area} style={styles.areaCard}>
                  <TouchableOpacity style={styles.areaHeader} onPress={() => toggleArea(area)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.areaLabel}>{sectionLabel(area)}</Text>
                      <Text style={styles.areaDate}>
                        Last checked: {lastDate
                          ? new Date(lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Unknown'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {issueCount > 0 && (
                        <View style={styles.issueBadge}>
                          <Text style={styles.issueBadgeText}>{issueCount} issue{issueCount !== 1 ? 's' : ''}</Text>
                        </View>
                      )}
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.steel} />
                    </View>
                  </TouchableOpacity>

                  {expanded && (
                    <View style={styles.taskItems}>
                      {items.map((task: any, idx: number) => {
                        const color = STATUS_COLOR[task.status] || colors.steel;
                        const label = STATUS_LABEL[task.status] || task.status;
                        return (
                          <View key={task.id} style={[styles.taskItem, idx > 0 && styles.taskItemBorder]}>
                            <View style={[styles.taskDot, { backgroundColor: color }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.taskItemLabel}>{prettyKey(task.taskKey)}</Text>
                              {task.findings ? (
                                <Text style={styles.taskItemFindings} numberOfLines={2}>{task.findings}</Text>
                              ) : null}
                              <Text style={styles.taskItemDate}>
                                {new Date(task.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                              <Text style={[styles.statusPillText, { color }]}>{label}</Text>
                            </View>
                          </View>
                        );
                      })}
                      {/* Photos from any of these tasks */}
                      {items.some((t: any) => t.photoUrls?.length > 0) && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                          {items.flatMap((t: any) => t.photoUrls || []).map((url: string, i: number) => (
                            <Image key={i} source={{ uri: url }} style={styles.photo} />
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      )}

      {tab === 'notes' && (
        <>
          {notes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No Inspection Notes Yet</Text>
              <Text style={styles.emptyText}>When a vendor completes an inspection, their notes will appear here.</Text>
            </View>
          ) : (
            notes.map((note: any) => (
              <View key={note.id} style={styles.noteCard}>
                <Text style={styles.noteDate}>{new Date(note.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.noteTitle}>{note.title}</Text>
                <Text style={styles.noteContent}>{note.content}</Text>
                {note.photoUrls?.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                    {note.photoUrls.map((url: string, i: number) => (
                      <Image key={i} source={{ uri: url }} style={styles.photo} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))
          )}
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  pageTitle: { fontSize: 22, fontWeight: '700', color: colors.lanternDeep, margin: 16, marginBottom: 8 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.border, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.steel },
  tabTextActive: { color: colors.lanternDeep },
  emptyCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.lanternDeep, marginBottom: 8 },
  emptyText: { color: colors.steel, textAlign: 'center', lineHeight: 22 },
  // Area cards (timeline)
  areaCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  areaHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  areaLabel: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  areaDate: { fontSize: 12, color: colors.steel },
  issueBadge: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  issueBadgeText: { fontSize: 11, fontWeight: '700', color: '#dc2626' },
  taskItems: { borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 4 },
  taskItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  taskItemBorder: { borderTopWidth: 1, borderTopColor: colors.canvas },
  taskDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  taskItemLabel: { fontSize: 13, fontWeight: '600', color: colors.slate, lineHeight: 20 },
  taskItemFindings: { fontSize: 12, color: colors.steel, lineHeight: 18, marginTop: 2 },
  taskItemDate: { fontSize: 11, color: colors.steel, marginTop: 3 },
  statusPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  photoStrip: { marginHorizontal: 12, marginBottom: 10 },
  photo: { width: 80, height: 80, borderRadius: 8, marginRight: 8 },
  // Notes tab
  noteCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  noteDate: { fontSize: 12, color: colors.steel, marginBottom: 4 },
  noteTitle: { fontSize: 16, fontWeight: '700', color: colors.lanternDeep, marginBottom: 8 },
  noteContent: { fontSize: 14, color: colors.steel, lineHeight: 22 },
});
