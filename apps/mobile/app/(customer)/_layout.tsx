import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi } from '../../src/services/api';

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
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerRight: () => <RoleSwitcher />,
        headerStyle: { backgroundColor: '#1e3a5f' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#1e3a5f',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="request"
        options={{ title: 'Book', tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={22} color={color} /> }}
      />
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
      <Tabs.Screen name="request-detail" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null, title: 'AI Assistant' }} />
      <Tabs.Screen name="approvals" options={{ href: null, title: 'Approvals' }} />
      <Tabs.Screen name="dispute" options={{ href: null, title: 'Dispute' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: '#2d7d46', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
