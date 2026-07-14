import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HoumiIcon, HoumiLogo } from '../../src/components/HoumiLogo';
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
        headerStyle: { backgroundColor: '#0B4A45' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#0B4A45',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: () => <HoumiLogo size="sm" onDark />, tabBarIcon: ({ color }) => <HoumiIcon size="sm" onDark={false} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Open Jobs', tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} /> }} />
      <Tabs.Screen name="active-job" options={{ href: null, title: 'Active Job' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="capabilities" options={{ href: null, title: 'My Capabilities' }} />
      <Tabs.Screen name="certifications" options={{ href: null, title: 'My Certifications' }} />
      <Tabs.Screen name="company-application" options={{ href: null, title: 'Company Application' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: '#0B4A45', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
