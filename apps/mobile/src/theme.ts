// Attenteve brand tokens — single source of truth for color across the app.
// Screens should import from here instead of hardcoding hex values.

export const colors = {
  // Palette (from Q:\homeguard\Assets\Marketing\attenteve-brand-guidelines.html)
  ink: '#12181C',
  slate: '#26333A',
  slateSoft: '#33424A',
  lantern: '#F2A93C',
  lanternDeep: '#C97F1F',
  mist: '#EDF1F0',
  mistDim: '#DCE4E2',
  steel: '#5B6B70',
  canvas: '#F5F7F6',
  surface: '#FFFFFF',
  border: '#DEE6E4',

  // Semantic status colors — not brand colors, left as-is from prior palette
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
} as const;

// Common role aliases, so most screens only need these few names.
export const theme = {
  background: colors.canvas,
  surface: colors.surface,
  text: colors.ink,
  textMuted: colors.steel,
  border: colors.border,
  accent: colors.lantern,
  accentText: colors.lanternDeep, // accent color when used as text on a light background
  onDarkPanel: colors.ink,
  onDarkText: colors.mist,
  onDarkTextMuted: colors.mistDim,
} as const;
