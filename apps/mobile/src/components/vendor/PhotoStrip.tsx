import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

// Extracted verbatim from app/(vendor)/active-job.tsx — a pure, closure-free
// component, so also reused by the bundle "Close All" flow (bundle-close-all.tsx)
// without any risk to the original single-job screen's behavior.
export function PhotoStrip({
  photos, onAdd, onRemove, maxPhotos = 5, uploading, readOnly = false,
}: {
  photos: { uri: string; key?: string }[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  maxPhotos?: number;
  uploading: boolean;
  readOnly?: boolean;
}) {
  return (
    <View style={ps.row}>
      {photos.map((p, i) => (
        <View key={i} style={ps.thumb}>
          <Image source={{ uri: p.uri }} style={ps.img} />
          {!readOnly && (
            <TouchableOpacity style={ps.removeBtn} onPress={() => onRemove(i)}>
              <Ionicons name="close-circle" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {!p.key && <ActivityIndicator style={ps.spinner} size="small" color="#fff" />}
        </View>
      ))}
      {!readOnly && photos.length < maxPhotos && (
        <TouchableOpacity style={ps.addBtn} onPress={onAdd} disabled={uploading}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.lanternDeep} />
            : <><Ionicons name="camera" size={22} color={colors.lanternDeep} /><Text style={ps.addText}>Photo</Text></>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const ps = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  img: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10 },
  spinner: { position: 'absolute', bottom: 4, left: 4 },
  addBtn: { width: 76, height: 76, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lanternDeep, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  addText: { fontSize: 11, color: colors.lanternDeep, marginTop: 2, fontWeight: '600' },
});
