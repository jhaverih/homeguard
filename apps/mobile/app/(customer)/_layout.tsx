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
      <Text style={styles.switchText}>Switch to Vendor</Text>
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
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="request"
        options={{ title: 'Request', tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="inspections"
        options={{ title: 'History', tabBarIcon: ({ color }) => <Ionicons name="document-text" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alerts', tabBarIcon: ({ color }) => <Ionicons name="notifications" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  switchBtn: { marginRight: 16, backgroundColor: '#2d7d46', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
