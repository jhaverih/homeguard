import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { useAlertsStore } from '../../src/store/alerts.store';
import { userApi } from '../../src/services/api';
import { AttenteveIcon, AttenteveLogo } from '../../src/components/AttenteveLogo';
import { colors } from '../../src/theme';

// "eve" always renders in the lantern accent color, matching the logo's
// wordmark rule (AttenteveLogo.tsx) — applied here since a Tabs.Screen
// `title` string can't carry per-substring color.
function EveAiTitle() {
  return (
    <Text style={{ fontSize: 17, fontWeight: '700' }}>
      <Text style={{ color: colors.lantern }}>eve</Text>
      <Text style={{ color: colors.mist }}>Ai</Text>
    </Text>
  );
}

function RoleSwitcher() {
  const { user, setUser } = useAuthStore();
  if (!user?.roles.includes('VENDOR')) return null;

  const switchToVendor = async () => {
    try {
      const updated: any = await userApi.switchRole('VENDOR');
      setUser(updated);
      router.replace('/(vendor)');
    } catch (e) {}
  };

  return (
    <TouchableOpacity style={styles.switchBtn} onPress={switchToVendor}>
      <Text style={styles.switchText}>Switch to Provider</Text>
    </TouchableOpacity>
  );
}

export default function CustomerLayout() {
  const { unreadCount } = useAlertsStore();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerRight: () => <RoleSwitcher />,
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.mist,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.lanternDeep,
        tabBarInactiveTintColor: colors.steel,
        tabBarStyle: { borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 4, height: 58 },
        // 7 visible tabs share the bar width — default per-item padding plus
        // 11px labels was clipping the longer ones ("My Services",
        // "Schedule") without even an ellipsis. Tighter item padding + a
        // slightly smaller label gives every tab enough room.
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: () => <AttenteveLogo size="sm" onDark />,
          tabBarIcon: ({ color, focused }) => <AttenteveIcon size="sm" onDark={false} />,
        }}
      />
      <Tabs.Screen
        name="my-services"
        options={{ title: 'Services', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }}
      />
      <Tabs.Screen name="request" options={{ href: null, title: 'Book Service' }} />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="inspections"
        options={{ title: 'History', tabBarIcon: ({ color }) => <Ionicons name="time" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="subscribe"
        options={{ title: 'My Plan', tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Monitoring',
          tabBarIcon: ({ color }) => <Ionicons name="pulse" size={22} color={color} />,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#dc2626', color: '#fff', fontSize: 10 },
        }}
      />
      <Tabs.Screen name="payments" options={{ href: null, title: 'Payments' }} />
      <Tabs.Screen name="request-detail" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null, title: 'eveAi', headerTitle: () => <EveAiTitle /> }} />
      <Tabs.Screen name="approvals" options={{ href: null, title: 'Approvals' }} />
      <Tabs.Screen name="dispute" options={{ href: null, title: 'Dispute' }} />
      <Tabs.Screen name="inspection-report" options={{ href: null, title: 'Assessment Report' }} />
      <Tabs.Screen name="marketplace-house-cleaning" options={{ href: null, title: 'House Cleaning' }} />
      <Tabs.Screen name="marketplace-lawncare" options={{ href: null, title: 'Lawncare' }} />
      <Tabs.Screen name="marketplace-pest-control" options={{ href: null, title: 'Pest Control' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: colors.lanternDeep, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
