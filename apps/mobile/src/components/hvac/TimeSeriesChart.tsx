import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ChartBand, ChartRange, ChartSeries, FaultMarker } from '../../services/api';
import { colors } from '../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export const SERIES_COLORS = ['#2563EB', '#DC2626', '#059669', '#7C3AED', '#D97706', '#0891B2', '#DB2777'];
const PAD = { top: 34, right: 44, bottom: 26, left: 36 };

type Props = {
  series: ChartSeries[];
  unit: string;
  bands: ChartBand[];
  markers: FaultMarker[];
  from: string;
  to: string;
  range: ChartRange;
  height?: number;
};

const ms = (iso: string) => new Date(iso).getTime();

function timeLabel(t: number, range: ChartRange): string {
  const d = new Date(t);
  if (range === 'day') return d.toLocaleTimeString([], { hour: 'numeric' });
  if (range === 'week') return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const nice = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * step;
  const out: number[] = [];
  for (let v = Math.ceil(min / nice) * nice; v <= max + 1e-9; v += nice) out.push(Math.round(v * 100) / 100);
  return out;
}

// The value in effect at t (latest point at or before it).
function valueAt(points: { t: number; v: number }[], t: number): number | null {
  let last: number | null = null;
  for (const p of points) { if (p.t <= t) last = p.v; else break; }
  return last;
}

