import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onboardingApi, VendorApplication, ChecklistItem } from '../services/api';

// Loads the vendor's application each time a screen comes into focus, so the
// checklist reflects edits made on the other application screens.
export function useVendorApplication() {
  const [app, setApp] = useState<VendorApplication | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setApp(await onboardingApi.get());
    } catch (e: any) {
      Alert.alert('Could not load your application', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const item = (key: ChecklistItem['key']) => app?.checklist.items.find((i) => i.key === key);

  return { app, setApp, loading, reload, item };
}
