import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { subscriptionsApi, LaunchFeatures } from '../services/api';

// Proactive and home monitoring aren't launched yet: the API reports whether
// this user may see them (preview testers, or a customer already on an
// unlaunched plan for monitoring) — see apps/api/src/common/constants/launch.ts.
// Hidden until the answer arrives, so nothing unlaunched flashes on screen.
const HIDDEN: LaunchFeatures = { proactive: false, monitoring: false };
const cache = new Map<string, LaunchFeatures>();

export function useLaunchFeatures(): LaunchFeatures {
  const userId = useAuthStore((s) => s.user?.id);
  const [features, setFeatures] = useState<LaunchFeatures>(() => (userId && cache.get(userId)) || HIDDEN);

  useEffect(() => {
    if (!userId) { setFeatures(HIDDEN); return; }
    let live = true;
    subscriptionsApi.getFeatures()
      .then((f) => { cache.set(userId, f); if (live) setFeatures(f); })
      .catch(() => {});
    return () => { live = false; };
  }, [userId]);

  return features;
}
