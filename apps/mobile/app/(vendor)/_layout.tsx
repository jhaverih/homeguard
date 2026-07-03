import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi } from '../../src/services/api';

function RoleSwitcher() {
  const { user, setUser } = useAuthStore();
  if (!user?.roles.includes('CUSTOMER')) return null;

  const switchToCustomer = async () => {
    try {
      const updated: any = await userApi.switchRole('CUSTOMER');
      setUser(updated);
      router.replace('/(customer)');
    } catch (e) {}
  };

  return (
    <TouchableOpacity style={styles.switchBtn} onPress={switchToCustomer}>
      <Text style={styles.switchText}>Switch to Homeowner</Text>
    </TouchableOpacity>
  );
}

export default function VendorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <RoleSwitcher />,
        headerStyle: { backgroundColor: '#2d4a22' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#2d4a22',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Ionicons name="grid" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Open Jobs', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="my-jobs"
        options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }}
      />
      <Tabs.Screen name="active-job" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: '#1e3a5f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
