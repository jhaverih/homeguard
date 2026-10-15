import { ReactNode, useMemo } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import { router } from 'expo-router';

const EDGE = 24;      // px from the left edge where the swipe must start
const DISTANCE = 70;  // px to the right that counts as "go back"

// Swipe right from the left edge → previous screen. The customer screens are
// tabs (hidden ones for drill-downs), and tabs have no native back swipe on
// iOS. Android's system back gesture already does this (with the tab
// navigator's history back behaviour), so this only listens on iOS.
// Touches starting away from the edge (e.g. chart scrubbing) are untouched.
export function EdgeSwipeBack({ children, fallback }: { children: ReactNode; fallback: string }) {
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (e) => Platform.OS === 'ios' && e.nativeEvent.pageX <= EDGE,
    onPanResponderRelease: (_e, g) => {
      if (g.dx > DISTANCE && Math.abs(g.dy) < g.dx) {
        if (router.canGoBack()) router.back();
        else router.replace(fallback as any);
      }
    },
  }), [fallback]);
  return <View style={{ flex: 1 }} {...pan.panHandlers}>{children}</View>;
}
