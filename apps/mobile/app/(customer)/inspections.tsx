import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { inspectionsApi } from '../../src/services/api';

export default function InspectionHistoryScreen() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data: any = await inspectionsApi.getHistory();
      setNotes(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1e3a5f" size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>Inspection History</Text>

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
              <Text style={styles.photoCount}>📷 {note.photoUrls.length} photo(s)</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#1e3a5f', margin: 16 },
  emptyCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 22 },
  noteCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  noteDate: { fontSize: 12, color: '#888', marginBottom: 4 },
  noteTitle: { fontSize: 16, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  noteContent: { fontSize: 14, color: '#555', lineHeight: 22 },
  photoCount: { fontSize: 13, color: '#4299e1', marginTop: 8 },
});
