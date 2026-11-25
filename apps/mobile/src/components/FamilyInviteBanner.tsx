import { useCallback, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { familyApi, FamilyInviteInfo } from '../services/api';
import { colors } from '../theme';

// Shown on the customer home screen when someone invited this user to their
// home (apps/api/src/family). Tapping opens the invitation to accept or
// decline. Shows nothing when there are no open invitations.
export function FamilyInviteBanner() {
  const [invite, setInvite] = useState<FamilyInviteInfo | null>(null);

  useFocusEffect(useCallback(() => {
    familyApi.received().then((list) => setInvite(list[0] ?? null)).catch(() => setInvite(null));
  }, []));

  if (!invite) return null;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/family-invite', params: { code: invite.code } })}
      accessibilityRole="button"
    >
      <Ionicons name="home" size={24} color={colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{invite.inviterName} invited you to join their home</Text>
        <Text style={styles.link}>See the invitation ›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 14,
    backgroundColor: colors.lantern, borderWidth: 1, borderColor: colors.lanternDeep,
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink },
  link: { fontSize: 13.5, fontWeight: '800', color: colors.ink, marginTop: 4 },
});
