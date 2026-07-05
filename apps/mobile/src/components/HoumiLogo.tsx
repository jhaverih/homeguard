import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const scales: Record<Size, number> = { sm: 0.6, md: 1, lg: 1.4, xl: 1.9 };

export function HoumiIcon({ size = 'md', onDark = false }: { size?: Size; onDark?: boolean }) {
  const s = scales[size];
  const dim = Math.round(44 * s);
  const radius = Math.round(12 * s);
  const iconSize = Math.round(22 * s);
  const badgeDim = Math.round(18 * s);
  const badgeRadius = Math.round(9 * s);
  const checkSize = Math.round(10 * s);

  return (
    <View style={{ width: dim, height: dim }}>
      <View style={{
        width: dim, height: dim, borderRadius: radius,
        backgroundColor: onDark ? '#FFFFFF' : '#0B4A45',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="home" size={iconSize} color={onDark ? '#0B4A45' : '#FFFFFF'} />
      </View>
      <View style={{
        position: 'absolute', bottom: -Math.round(4 * s), right: -Math.round(4 * s),
        width: badgeDim, height: badgeDim, borderRadius: badgeRadius,
        backgroundColor: '#FF7A45',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: Math.round(2 * s), borderColor: onDark ? '#0B4A45' : '#FFFFFF',
      }}>
        <Ionicons name="checkmark" size={checkSize} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function HoumiLogo({ size = 'md', onDark = false }: { size?: Size; onDark?: boolean }) {
  const s = scales[size];
  const fontSize = Math.round(28 * s);
  const gap = Math.round(10 * s);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <HoumiIcon size={size} onDark={onDark} />
      <Text style={{
        fontSize, fontWeight: '800',
        color: onDark ? '#FFFFFF' : '#0B4A45',
        letterSpacing: -0.5,
      }}>
        Houmi
      </Text>
    </View>
  );
}
