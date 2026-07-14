export function Logo({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  const wordmarkColor = onDark ? '#EDF1F0' : '#12181C';
  const eveColor = onDark ? '#F2A93C' : '#C97F1F';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#1B2529" />
        <path d="M 224 262 A 62 62 0 0 1 288 262" fill="none" stroke="#F2A93C" strokeWidth="26" strokeLinecap="round" />
        <polygon points="256,296 190,354 322,354" fill="#EDF1F0" />
        <rect x="204" y="354" width="104" height="86" rx="10" fill="#EDF1F0" />
      </svg>
      <span
        className="font-display"
        style={{ fontSize: size * 0.72, fontWeight: 600, letterSpacing: '-0.01em', color: wordmarkColor, whiteSpace: 'nowrap' }}
      >
        Attent<span style={{ color: eveColor }}>eve</span>
      </span>
    </div>
  );
}
