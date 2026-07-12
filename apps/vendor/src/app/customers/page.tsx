'use client';
import { Fragment, useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';
import { useTableSortFilter } from '@/lib/useTableSortFilter';
import { SortableHeaderCell, FilterTextCell } from '@/components/SortFilterHeader';

const emptyMonitorForm = { yolinkUAID: '', yolinkSecretKey: '', homeName: '', address: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Record<string, any[] | 'error'>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [monitorFor, setMonitorFor] = useState<string | null>(null);
  const [monitorForm, setMonitorForm] = useState(emptyMonitorForm);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connectResult, setConnectResult] = useState<{ customerId: string; deviceCount: number } | null>(null);

  useEffect(() => {
    vendorApi.getCustomers().then(setCustomers).finally(() => setLoading(false));
  }, []);

  const startMonitoring = (customer: any) => {
    setMonitorFor(customer.id);
    setMonitorForm({ ...emptyMonitorForm, homeName: `${customer.name}'s Home` });
    setConnectError('');
    setConnectResult(null);
  };

  const submitMonitoring = async (e: React.FormEvent, customerId: string) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const res = await vendorApi.connectMonitoring({
        customerId,
        yolinkUAID: monitorForm.yolinkUAID.trim(),
        yolinkSecretKey: monitorForm.yolinkSecretKey.trim(),
        homeName: monitorForm.homeName.trim(),
        address: monitorForm.address.trim() || undefined,
      });
      setConnectResult({ customerId, deviceCount: res.devices?.length ?? 0 });
    } catch (err: any) {
      setConnectError(err.response?.data?.message || 'Could not connect — check the UAID and Secret Key.');
    } finally {
      setConnecting(false);
    }
  };

  const { rows, toggleSort, filters, setFilter, sortIndicator } = useTableSortFilter(customers, {
    name: (c) => c.name ?? '',
    email: (c) => c.email ?? '',
    jobCount: (c) => String(c.jobCount ?? 0),
  });

  const toggleHistory = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!history[id]) {
      try {
        const h = await vendorApi.getCustomerHistory(id);
        setHistory((prev) => ({ ...prev, [id]: h }));
      } catch {
        setHistory((prev) => ({ ...prev, [id]: 'error' }));
      }
    }
  };

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Customers</h1>
      <p className="text-gray-500 mb-8">Homeowners your company has serviced. Full history requires an Elite plan.</p>

      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">No customers yet.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <SortableHeaderCell label="Name" indicator={sortIndicator('name')} onClick={() => toggleSort('name')} />
                <SortableHeaderCell label="Email" indicator={sortIndicator('email')} onClick={() => toggleSort('email')} />
                <SortableHeaderCell label="Jobs" indicator={sortIndicator('jobCount')} onClick={() => toggleSort('jobCount')} />
                <th className="text-left px-6 py-3 font-semibold text-gray-600"></th>
              </tr>
              <tr>
                <FilterTextCell value={filters.name ?? ''} onChange={(v) => setFilter('name', v)} placeholder="Filter name…" />
                <FilterTextCell value={filters.email ?? ''} onChange={(v) => setFilter('email', v)} placeholder="Filter email…" />
                <th />
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c) => (
                <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                    <td className="px-6 py-4 text-gray-500">{c.email}</td>
                    <td className="px-6 py-4 text-gray-500">{c.jobCount}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleHistory(c.id)} className="text-brand text-xs font-semibold hover:underline">
                          {expanded === c.id ? 'Hide history' : 'View history'}
                        </button>
                        <button onClick={() => (monitorFor === c.id ? setMonitorFor(null) : startMonitoring(c))} className="text-brand text-xs font-semibold hover:underline">
                          {monitorFor === c.id ? 'Cancel' : '📡 Connect Monitoring'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 bg-gray-50/50">
                        {history[c.id] === 'error' ? (
                          <p className="text-red-500 text-xs">Full history requires an Elite plan.</p>
                        ) : !history[c.id] ? (
                          <p className="text-gray-400 text-xs">Loading…</p>
                        ) : (history[c.id] as any[]).length === 0 ? (
                          <p className="text-gray-400 text-xs">No history found.</p>
                        ) : (
                          <div className="space-y-1">
                            {(history[c.id] as any[]).map((h) => (
                              <div key={h.id} className="text-xs text-gray-600 flex justify-between">
                                <span>{h.ticketNumber} — {h.type}</span>
                                <span className="font-semibold">{h.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {monitorFor === c.id && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 bg-teal-50/40">
                        {connectResult && connectResult.customerId === c.id ? (
                          <div className="text-sm text-green-700 flex items-center gap-2">
                            <span>✅</span>
                            <span>Connected — {connectResult.deviceCount} device{connectResult.deviceCount === 1 ? '' : 's'} found on this home.</span>
                          </div>
                        ) : (
                          <form onSubmit={(e) => submitMonitoring(e, c.id)} className="space-y-3 max-w-md">
                            <p className="text-xs text-gray-500">
                              Enter this customer&apos;s own Yolink credentials — found in their Yolink app under
                              Account → Advanced Settings → User Access Credentials. Houmi never needs their Yolink login.
                            </p>
                            <input
                              required
                              value={monitorForm.yolinkUAID}
                              onChange={(e) => setMonitorForm((f) => ({ ...f, yolinkUAID: e.target.value }))}
                              placeholder="UAID (starts with ua_)"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                            <input
                              required
                              value={monitorForm.yolinkSecretKey}
                              onChange={(e) => setMonitorForm((f) => ({ ...f, yolinkSecretKey: e.target.value }))}
                              placeholder="Secret Key (starts with sec_)"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                            <input
                              required
                              value={monitorForm.homeName}
                              onChange={(e) => setMonitorForm((f) => ({ ...f, homeName: e.target.value }))}
                              placeholder="Home name"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                            <input
                              value={monitorForm.address}
                              onChange={(e) => setMonitorForm((f) => ({ ...f, address: e.target.value }))}
                              placeholder="Address (optional)"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                            {connectError && <p className="text-red-600 text-xs">{connectError}</p>}
                            <button
                              type="submit"
                              disabled={connecting}
                              className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-brand-light disabled:opacity-50 transition-colors"
                            >
                              {connecting ? 'Verifying…' : 'Verify & Connect'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-6 text-center text-gray-400 text-sm">No customers match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
