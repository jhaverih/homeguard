'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  HIGH:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  LOW:      { label: 'Low',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-400' },
};

type FilterKey = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DISPATCHED';

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function EventsPage() {
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const data = await adminApi.getAlerts(p, PAGE_SIZE);
      setAllAlerts(data.alerts ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const filtered = allAlerts.filter((a) => {
    if (filter === 'ALL') return true;
    if (filter === 'DISPATCHED') return !!a.emergencyDispatchRequestedAt;
    return a.severity === filter;
  });

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
      <h1 className="text-2xl font-bold text-brand mb-1">Monitoring Events</h1>
      <p className="text-gray-500 mb-6">All sensor and device alerts from Yolink and connected services.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-800">{total}</p>
          <p className="text-xs text-gray-400 mt-1">Total Events</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
          <p className="text-xs text-gray-400 mt-1">Critical</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-100 p-4">
          <p className="text-2xl font-bold text-orange-500">{counts.high}</p>
          <p className="text-xs text-gray-400 mt-1">High</p>
        </div>
        <div className="bg-white rounded-xl border border-brand/20 p-4">
          <p className="text-2xl font-bold text-brand">{counts.dispatched}</p>
          <p className="text-xs text-gray-400 mt-1">Dispatch Requested</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                filter === t.key ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Loading events…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">🔕</div>
          <p className="text-gray-400 text-sm">No events in this category.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_220px_180px_130px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Event / Description</span>
            <span>Customer</span>
            <span>Address</span>
            <span>Time</span>
          </div>

          {filtered.map((alert, idx) => {
            const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.MEDIUM;
            const dispatched = !!alert.emergencyDispatchRequestedAt;
            const isOpen = expanded === alert.id;

            return (
              <div key={alert.id} className={idx !== 0 ? 'border-t border-gray-100' : ''}>
                {/* Main row */}
                <button
                  onClick={() => setExpanded((p) => (p === alert.id ? null : alert.id))}
                  className="w-full text-left grid grid-cols-[1fr_220px_180px_130px] gap-4 px-6 py-4 hover:bg-gray-50 transition-colors items-start"
                >
                  {/* Event + severity */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${sev.bg} ${sev.color} border ${sev.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>
                      {alert.deviceType && (
                        <span className="px-2 py-0.5 rounded-lg text-xs bg-gray-100 text-gray-500 font-medium">
                          {alert.deviceType}
                        </span>
                      )}
                      {dispatched && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-green-50 text-green-700 font-semibold border border-green-200">
                          ✓ Dispatch Requested
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 truncate">{alert.message}</p>
                    {alert.deviceName && (
                      <p className="text-xs text-gray-400 mt-0.5">Device: {alert.deviceName}</p>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="min-w-0">
                    {alert.customer ? (
                      <>
                        <p className="text-sm font-medium text-gray-700 truncate">{alert.customer.name}</p>
                        <p className="text-xs text-gray-400 truncate">{alert.customer.email}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Unknown customer</p>
                    )}
                  </div>

                  {/* Address */}
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {alert.customer?.address ?? <span className="text-gray-300">—</span>}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {formatTs(alert.createdAt)}
                  </div>
                </button>

                {/* Expanded panel */}
                {isOpen && (
                  <div className="px-6 pb-5 pt-1 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                      {/* Event details */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Event Details</p>
                        <dl className="space-y-1.5 text-sm">
                          <div className="flex gap-2">
                            <dt className="text-gray-400 w-24 shrink-0">Event</dt>
                            <dd className="text-gray-700 font-medium">{alert.event ?? '—'}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-gray-400 w-24 shrink-0">Device</dt>
                            <dd className="text-gray-700">{alert.deviceName ?? '—'}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-gray-400 w-24 shrink-0">Type</dt>
                            <dd className="text-gray-700">{alert.deviceType ?? '—'}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-gray-400 w-24 shrink-0">Status</dt>
                            <dd className="text-gray-700">{alert.status}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Customer + address */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Homeowner</p>
                        {alert.customer ? (
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex gap-2">
                              <dt className="text-gray-400 w-16 shrink-0">Name</dt>
                              <dd className="text-gray-700 font-medium">{alert.customer.name}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-gray-400 w-16 shrink-0">Email</dt>
                              <dd className="text-gray-700">{alert.customer.email}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-gray-400 w-16 shrink-0">Address</dt>
                              <dd className="text-gray-700">{alert.customer.address ?? '—'}</dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="text-sm text-gray-400">No customer record found</p>
                        )}
                      </div>

                      {/* Dispatch status */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response</p>
                        {dispatched ? (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                            <p className="text-sm font-semibold text-green-700">Emergency Dispatch Requested</p>
                            <p className="text-xs text-green-600 mt-1">
                              {formatTs(alert.emergencyDispatchRequestedAt)}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-gray-100 rounded-xl p-3">
                            <p className="text-sm text-gray-500">No action taken yet</p>
                            <p className="text-xs text-gray-400 mt-1">Dispatch can be requested from the Houmi app</p>
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

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * PAGE_SIZE >= total}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
