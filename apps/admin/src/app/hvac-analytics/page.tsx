'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { hvacAnalyticsApi } from '@/lib/api';
import { CustomerPicker, Customer } from '@/components/CustomerPicker';

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#991B1B', HIGH_ATTENTION: '#991B1B', ATTENTION: '#DC2626', WATCH: '#D97706', INFO: '#2563EB',
};

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
        <div className="flex items-center gap-3">
          <Link
            href="/analytics-thresholds"
            className="flex-shrink-0 bg-white border border-mist-dim rounded-lg px-4 py-3 text-base font-bold text-ink flex items-center gap-2 hover:bg-canvas"
          >
            ⚙️ Analytics Thresholds
          </Link>
          <CustomerPicker selected={customer} onSelect={setCustomer} />
        </div>
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

          {data.componentHealth && <HealthAndDataQuality data={data} />}

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
              <h2 className="text-base font-extrabold text-ink">Rules Enabled for This Customer</h2>
              <span className="text-sm text-steel-quiet">{availableRules.length} of {data.ruleAvailability.length} spec rules</span>
            </div>
            {availableRules.length === 0 ? (
              <div className="text-base text-steel py-4 text-center">No catalog rules are enabled for this customer yet.</div>
            ) : (
              availableRules.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3 border-b border-canvas last:border-0">
                  <div>
                    <div className="text-sm font-extrabold text-ink tabular-nums">{r.id} <span className="font-normal text-steel">— {r.label}</span></div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: '#059669', backgroundColor: '#ECFDF5' }}>
                    Enabled
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white border border-mist-dim rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-ink">Rules Not Enabled for This Customer</h2>
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

const HEALTH_STYLE: Record<string, { label: string; cls: string }> = {
  HEALTHY: { label: 'Healthy', cls: 'text-green-700 bg-green-50' },
  BASELINE_COLLECTING: { label: 'Baseline collecting', cls: 'text-sky-700 bg-sky-50' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', cls: 'text-steel bg-mist-dim/60' },
  MONITOR: { label: 'Monitor', cls: 'text-amber-700 bg-amber-50' },
  MAINTENANCE_RECOMMENDED: { label: 'Maintenance recommended', cls: 'text-orange-700 bg-orange-50' },
  CRITICAL: { label: 'Critical', cls: 'text-red-700 bg-red-50' },
  NOT_MONITORED: { label: 'Not monitored', cls: 'text-steel-quiet bg-canvas' },
};
const INPUT_STYLE: Record<string, string> = { OK: 'text-green-700', STALE: 'text-amber-700', INVALID: 'text-red-700', UNAVAILABLE: 'text-red-700', AUTH_FAILURE: 'text-red-700', NO_DATA: 'text-steel' };

// Evidence behind each component's status (spec §7) — so support can see
// WHY a tile is Insufficient data / Baseline collecting, not just that it is.
function HealthAndDataQuality({ data }: { data: any }) {
  const pill = (status: string) => {
    const s = HEALTH_STYLE[status] ?? HEALTH_STYLE.NOT_MONITORED;
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${s.cls}`}>{s.label}</span>;
  };
  const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  return (
    <div className="bg-white border border-mist-dim rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink">Health &amp; Data Quality</h2>
        {pill(data.componentHealth.overall.healthStatus ?? 'NOT_MONITORED')}
      </div>
      <div className="divide-y divide-canvas">
        {data.componentHealth.components.map((c: any) => (
          <div key={c.id} className="py-2 flex items-start gap-3 text-sm">
            <span className="w-56 shrink-0 font-medium text-ink">{c.label}</span>
            <div className="flex-1 space-y-0.5">
              {pill(c.healthStatus ?? 'NOT_MONITORED')}
              {c.reason && c.healthStatus !== 'NOT_MONITORED' && <p className="text-xs text-steel">{c.reason}</p>}
              {(c.limitations ?? []).map((l: string) => <p key={l} className="text-xs text-amber-700">{l}</p>)}
            </div>
          </div>
        ))}
      </div>
      {(data.dataQuality ?? []).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ink mb-2">Inputs</h3>
          <table className="w-full text-xs">
            <thead className="text-steel"><tr><th className="text-left py-1">Sensor</th><th className="text-left">Role</th><th className="text-left">State</th><th className="text-left">Last valid reading</th></tr></thead>
            <tbody className="divide-y divide-canvas">
              {data.dataQuality.map((i: any) => (
                <tr key={`${i.deviceRegistryId}-${i.sensorRole}`}>
                  <td className="py-1 text-ink">{i.label}</td>
                  <td className="text-steel">{i.sensorRole}</td>
                  <td className={INPUT_STYLE[i.state] ?? ''}>{i.state}{i.detail ? ` — ${i.detail}` : ''}</td>
                  <td className="text-steel">{ago(i.lastValidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(data.ruleEvaluations ?? []).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ink mb-2">Latest rule evaluations</h3>
          <table className="w-full text-xs">
            <thead className="text-steel"><tr><th className="text-left py-1">Rule</th><th className="text-left">Scope</th><th className="text-left">Outcome</th><th className="text-left">Evaluated</th></tr></thead>
            <tbody className="divide-y divide-canvas">
              {data.ruleEvaluations.map((e: any) => (
                <tr key={`${e.ruleId}-${e.scopeKey}`}>
                  <td className="py-1 text-ink">{e.ruleId} <span className="text-steel-quiet">v{e.ruleVersion}</span></td>
                  <td className="text-steel">{e.scopeKey.split(':')[0]}</td>
                  <td className="text-ink">{e.outcome}{e.reason ? <span className="text-steel"> — {e.reason}</span> : null}</td>
                  <td className="text-steel">{ago(e.evaluatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
