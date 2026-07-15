import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const scales: Record<Size, number> = { sm: 0.6, md: 1, lg: 1.4, xl: 1.9 };

// The icon badge is a fixed brand mark (dark chip + mist glyph) regardless of
// placement — only the wordmark text adapts to the surface it sits on, per
// the brand guidelines. `onDark` is kept on AttenteveIcon for prop-API
// compatibility with existing call sites; it doesn't change the icon itself.
export function AttenteveIcon({ size = 'md' }: { size?: Size; onDark?: boolean }) {
  const s = scales[size];
  const dim = Math.round(44 * s);
  const radius = Math.round(dim * 0.22);
  const iconSize = Math.round(22 * s);

  return (
    <View style={{
      width: dim, height: dim, borderRadius: radius,
      backgroundColor: '#1B2529',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name="home" size={iconSize} color="#EDF1F0" />
    </View>
  );
}

export function AttenteveLogo({ size = 'md', onDark = false }: { size?: Size; onDark?: boolean }) {
  const s = scales[size];
  const fontSize = Math.round(28 * s);
  const gap = Math.round(10 * s);
  const wordmarkColor = onDark ? '#EDF1F0' : '#12181C';
  const eveColor = onDark ? '#F2A93C' : '#C97F1F';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <AttenteveIcon size={size} />
      <Text style={{ fontSize, fontWeight: '600', color: wordmarkColor, letterSpacing: -0.5 }}>
        Attent<Text style={{ color: eveColor }}>eve</Text>
      </Text>
    </View>
  );
}
