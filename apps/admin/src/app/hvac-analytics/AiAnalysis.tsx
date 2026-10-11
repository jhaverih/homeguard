'use client';
import { useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend } from 'recharts';
import { hvacAnalyticsApi } from '@/lib/api';

const COLORS = ['#2563EB', '#DC2626', '#059669', '#7C3AED', '#D97706'];
const fmtTime = (t: number | string) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'text-green-700 bg-green-50', medium: 'text-amber-700 bg-amber-50', low: 'text-orange-700 bg-orange-50', insufficient_evidence: 'text-steel bg-mist-dim/60',
};

// Technician view (spec §8): correlated events, the annotated chart of the
// sensors behind each, measured facts vs AI interpretation side by side,
// and every statistical anomaly (shadow mode — none of this changes rule
// findings, alerts or component health).
export function AiAnalysis({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  if (!data) return null;
  return (
    <div className="bg-white border border-mist-dim rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-extrabold text-ink">Correlated Events &amp; AI Analysis <span className="text-steel-quiet font-normal">(technician view)</span></h2>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700">Statistics: {data.flags.anomalyDetection ? 'on (shadow)' : 'off'}</span>
          <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">AI explanations: {data.flags.aiExplanations ? 'on' : 'off'}</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">Homeowner AI summary: {data.flags.customerVisible ? 'visible (rule-backed events only)' : 'hidden'}</span>
        </div>
      </div>
      {data.events.length === 0 ? (
        <p className="text-sm text-steel">No correlated events in the last 7 days.</p>
      ) : data.events.map((e: any) => <EventCard key={e.id} event={e} onRefresh={onRefresh} />)}
      <AnomalyTable anomalies={data.anomalies} />
    </div>
  );
}

function EventCard({ event, onRefresh }: { event: any; onRefresh: () => void }) {
  const [queued, setQueued] = useState(false);
  const x = event.explanation;
  const out = x?.output;
  const facts: string[] = [
    ...event.findings.map((f: any) => `${f.ruleId} v${f.ruleVersion} (${f.status.toLowerCase()}): ${f.message}`),
    ...event.anomalies.map((a: any) => `${a.sensorRole} ${a.type.toLowerCase()} (${a.state.toLowerCase()}): ${a.observed}${a.unit} vs median ${a.baseline?.median ?? '—'}${a.unit}, z ${a.robustZ ?? '—'}`),
  ];
  const rerun = async () => { await hvacAnalyticsApi.requestExplanation(event.id); setQueued(true); setTimeout(onRefresh, 4000); };
  return (
    <div className="border border-mist-dim rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-ink">{event.components.join(' + ')} <span className="text-steel-quiet font-normal">· {event.category.toLowerCase()}</span></p>
          <p className="text-xs text-steel">
            Started {fmtTime(event.startedAt)} · last seen {fmtTime(event.lastOccurrenceAt)}
            {event.resolvedAt ? ` · resolved ${fmtTime(event.resolvedAt)}` : ''} · rule severity <b>{event.severity}</b>
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${event.status === 'ACTIVE' ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'}`}>{event.status}</span>
      </div>
      {event.disagreement && <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1">⚖ {event.disagreement}</p>}

      {event.series.length > 0 && <EventChart event={event} />}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-steel mb-1">Measured facts (deterministic)</p>
          <ul className="text-xs text-ink space-y-1">{facts.map((f: string) => <li key={f}>• {f}</li>)}</ul>
          {x?.confidence && (
            <div className="mt-2 text-xs space-y-0.5">
              <p>Anomaly strength: <b>{x.confidence.anomalyStrength}</b> · Evidence: <b>{x.confidence.evidenceCompleteness}</b></p>
              {(x.dataAvailability ?? []).filter((d: any) => d.state !== 'OK').map((d: any) => <p key={d.input} className="text-steel">Missing: {d.input} ({d.state})</p>)}
            </div>
          )}
        </div>
        <div className="bg-violet-50/40 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">AI interpretation {x?.status === 'FALLBACK' && '(deterministic fallback)'}</p>
            <button onClick={rerun} disabled={queued} className="text-xs text-lantern-deep font-semibold hover:underline disabled:opacity-50">{queued ? 'Queued…' : 'Re-run'}</button>
          </div>
          {!out ? <p className="text-xs text-steel">No explanation yet — queued when the event was created.</p> : (
            <div className="text-xs text-ink space-y-2">
              <p className="font-semibold">{out.summary}</p>
              {out.possible_causes?.length > 0 && (
                <div>
                  <p className="font-bold text-steel">Possible causes (ranked, unconfirmed)</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    {out.possible_causes.map((c: any) => (
                      <li key={c.cause}>{c.cause}
                        {c.supporting_evidence?.length > 0 && <p className="text-green-800">+ {c.supporting_evidence.join('; ')}</p>}
                        {c.contradicting_evidence?.length > 0 && <p className="text-red-800">− {c.contradicting_evidence.join('; ')}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p><span className={`px-1.5 py-0.5 rounded ${CONFIDENCE_STYLE[out.confidence_label] ?? ''}`}>{out.confidence_label?.replace('_', ' ')}</span> {out.confidence_rationale}</p>
              {out.recommended_actions?.length > 0 && <p><b>Next steps:</b> {out.recommended_actions.join(' · ')}</p>}
              {out.additional_data_needed?.length > 0 && <p><b>Data that would help:</b> {out.additional_data_needed.join('; ')}</p>}
              {out.technician_message && <p className="whitespace-pre-wrap"><b>Technician:</b> {out.technician_message}</p>}
              {out.customer_message && <p className="text-steel"><b>Homeowner wording (not shown to customers yet):</b> {out.customer_message}</p>}
              {out.safety_note && <p className="text-red-700"><b>Safety:</b> {out.safety_note}</p>}
              <p className="text-[10px] text-steel-quiet">
                {x.model ?? 'no model'} · prompt {x.promptVersion} · detector {x.detectorVersion} · config {x.configVersion} · {x.latencyMs != null ? `${Math.round(x.latencyMs / 1000)}s` : ''} · {fmtTime(x.createdAt)}{x.stale ? ' · evidence changed since' : ''}
              </p>
              {x.rejectionReasons?.length > 0 && <p className="text-[10px] text-amber-800">LLM output not used: {x.rejectionReasons.slice(0, 3).join('; ')}</p>}
              <p className="text-[10px] text-steel-quiet">Refs: {out.evidence_references?.join(', ')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Actual readings on a real time axis, with the detection time, duration,
// resolution and the stored baseline band (median ± threshold·MAD/0.6745).
function EventChart({ event }: { event: any }) {
  const start = new Date(event.startedAt).getTime();
  const end = new Date(event.resolvedAt ?? event.lastOccurrenceAt).getTime();
  const first = event.series[0];
  // Same MAD floor (0.3) the detector uses, so the band matches what it flagged.
  const halfWidth = first?.baseline ? (first.zThreshold * Math.max(first.baseline.mad, 0.3)) / 0.6745 : null;
  const band = first?.baseline && halfWidth != null ? { lo: first.baseline.median - halfWidth, hi: first.baseline.median + halfWidth } : null;
  const all = event.series.flatMap((s: any) => s.points.map((p: any) => p.t));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F0" />
        <XAxis type="number" dataKey="t" domain={[Math.min(...all, start), Math.max(...all, end)]} tickFormatter={fmtTime} tick={{ fontSize: 11, fill: '#8A9599' }} allowDuplicatedCategory={false} />
        <YAxis tick={{ fontSize: 11, fill: '#8A9599' }} width={40} domain={['auto', 'auto']} unit={first?.unit === '°F' ? '°' : ''} />
        <Tooltip labelFormatter={(t) => fmtTime(t as number)} formatter={(v: any, name: any, item: any) => [`${v}${first?.unit ?? ''}${item?.payload?.quality && item.payload.quality !== 'VALID' ? ` (${item.payload.quality})` : ''}`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceArea x1={start} x2={end} fill="#FEE2E2" fillOpacity={0.5} />
        {band && <ReferenceArea y1={band.lo} y2={band.hi} fill="#DBEAFE" fillOpacity={0.35} label={{ value: 'baseline band', position: 'insideTopLeft', fontSize: 10, fill: '#1D4ED8' }} />}
        <ReferenceLine x={start} stroke="#DC2626" strokeDasharray="5 4" label={{ value: `Detected ${new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, position: 'top', fontSize: 11, fill: '#DC2626' }} />
        {event.resolvedAt && <ReferenceLine x={end} stroke="#059669" strokeDasharray="5 4" label={{ value: 'Resolved', position: 'top', fontSize: 11, fill: '#059669' }} />}
        {event.series.map((s: any, i: number) => (
          <Line key={s.deviceRegistryId} data={s.points} dataKey="v" name={s.label} type="monotone" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function AnomalyTable({ anomalies }: { anomalies: any[] }) {
  const shown = anomalies.filter((a) => a.type !== 'ISOLATED');
  const isolated = anomalies.length - shown.length;
  return (
    <div>
      <h3 className="text-sm font-bold text-ink mb-2">Statistical anomalies <span className="text-steel-quiet font-normal">(shadow — never alerts or changes health)</span></h3>
      {shown.length === 0 ? <p className="text-xs text-steel">None in the last 7 days{isolated ? ` (${isolated} isolated single-reading deviations recorded as noise)` : ''}.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-steel"><tr><th className="text-left py-1">Started</th><th className="text-left">Sensor</th><th className="text-left">Type</th><th className="text-left">State</th><th className="text-left">Observed / baseline</th><th className="text-left">z</th><th className="text-left">Context</th><th className="text-left">Data quality</th></tr></thead>
            <tbody className="divide-y divide-canvas">
              {shown.map((a) => (
                <tr key={a.id} className={a.transition ? 'text-steel-quiet' : ''}>
                  <td className="py-1">{fmtTime(a.startedAt)}</td>
                  <td>{a.sensorRole}</td>
                  <td>{a.type}{a.transition ? ' (transition)' : ''}</td>
                  <td>{a.state}{a.inEvent ? ' · in event' : ''}</td>
                  <td>{a.observed}{a.unit} / {a.baseline ? `${a.baseline.median} ± ${a.baseline.mad} (n=${a.baseline.n})` : '—'}</td>
                  <td>{a.robustZ ?? '—'}</td>
                  <td>{a.context ? `${a.context.mode ?? ''} ${a.context.band ?? ''} ${a.context.cycleBucket ?? ''}${a.context.reducedContext ? ' (reduced)' : ''}` : '—'}</td>
                  <td>{a.dataQuality ? `gaps ${a.dataQuality.gaps ?? 0}, dup ${a.dataQuality.duplicates ?? 0}, late ${a.dataQuality.outOfOrder ?? 0}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isolated > 0 && <p className="text-[11px] text-steel mt-1">{isolated} isolated single-reading deviation(s) recorded as noise.</p>}
        </div>
      )}
    </div>
  );
}
