import { View, Text } from 'react-native';
import Svg, { Rect, Path, Polygon } from 'react-native-svg';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const scales: Record<Size, number> = { sm: 0.6, md: 1, lg: 1.4, xl: 1.9 };

// The "Signal Rings" mark — a house silhouette with quiet arcs rising from
// the roofline — per Q:\homeguard\Assets\Marketing\attenteve-brand-guidelines.html.
// Geometry matches the guideline's exact viewBox/path/polygon coordinates at
// its two smallest documented tiers (rings drop below ~32px); nothing in
// this app renders below the "sm" size, so the guideline's 20px
// house-only-no-rings tier isn't needed here.
const HOUSE_ROOF = '256,296 190,354 322,354';
const HOUSE_BODY = { x: 204, y: 354, width: 104, height: 86, rx: 10 };

// The icon badge is a fixed brand mark (dark chip + mist glyph) regardless of
// placement — only the wordmark text adapts to the surface it sits on, per
// the brand guidelines. `onDark` is kept on AttenteveIcon for prop-API
// compatibility with existing call sites; it doesn't change the icon itself.
export function AttenteveIcon({ size = 'md' }: { size?: Size; onDark?: boolean }) {
  const s = scales[size];
  const dim = Math.round(44 * s);
  const radius = Math.round(dim * 0.22);
  const svgSize = Math.round(dim * 0.86);
  const showAllRings = size !== 'sm';

  return (
    <View style={{
      width: dim, height: dim, borderRadius: radius,
      backgroundColor: '#1B2529',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Svg width={svgSize} height={svgSize} viewBox="0 0 512 512">
        {showAllRings && (
          <>
            <Path d="M 176 210 A 130 130 0 0 1 336 210" fill="none" stroke="#F2A93C" strokeWidth={20} strokeLinecap="round" opacity={0.4} />
            <Path d="M 200 236 A 96 96 0 0 1 312 236" fill="none" stroke="#F2A93C" strokeWidth={20} strokeLinecap="round" opacity={0.65} />
          </>
        )}
        <Path d="M 224 262 A 62 62 0 0 1 288 262" fill="none" stroke="#F2A93C" strokeWidth={showAllRings ? 20 : 26} strokeLinecap="round" />
        <Polygon points={HOUSE_ROOF} fill="#EDF1F0" />
        <Rect {...HOUSE_BODY} fill="#EDF1F0" />
      </Svg>
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
