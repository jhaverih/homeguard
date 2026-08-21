'use client';
import { useEffect, useState, useMemo } from 'react';
import { adminApi } from '@/lib/api';

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  HIGH:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  LOW:      { label: 'Low',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-400' },
};

type FilterKey = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DISPATCHED';
type SortKey = 'time' | 'customer';
type SortDir = 'asc' | 'desc';

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function SortHeader({ label, sortKey, current, dir, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold text-steel uppercase tracking-wide hover:text-lantern-deep transition-colors"
    >
      {label}
      <span className={`ml-0.5 ${active ? 'text-lantern-deep' : 'text-steel'}`}>
        {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

export default function EventsPage() {
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [customerFilter, setCustomerFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const [data, cust] = await Promise.all([
        adminApi.getAlerts(p, PAGE_SIZE),
        adminApi.getCustomers().catch(() => []),
      ]);
      setAllAlerts(data.alerts ?? []);
      setTotal(data.total ?? 0);
      setCustomers(cust ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = allAlerts.filter((a) => {
      if (filter === 'DISPATCHED') return !!a.emergencyDispatchRequestedAt;
      if (filter !== 'ALL' && a.severity !== filter) return false;
      if (customerFilter && a.customer?.id !== customerFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'time') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === 'customer') {
        cmp = (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [allAlerts, filter, customerFilter, sortKey, sortDir]);

  const counts = {
    all: allAlerts.length,
    critical: allAlerts.filter((a) => a.severity === 'CRITICAL').length,
    high: allAlerts.filter((a) => a.severity === 'HIGH').length,
    medium: allAlerts.filter((a) => a.severity === 'MEDIUM').length,
    low: allAlerts.filter((a) => a.severity === 'LOW').length,
    dispatched: allAlerts.filter((a) => !!a.emergencyDispatchRequestedAt).length,
  };

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: counts.all },
    { key: 'CRITICAL', label: 'Critical', count: counts.critical },
    { key: 'HIGH', label: 'High', count: counts.high },
    { key: 'MEDIUM', label: 'Medium', count: counts.medium },
    { key: 'LOW', label: 'Low', count: counts.low },
    { key: 'DISPATCHED', label: 'Dispatched', count: counts.dispatched },
  ];

  return (
    <div>
      <h1 className="text-4xl font-bold text-lantern-deep mb-2">Monitoring Events</h1>
      <p className="text-steel text-lg mb-8">All sensor and device alerts from Yolink and connected services.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-mist-dim p-7">
          <p className="text-5xl font-extrabold text-ink tabular-nums">{total}</p>
          <p className="text-base text-steel mt-2">Total Events</p>
        </div>
        <div className="bg-white rounded-2xl border border-red-100 p-7">
          <p className="text-5xl font-extrabold text-red-600 tabular-nums">{counts.critical}</p>
          <p className="text-base text-steel mt-2">Critical</p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-100 p-7">
          <p className="text-5xl font-extrabold text-orange-500 tabular-nums">{counts.high}</p>
          <p className="text-base text-steel mt-2">High</p>
        </div>
        <div className="bg-white rounded-2xl border border-lantern/20 p-7">
          <p className="text-5xl font-extrabold text-lantern-deep tabular-nums">{counts.dispatched}</p>
          <p className="text-base text-steel mt-2">Dispatch Requested</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1 bg-mist-dim p-1 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === t.key ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  filter === t.key ? 'bg-lantern text-ink' : 'bg-border text-steel'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Customer dropdown */}
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-lantern/30"
        >
          <option value="">All Customers</option>
          {customers.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name || c.email}</option>
          ))}
        </select>

        {customerFilter && (
          <button
            onClick={() => setCustomerFilter('')}
            className="text-xs text-steel hover:text-ink underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-steel text-sm py-12 text-center">Loading events…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">🔕</div>
          <p className="text-steel text-sm">No events match the current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {/* Header with sort */}
          <div className="grid grid-cols-[1fr_220px_180px_130px] gap-4 px-6 py-3 bg-canvas border-b border-mist-dim">
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Event / Description</span>
            <SortHeader label="Customer" sortKey="customer" current={sortKey} dir={sortDir} onClick={handleSort} />
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Address</span>
            <SortHeader label="Time" sortKey="time" current={sortKey} dir={sortDir} onClick={handleSort} />
          </div>

          {filtered.map((alert, idx) => {
            const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.MEDIUM;
            const dispatched = !!alert.emergencyDispatchRequestedAt;
            const isOpen = expanded === alert.id;

            return (
              <div key={alert.id} className={idx !== 0 ? 'border-t border-mist-dim' : ''}>
                <button
                  onClick={() => setExpanded((p) => (p === alert.id ? null : alert.id))}
                  className="w-full text-left grid grid-cols-[1fr_220px_180px_130px] gap-4 px-6 py-4 hover:bg-canvas transition-colors items-start"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${sev.bg} ${sev.color} border ${sev.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>
                      {alert.deviceType && (
                        <span className="px-2 py-0.5 rounded-lg text-xs bg-mist-dim text-steel font-medium">
                          {alert.deviceType}
                        </span>
                      )}
                      {dispatched && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-green-50 text-green-700 font-semibold border border-green-200">
                          ✓ Dispatch Requested
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-ink truncate">{alert.message}</p>
                    {alert.deviceName && <p className="text-xs text-steel mt-0.5">Device: {alert.deviceName}</p>}
                  </div>

                  <div className="min-w-0">
                    {alert.customer ? (
                      <>
                        <a
                          href={`/customers/${alert.customer.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-lantern-deep hover:underline truncate block"
                        >
                          {alert.customer.name}
                        </a>
                        <p className="text-xs text-steel truncate">{alert.customer.email}</p>
                      </>
                    ) : (
                      <p className="text-xs text-steel">Unknown customer</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs text-steel leading-relaxed">
                      {alert.customer?.address ?? <span className="text-steel">—</span>}
                    </p>
                  </div>

                  <div className="text-xs text-steel whitespace-nowrap">{formatTs(alert.createdAt)}</div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-5 pt-1 bg-canvas border-t border-mist-dim">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs font-semibold text-steel uppercase tracking-wide mb-2">Event Details</p>
                        <dl className="space-y-1.5 text-sm">
                          {[['Event', alert.event], ['Device', alert.deviceName], ['Type', alert.deviceType], ['Status', alert.status]].map(([k, v]) => v ? (
                            <div key={k} className="flex gap-2">
                              <dt className="text-steel w-24 shrink-0">{k}</dt>
                              <dd className="text-ink font-medium">{v}</dd>
                            </div>
                          ) : null)}
                        </dl>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-steel uppercase tracking-wide mb-2">Homeowner</p>
                        {alert.customer ? (
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex gap-2"><dt className="text-steel w-16 shrink-0">Name</dt><dd className="text-ink font-medium">{alert.customer.name}</dd></div>
                            <div className="flex gap-2"><dt className="text-steel w-16 shrink-0">Email</dt><dd className="text-ink">{alert.customer.email}</dd></div>
                            <div className="flex gap-2"><dt className="text-steel w-16 shrink-0">Address</dt><dd className="text-ink">{alert.customer.address ?? '—'}</dd></div>
                            <div className="flex gap-2 mt-2">
                              <a href={`/customers/${alert.customer.id}`} className="text-xs text-lantern-deep font-semibold hover:underline">
                                → View full activity
                              </a>
                            </div>
                          </dl>
                        ) : (
                          <p className="text-sm text-steel">No customer record</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-steel uppercase tracking-wide mb-2">Response</p>
                        {dispatched ? (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                            <p className="text-sm font-semibold text-green-700">Emergency Dispatch Requested</p>
                            <p className="text-xs text-green-600 mt-1">{formatTs(alert.emergencyDispatchRequestedAt)}</p>
                          </div>
                        ) : (
                          <div className="bg-mist-dim rounded-xl p-3">
                            <p className="text-sm text-steel">No action taken yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-steel">
          <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= total}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
