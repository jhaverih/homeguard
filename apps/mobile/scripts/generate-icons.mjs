/**
 * Generates Houmi app icon PNGs from the SVG source.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install -g sharp-cli  OR  npx --yes @resvg/resvg-js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#17897D"/>
      <stop offset="1" stop-color="#0B4A45"/>
    </linearGradient>
    <linearGradient id="badge" x1="296" y1="330" x2="404" y2="438" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF8A5B"/>
      <stop offset="1" stop-color="#F2632E"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="118" ry="118" fill="url(#bg)"/>
  <ellipse cx="256" cy="416" rx="118" ry="16" fill="#04211E" opacity="0.25"/>
  <path d="M214,88 Q256,54 298,88" fill="none" stroke="#FF8A5B" stroke-width="9" stroke-linecap="round" opacity="0.55"/>
  <path d="M230,97 Q256,77 282,97" fill="none" stroke="#FF8A5B" stroke-width="10" stroke-linecap="round" opacity="0.85"/>
  <circle cx="256" cy="112" r="9" fill="#FF8A5B"/>
  <polygon points="256,146 146,262 366,262" fill="#FFFFFF"/>
  <rect x="176" y="262" width="160" height="146" rx="18" fill="#FFFFFF"/>
  <rect x="200" y="296" width="42" height="42" rx="10" fill="#0B4A45"/>
  <circle cx="350" cy="384" r="54" fill="#0B4A45"/>
  <circle cx="350" cy="384" r="46" fill="url(#badge)"/>
  <path d="M328,384 L344,400 L376,364" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
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

  // Splash: teal background with centered icon
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1284 2778" width="1284" height="2778">
    <rect width="1284" height="2778" fill="#0B4A45"/>
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
