import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/auth.store';
import { colors } from '../src/theme';

export default function Index() {
  const { loadFromStorage, user, isLoading } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/(auth)/login');
      } else if (user.activeRole === 'VENDOR') {
        router.replace('/(vendor)');
      } else {
        router.replace('/(customer)');
      }
    }
  }, [user, isLoading]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas }}>
      <ActivityIndicator size="large" color={colors.lanternDeep} />
    </View>
  );
}
