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
  // The full alphabetical roster, fetched once on first open and filtered
  // client-side as the admin types — no per-keystroke network round trip.
  const [allCustomers, setAllCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open || allCustomers !== null) return;
    hvacAnalyticsApi.searchCustomers('')
      .then(setAllCustomers)
      .catch(() => setLoadError(true));
  }, [open, allCustomers]);

  const q = query.trim().toLowerCase();
  const results = allCustomers === null ? [] : q === ''
    ? allCustomers
    : allCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));

  return (
    <div ref={wrapRef} className="relative w-80 flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white border border-mist-dim rounded-lg px-4 py-3 text-base flex items-center gap-2.5 text-left"
      >
        <span className="text-steel-quiet">🔍</span>
        <span className="flex-1 font-bold text-ink truncate">{selected ? selected.name : 'Select a customer…'}</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-mist-dim rounded-lg shadow-lg overflow-hidden z-10">
          <div className="p-2.5 border-b border-canvas">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or email…"
              className="w-full text-base px-3 py-2.5 border border-mist-dim rounded-md outline-none focus:border-lantern"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loadError ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">Couldn&apos;t load customers. Close and reopen to retry.</div>
            ) : allCustomers === null ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">Loading customers…</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">No customers match &quot;{query}&quot;.</div>
            ) : (
              results.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setQuery(''); }}
                  className={`px-4 py-3 text-base flex items-center justify-between border-b border-canvas last:border-0 cursor-pointer hover:bg-canvas ${selected?.id === c.id ? 'bg-canvas font-bold' : ''}`}
                >
                  <span className="text-ink">{c.name}</span>
                  <span className="text-steel-quiet text-sm">{c.email}</span>
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!customer) { setData(null); setError(false); return; }
    setLoading(true);
    setError(false);
    hvacAnalyticsApi.getForCustomer(customer.id)
      .then(setData)
      .catch(() => { setData(null); setError(true); })
      .finally(() => setLoading(false));
  }, [customer]);

  const seriesByRole: Record<string, any[]> = {};
  (data?.series ?? []).forEach((r: any) => {
    (seriesByRole[r.analyticsRole] ??= []).push({ ...r, t: new Date(r.recordedAt).toLocaleDateString() });
  });

  const availableRules = (data?.ruleAvailability ?? []).filter((r: any) => r.available);
  const unavailableRules = (data?.ruleAvailability ?? []).filter((r: any) => !r.available);

  return (
    <div>
      <div className="flex items-start justify-between gap-5 flex-wrap mb-7">
        <div>
          <h1 className="text-3xl font-bold text-lantern-deep mb-2">HVAC Analytics</h1>
          <p className="text-steel text-base max-w-xl">Per-customer sensor-backed HVAC trend detection — time series, triggered findings, and which rules can&apos;t run yet due to missing sensors.</p>
        </div>
        <CustomerPicker selected={customer} onSelect={setCustomer} />
      </div>

      {!customer ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-14 text-center">
          <div className="text-5xl mb-4">🌡️</div>
          <p className="text-steel text-base">Search for a customer above to view their HVAC analytics.</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-14 text-center">
          <p className="text-steel text-base">Couldn&apos;t load analytics for {customer.name}. Try selecting them again.</p>
        </div>
      ) : loading || !data ? (
        // `!data` guards the render that lands right after a customer is
        // first selected: setCustomer/setLoading(true) land in the same
        // click handler, but the effect that actually calls setLoading(true)
        // only runs after this render commits — so there's one render where
        // `loading` is still false and `data` is still null. Checking both
        // (instead of just `loading`) stops that render from reaching into
        // `data.sensorCoverage` etc. on null and crashing.
        <div className="text-steel text-base">Loading...</div>
      ) : (
        <div className="flex flex-col gap-6">

          <div className="grid grid-cols-4 gap-6">
            <div className="bg-white border border-mist-dim rounded-2xl p-7">
              <div className="text-sm font-extrabold uppercase tracking-wide text-steel-quiet mb-2.5">Sensors Tagged</div>
              <div className="text-4xl font-extrabold text-ink tabular-nums">{data.sensorCoverage.filter((s: any) => s.connected).length} of {data.sensorCoverage.length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-7">
              <div className="text-sm font-extrabold uppercase tracking-wide text-steel-quiet mb-2.5">Rules Available</div>
              <div className="text-4xl font-extrabold text-ink tabular-nums">{availableRules.length} of {data.ruleAvailability.length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-7">
              <div className="text-sm font-extrabold uppercase tracking-wide text-steel-quiet mb-2.5">Open Findings</div>
              <div className="text-4xl font-extrabold text-ink tabular-nums">{data.findings.filter((f: any) => f.status !== 'RESOLVED' && f.status !== 'DISMISSED').length}</div>
            </div>
            <div className="bg-white border border-mist-dim rounded-2xl p-7">
              <div className="text-sm font-extrabold uppercase tracking-wide text-steel-quiet mb-2.5">Findings (30d)</div>
              <div className="text-4xl font-extrabold text-ink tabular-nums">{data.findings.length}</div>
            </div>
          </div>

          <div className="bg-white border border-mist-dim rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-ink">Time Series</h2>
              <span className="text-sm text-steel-quiet">Last 30 days of recorded sensor readings</span>
            </div>
            {Object.keys(seriesByRole).length === 0 ? (
              <div className="text-base text-steel py-10 text-center">No time-series data recorded yet for this customer&apos;s tagged sensors.</div>
            ) : (
              <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(Object.keys(seriesByRole).length, 2)}, 1fr)` }}>
                {Object.entries(seriesByRole).map(([role, points]) => (
                  <div key={role}>
                    <div className="text-sm font-bold text-ink mb-2">{points[0]?.deviceName ?? role} <span className="text-steel-quiet font-normal">({role})</span></div>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={points}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F0" />
                        <XAxis dataKey="t" tick={{ fontSize: 12, fill: '#8A9599' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#8A9599' }} width={36} />
                        <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #DEE6E4' }} />
                        <Line type="monotone" dataKey="value" stroke="#C97F1F" strokeWidth={2.5} dot={{ r: 2.5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-mist-dim rounded-2xl p-6">
              <h2 className="text-base font-extrabold text-ink mb-4">Findings Timeline</h2>
              {data.findings.length === 0 ? (
                <div className="text-base text-steel py-6 text-center">No findings recorded yet.</div>
              ) : (
                <div className="flex flex-col">
                  {data.findings.map((f: any) => (
                    <div key={f.id} className="flex gap-3 py-3 border-b border-canvas last:border-0">
                      <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: SEVERITY_COLOR[f.severity] ?? '#8A9599' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2.5 flex-wrap">
                          <span className="text-xs font-extrabold tracking-wide text-steel-quiet">{f.ruleId}</span>
                          <span className="text-xs text-steel-quiet ml-auto">{new Date(f.detectedAt).toLocaleString()}</span>
                        </div>
                        <div className="text-sm font-semibold text-ink mt-1">{f.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-mist-dim rounded-2xl p-6">
              <h2 className="text-base font-extrabold text-ink mb-4">Sensor Coverage</h2>
              <table className="w-full text-sm">
                <tbody>
                  {data.sensorCoverage.map((s: any) => (
                    <tr key={s.role} className="border-b border-canvas last:border-0">
                      <td className="py-3 pr-3 w-1/2">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2.5 flex-shrink-0 ${s.connected ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} />
                        {s.label}
                      </td>
                      <td className="py-3 text-right text-steel">{s.connected ? s.deviceNames.join(', ') : 'Not Installed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-mist-dim rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-ink">Rules Not Available for This Customer</h2>
              <span className="text-sm text-steel-quiet">{unavailableRules.length} of {data.ruleAvailability.length} spec rules</span>
            </div>
            {unavailableRules.length === 0 ? (
              <div className="text-base text-steel py-4 text-center">All catalog rules are available for this customer.</div>
            ) : (
              unavailableRules.map((r: any) => {
                const reasons: string[] = [
                  ...r.missingSensorRoles.map((role: string) => `Missing sensor: ${role}`),
                  ...r.requiredIntegrations.map((i: string) => `Requires ${i} (not built)`),
                  ...(r.missingBaseline ? ['Requires baseline history (not yet available)'] : []),
                  ...(!r.implemented ? ['Rule not yet implemented'] : []),
                ];
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-3 border-b border-canvas last:border-0">
                    <div>
                      <div className="text-sm font-extrabold text-ink tabular-nums">{r.id} <span className="font-normal text-steel">— {r.label}</span></div>
                    </div>
                    <span className="text-xs font-bold text-attention bg-[#FEF2F2] px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: '#DC2626' }}>
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