// Multi-sensor time-series chart for the HVAC component drill-down: every
// related sensor overlaid on one axis, "System running" bands, a dashed
// marker at each fault's detection time with its active period shaded, and
// a touch-and-drag crosshair showing every sensor's reading at that moment.
export function TimeSeriesChart({ series, unit, bands, markers, from, to, range, height = 240 }: Props) {
  const [width, setWidth] = useState(0);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const draw = useRef(new Animated.Value(0)).current;

  const t0 = ms(from);
  const t1 = ms(to);
  const parsed = useMemo(() => series.map((s, i) => ({
    ...s, color: SERIES_COLORS[i % SERIES_COLORS.length],
    pts: s.points.map((p) => ({ t: ms(p.t), v: p.v })),
  })), [series]);

  const all = parsed.flatMap((s) => s.pts.map((p) => p.v));
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = Math.max(1, (rawMax - rawMin) * 0.12);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  // Line draw-in animation whenever the data or range changes.
  useEffect(() => {
    draw.setValue(0);
    Animated.timing(draw, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [series, range, width, draw]);

  const paths = parsed.map((s) => {
    let d = '';
    let len = 0;
    s.pts.forEach((p, i) => {
      const px = x(p.t);
      const py = y(p.v);
      if (i === 0) { d = `M${px},${py}`; return; }
      const prev = s.pts[i - 1];
      if (s.stepped) {
        d += ` H${px} V${py}`;
        len += Math.abs(px - x(prev.t)) + Math.abs(py - y(prev.v));
      } else {
        d += ` L${px},${py}`;
        len += Math.hypot(px - x(prev.t), py - y(prev.v));
      }
    });
    if (s.stepped && s.pts.length) { d += ` H${x(t1)}`; len += x(t1) - x(s.pts[s.pts.length - 1].t); }
    return { d, len: Math.max(len, 1) };
  });

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: (e) => setScrubX(e.nativeEvent.locationX),
    onPanResponderMove: (e) => setScrubX(e.nativeEvent.locationX),
    onPanResponderRelease: () => setScrubX(null),
    onPanResponderTerminate: () => setScrubX(null),
  }), []);

  const yTicks = niceTicks(yMin, yMax);
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
  const scrubT = scrubX != null ? t0 + ((Math.min(Math.max(scrubX, PAD.left), PAD.left + plotW) - PAD.left) / plotW) * (t1 - t0) : null;
  const visibleMarkers = markers.filter((m) => ms(m.detectedAt) <= t1);

  return (
    <View>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }} {...pan.panHandlers}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {/* gridlines + y axis */}
            {yTicks.map((v) => (
              <G key={`y${v}`}>
                <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y(v) + 4} fontSize={10} fill={colors.steel} textAnchor="end">{v}</SvgText>
              </G>
            ))}
            {xTicks.map((t, i) => (
              <SvgText key={`x${i}`} x={x(t)} y={height - 8} fontSize={10} fill={colors.steel} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{timeLabel(t, range)}</SvgText>
            ))}

            {/* system running / water bands */}
            {bands.map((b, i) => (
              <Rect key={`b${i}`} x={x(Math.max(ms(b.from), t0))} y={PAD.top} width={Math.max(1, x(ms(b.to)) - x(Math.max(ms(b.from), t0)))} height={plotH}
                fill={b.state === 'DETECTED' ? '#DC2626' : b.state === 'HEATING' ? '#F97316' : '#38BDF8'} opacity={0.12} />
            ))}

            {/* fault periods: shaded from detection until resolution (or now) */}
            {visibleMarkers.map((m) => {
              const start = Math.max(ms(m.detectedAt), t0);
              const end = m.resolvedAt ? Math.min(ms(m.resolvedAt), t1) : t1;
              return <Rect key={`f${m.id}`} x={x(start)} y={PAD.top} width={Math.max(1, x(end) - x(start))} height={plotH} fill="#FEE2E2" opacity={0.55} />;
            })}

            {/* sensor lines, drawn in */}
            {parsed.map((s, i) => (
              <AnimatedPath key={s.key} d={paths[i].d} stroke={s.color} strokeWidth={s.stepped ? 1.6 : 2.2} fill="none"
                strokeDasharray={s.stepped ? undefined : [paths[i].len, paths[i].len]}
                strokeDashoffset={s.stepped ? undefined : draw.interpolate({ inputRange: [0, 1], outputRange: [paths[i].len, 0] })}
                opacity={s.stepped ? 0.7 : 1} />
            ))}

            {/* end-of-line value callouts */}
            {parsed.map((s) => {
              const last = s.pts[s.pts.length - 1];
              if (!last) return null;
              return (
                <G key={`c${s.key}`}>
                  <Circle cx={x(last.t)} cy={y(last.v)} r={3.5} fill={s.color} />
                  <SvgText x={Math.min(x(last.t) + 6, width - 2)} y={y(last.v) + 4} fontSize={10} fontWeight="bold" fill={s.color} textAnchor={x(last.t) + 40 > width ? 'end' : 'start'}>
                    {`${Math.round(last.v * 10) / 10}${unit === '%' ? '%' : '°'}`}
                  </SvgText>
                </G>
              );
            })}

            {/* fault markers: dashed line + "Condition detected" pill */}
            {visibleMarkers.map((m, i) => {
              const mx = x(Math.max(ms(m.detectedAt), t0));
              const label = `Condition detected ${clockLabel(m.detectedAt)}`;
              const pillW = label.length * 5.6 + 12;
              const px = Math.min(Math.max(mx - pillW / 2, 2), width - pillW - 2);
              const py = 2 + (i % 2) * 15;
              return (
                <G key={`m${m.id}`}>
                  <Line x1={mx} x2={mx} y1={PAD.top} y2={PAD.top + plotH} stroke="#DC2626" strokeWidth={1.6} strokeDasharray={[5, 4]} />
                  <Rect x={px} y={py} width={pillW} height={16} rx={4} fill="#DC2626" />
                  <SvgText x={px + pillW / 2} y={py + 11.5} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">{label}</SvgText>
                </G>
              );
            })}

            {/* crosshair */}
            {scrubT != null && (
              <G>
                <Line x1={x(scrubT)} x2={x(scrubT)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.ink} strokeWidth={1} opacity={0.5} />
                {parsed.map((s) => {
                  const v = valueAt(s.pts, scrubT);
                  return v == null ? null : <Circle key={`s${s.key}`} cx={x(scrubT)} cy={y(v)} r={4} fill="#fff" stroke={s.color} strokeWidth={2} />;
                })}
              </G>
            )}
          </Svg>
        )}

        {scrubT != null && (
          <View pointerEvents="none" style={[styles.tooltip, { left: Math.min(Math.max(x(scrubT) - 80, 4), Math.max(4, width - 164)) }]}>
            <Text style={styles.tooltipTime}>{new Date(scrubT).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
            {parsed.map((s) => {
              const v = valueAt(s.pts, scrubT);
              return v == null ? null : (
                <View key={`t${s.key}`} style={styles.tooltipRow}>
                  <View style={[styles.swatch, { backgroundColor: s.color }]} />
                  <Text style={styles.tooltipText} numberOfLines={1}>{s.label}: {Math.round(v * 10) / 10}{unit}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.legend}>
        {parsed.map((s) => (
          <View key={`l${s.key}`} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: s.color, opacity: s.stepped ? 0.7 : 1 }]} />
            <Text style={styles.legendText}>{s.label} ({unit})</Text>
          </View>
        ))}
        {bands.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendBlock, { backgroundColor: bands[0].state === 'DETECTED' ? '#FCA5A5' : '#BAE6FD' }]} />
            <Text style={styles.legendText}>{bands[0].label}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: { position: 'absolute', top: 28, width: 160, backgroundColor: 'rgba(18,24,28,0.92)', borderRadius: 8, padding: 8, gap: 3 },
  tooltipTime: { color: '#fff', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tooltipText: { color: '#E5E7EB', fontSize: 11, flex: 1 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 18, height: 3, borderRadius: 2 },
  legendBlock: { width: 14, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: colors.steel },
});
