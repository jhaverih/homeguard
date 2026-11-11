import { Stack, router } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../../src/store/auth.store';
import { userApi } from '../../src/services/api';
import { colors } from '../../src/theme';

// Everything a vendor sees until their company is approved — the application
// checklist and its edit screens, nothing else. (vendor)/_layout sends any
// vendor whose company isn't APPROVED here; index.tsx sends them back once it is.
function HeaderActions() {
  const { user, setUser, logout } = useAuthStore();

  const switchToCustomer = async () => {
    try {
      const updated: any = await userApi.switchRole('CUSTOMER');
      setUser(updated);
      router.replace('/(customer)');
    } catch {}
  };

  return (
    <View style={styles.row}>
      {user?.roles.includes('CUSTOMER') && (
        <TouchableOpacity style={styles.btn} onPress={switchToCustomer}>
          <Text style={styles.btnText}>Homeowner</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.btn, styles.signOut]} onPress={() => logout()}>
        <Text style={styles.btnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function VendorOnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.mist,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Your Application', headerRight: () => <HeaderActions /> }} />
      <Stack.Screen name="company" options={{ title: 'Company Details' }} />
      <Stack.Screen name="photo" options={{ title: 'Profile Photo' }} />
      <Stack.Screen name="services" options={{ title: 'Services & Licenses' }} />
      <Stack.Screen name="area" options={{ title: 'Service Area' }} />
      <Stack.Screen name="documents" options={{ title: 'Registration & Insurance' }} />
      <Stack.Screen name="background-check" options={{ title: 'Background Checks' }} />
      <Stack.Screen name="submission" options={{ title: 'Your Submission' }} />
      <Stack.Screen name="credentials" options={{ title: 'Credentials', headerBackVisible: false, gestureEnabled: false, headerRight: () => <HeaderActions /> }} />
      <Stack.Screen name="payouts" options={{ title: 'Set Up Payouts', headerBackVisible: false, gestureEnabled: false, headerRight: () => <HeaderActions /> }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginRight: 8 },
  btn: { backgroundColor: colors.lanternDeep, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  signOut: { backgroundColor: colors.slate },
  btnText: { color: colors.surface, fontSize: 12, fontWeight: '600' },
});
