/**
 * Generates Attenteve app icon PNGs from the SVG source (matches the icon
 * defined in Q:\homeguard\Assets\Marketing\attenteve-brand-guidelines.html).
 * Run: node scripts/generate-icons.mjs
 * Requires: npx --yes @resvg/resvg-js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const ICON_BG = '#1B2529';
const LANTERN = '#F2A93C';
const MIST = '#EDF1F0';

// Full icon: rounded-square badge, signal-arc, house glyph.
const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
  <rect width="512" height="512" rx="112" fill="${ICON_BG}"/>
  <path d="M 224 262 A 62 62 0 0 1 288 262" fill="none" stroke="${LANTERN}" stroke-width="26" stroke-linecap="round"/>
  <polygon points="256,296 190,354 322,354" fill="${MIST}"/>
  <rect x="204" y="354" width="104" height="86" rx="10" fill="${MIST}"/>
</svg>`;

// Notification tray icon: Android requires a plain white alpha-masked
// silhouette (no color/background) — the OS applies the tint at display time.
const notificationSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="192" height="192">
  <path d="M 224 262 A 62 62 0 0 1 288 262" fill="none" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/>
  <polygon points="256,296 190,354 322,354" fill="#FFFFFF"/>
  <rect x="204" y="354" width="104" height="86" rx="10" fill="#FFFFFF"/>
</svg>`;

try {
  const { Resvg } = await import('@resvg/resvg-js');

  const render = (svg, size) => {
    const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    return r.render().asPng();
  };

  writeFileSync(join(assetsDir, 'icon.png'), render(svgSource, 1024));
  console.log('✓ icon.png (1024x1024)');

  writeFileSync(join(assetsDir, 'adaptive-icon.png'), render(svgSource, 1024));
  console.log('✓ adaptive-icon.png (1024x1024)');

  writeFileSync(join(assetsDir, 'favicon.png'), render(svgSource, 196));
  console.log('✓ favicon.png (196x196)');

  writeFileSync(join(assetsDir, 'notification-icon.png'), render(notificationSvg, 192));
  console.log('✓ notification-icon.png (192x192, white silhouette)');

  // Splash: same dark background as the icon badge, icon centered — seamless edge.
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1284 2778" width="1284" height="2778">
    <rect width="1284" height="2778" fill="${ICON_BG}"/>
    <g transform="translate(392, 1089)">${svgSource.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
  </svg>`;
  writeFileSync(join(assetsDir, 'splash.png'), render(splashSvg, 1284));
  console.log('✓ splash.png');

  console.log('\nDone! Run `npx expo start --clear` to see new icons.');
} catch {
  console.log('Install @resvg/resvg-js first:');
  console.log('  npm install @resvg/resvg-js --save-dev');
  console.log('  node scripts/generate-icons.mjs');
}
