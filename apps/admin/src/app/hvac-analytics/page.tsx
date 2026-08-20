'use client';
import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { hvacAnalyticsApi } from '@/lib/api';

type Customer = { id: string; name: string; email: string };

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#991B1B', HIGH_ATTENTION: '#991B1B', ATTENTION: '#DC2626', WATCH: '#D97706', INFO: '#2563EB',
};

function CustomerPicker({ selected, onSelect }: { selected: Customer | null; onSelect: (c: Customer) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      hvacAnalyticsApi.searchCustomers(query).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <div ref={wrapRef} className="relative w-80 flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white border border-mist-dim rounded-lg px-3.5 py-2.5 text-sm flex items-center gap-2 text-left"
      >
        <span className="text-steel-quiet">🔍</span>
        <span className="flex-1 font-bold text-ink truncate">{selected ? selected.name : 'Search customers…'}</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-mist-dim rounded-lg shadow-lg overflow-hidden z-10">
          <div className="p-2 border-b border-canvas">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a name or email…"
              className="w-full text-sm px-2.5 py-2 border border-mist-dim rounded-md outline-none focus:border-lantern"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {query.trim().length < 2 ? (
              <div className="px-3.5 py-3 text-xs text-steel-quiet">Type at least 2 characters to search.</div>
            ) : results.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-steel-quiet">No customers match &quot;{query}&quot;.</div>
            ) : (
              results.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setQuery(''); }}
                  className={`px-3.5 py-2.5 text-sm flex items-center justify-between border-b border-canvas last:border-0 cursor-pointer hover:bg-canvas ${selected?.id === c.id ? 'bg-canvas font-bold' : ''}`}
                >
                  <span className="text-ink">{c.name}</span>
                  <span className="text-steel-quiet text-xs">{c.email}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HvacAnalyticsPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customer) { setData(null); return; }
    setLoading(true);
    hvacAnalyticsApi.getForCustomer(customer.id).then(setData).finally(() => setLoading(false));
  }, [customer]);

  const seriesByRole: Record<string, any[]> = {};
  (data?.series ?? []).forEach((r: any) => {
    (seriesByRole[r.analyticsRole] ??= []).push({ ...r, t: new Date(r.recordedAt).toLocaleDateString() });
  });

  const availableRules = (data?.ruleAvailability ?? []).filter((r: any) => r.available);
  const unavailableRules = (data?.ruleAvailability ?? []).filter((r: any) => !r.available);

  return (
    <div>
      <div className="flex items-start justify-between gap-5 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep mb-2">HVAC Analytics</h1>
          <p className="text-steel max-w-xl">Per-customer sensor-backed HVAC trend detection — time series, triggered findings, and which rules can&apos;t run yet due to missing sensors.</p>
        </div>
        <CustomerPicker selected={customer} onSelect={setCustomer} />
      </div>

      {!customer ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">🌡️</div>
          <p className="text-steel text-sm">Search for a customer above to view their HVAC analytics.</p>
        </div>
      ) : loading ? (
        <div className="text-steel text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col gap-5">

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-mist-dim rounded-2xl p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-steel-quiet mb-1.5">Sensors Tagged</div>
              <div className="text-lg font-extrabold text-ink">{data.sensorCoverage.filter((s: any) => s.connected).length} of {data.sensorCoverage.length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-steel-quiet mb-1.5">Rules Available</div>
              <div className="text-lg font-extrabold text-ink">{availableRules.length} of {data.ruleAvailability.length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-steel-quiet mb-1.5">Open Findings</div>
              <div className="text-lg font-extrabold text-ink">{data.findings.filter((f: any) => f.status !== 'RESOLVED' && f.status !== 'DISMISSED').length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-steel-quiet mb-1.5">Findings (30d)</div>
              <div className="text-lg font-extrabold text-ink">{data.findings.length}</div>
            </div>
          </div>

          <div className="bg-white border border-mist-dim rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-extrabold text-ink">Time Series</h2>
              <span className="text-[10.5px] text-steel-quiet">Last 30 days of recorded sensor readings</span>
            </div>
            {Object.keys(seriesByRole).length === 0 ? (
              <div className="text-sm text-steel py-10 text-center">No time-series data recorded yet for this customer&apos;s tagged sensors.</div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(Object.keys(seriesByRole).length, 2)}, 1fr)` }}>
                {Object.entries(seriesByRole).map(([role, points]) => (
                  <div key={role}>
                    <div className="text-xs font-bold text-ink mb-2">{points[0]?.deviceName ?? role} <span className="text-steel-quiet font-normal">({role})</span></div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={points}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F0" />
                        <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#8A9599' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#8A9599' }} width={32} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #DEE6E4' }} />
                        <Line type="monotone" dataKey="value" stroke="#C97F1F" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white border border-mist-dim rounded-2xl p-5">
              <h2 className="text-sm font-extrabold text-ink mb-3">Findings Timeline</h2>
              {data.findings.length === 0 ? (
                <div className="text-sm text-steel py-6 text-center">No findings recorded yet.</div>
              ) : (
                <div className="flex flex-col">
                  {data.findings.map((f: any) => (
                    <div key={f.id} className="flex gap-2.5 py-2.5 border-b border-canvas last:border-0">
                      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: SEVERITY_COLOR[f.severity] ?? '#8A9599' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[10px] font-extrabold tracking-wide text-steel-quiet">{f.ruleId}</span>
                          <span className="text-[10.5px] text-steel-quiet ml-auto">{new Date(f.detectedAt).toLocaleString()}</span>
                        </div>
                        <div className="text-[12.5px] font-semibold text-ink mt-0.5">{f.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-mist-dim rounded-2xl p-5">
              <h2 className="text-sm font-extrabold text-ink mb-3">Sensor Coverage</h2>
              <table className="w-full text-xs">
                <tbody>
                  {data.sensorCoverage.map((s: any) => (
                    <tr key={s.role} className="border-b border-canvas last:border-0">
                      <td className="py-2 pr-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${s.connected ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} />
                        {s.label}
                      </td>
                      <td className="py-2 text-right text-steel">{s.connected ? s.deviceNames.join(', ') : 'Not Installed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-mist-dim rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-extrabold text-ink">Rules Not Available for This Customer</h2>
              <span className="text-[10.5px] text-steel-quiet">{unavailableRules.length} of {data.ruleAvailability.length} spec rules</span>
            </div>
            {unavailableRules.length === 0 ? (
              <div className="text-sm text-steel py-4 text-center">All catalog rules are available for this customer.</div>
            ) : (
              unavailableRules.map((r: any) => {
                const reasons: string[] = [
                  ...r.missingSensorRoles.map((role: string) => `Missing sensor: ${role}`),
                  ...r.requiredIntegrations.map((i: string) => `Requires ${i} (not built)`),
                  ...(r.missingBaseline ? ['Requires baseline history (not yet available)'] : []),
                  ...(!r.implemented ? ['Rule not yet implemented'] : []),
                ];
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-canvas last:border-0">
                    <div>
                      <div className="text-[11px] font-extrabold text-ink tabular-nums">{r.id} <span className="font-normal text-steel">— {r.label}</span></div>
                    </div>
                    <span className="text-[10px] font-bold text-attention bg-[#FEF2F2] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: '#DC2626' }}>
                      {reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}
    </div>
  );
}
