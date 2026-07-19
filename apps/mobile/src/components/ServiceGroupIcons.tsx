import Svg, { Path, Rect } from 'react-native-svg';

// Transcribed from Q:\homeguard\Assets\Marketing\Service Icons\final\icon-*.svg
// (viewBox 0 0 24 24, stroke-width 1.7, round caps/joins) — same
// hand-transcribed-SVG pattern already used by AttenteveLogo.tsx, rather than
// bundling the source PNG/SVG files as image assets, so color (active vs.
// inactive tile state) can be driven the same way the rest of this card does.
type IconProps = { size?: number; color?: string };

export function InspectIcon({ size = 22, color = '#C97F1F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={4} width={14} height={17} rx={2} />
      <Rect x={9} y={2.3} width={6} height={3} rx={1} />
      <Path d="M8.5 11.5l1.8 1.8L13.5 9.5" />
      <Path d="M8.5 16.3h7" />
    </Svg>
  );
}

export function RepairIcon({ size = 22, color = '#C97F1F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94z" />
    </Svg>
  );
}

export function ImproveIcon({ size = 22, color = '#C97F1F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3a6 6 0 00-3.5 10.9c.6.45 1 1.15 1 1.9v.4h5v-.4c0-.75.4-1.45 1-1.9A6 6 0 0012 3z" />
      <Path d="M9.5 18.3h5M10.3 21h3.4" />
    </Svg>
  );
}

export function MaintainIcon({ size = 22, color = '#C97F1F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={5} width={16} height={15} rx={2} />
      <Path d="M4 9.5h16M8 3v3.5M16 3v3.5" />
      <Path d="M8.5 14.2l2 2 4.5-4.5" />
    </Svg>
  );
}

// INSTALL merged into IMPROVE 2026-07-19 — removed here, see service-group.enum.ts.

export function MarketplaceIcon({ size = 22, color = '#C97F1F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9l1.2-4.5h13.6L20 9" />
      <Path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" />
      <Rect x={5} y={11} width={14} height={9} rx={1} />
      <Path d="M10 20v-4a2 2 0 014 0v4" />
    </Svg>
  );
}
