'use client';
import { Fragment, useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';
import { useTableSortFilter } from '@/lib/useTableSortFilter';
import { SortableHeaderCell, FilterTextCell } from '@/components/SortFilterHeader';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Record<string, any[] | 'error'>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    vendorApi.getCustomers().then(setCustomers).finally(() => setLoading(false));
  }, []);

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
                      <button onClick={() => toggleHistory(c.id)} className="text-brand text-xs font-semibold hover:underline">
                        {expanded === c.id ? 'Hide history' : 'View history'}
                      </button>
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
