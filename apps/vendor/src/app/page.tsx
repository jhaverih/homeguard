'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { vendorApi } from '@/lib/api';
import { useTableSortFilter } from '@/lib/useTableSortFilter';
import { SortableHeaderCell, FilterTextCell, FilterSelectCell } from '@/components/SortFilterHeader';

const STATUS_OPTIONS = ['PENDING', 'PENDING_CUSTOMER_REVIEW', 'ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export default function DashboardPage() {
  const [status, setStatus] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([vendorApi.getStatus(), vendorApi.getJobs()])
      .then(([s, j]) => { setStatus(s); setJobs(j); })
      .finally(() => setLoading(false));
  }, []);

  const { rows, toggleSort, filters, setFilter, sortIndicator } = useTableSortFilter(jobs, {
    ticketNumber: (j) => j.ticketNumber ?? '',
    customer: (j) => j.customer?.name ?? '',
    status: (j) => j.status ?? '',
  });

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  const active = jobs.filter((j) => !['COMPLETED', 'CANCELLED'].includes(j.status));
  const completed = jobs.filter((j) => j.status === 'COMPLETED');

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Dashboard</h1>
      <p className="text-steel mb-8">Overview of your company's activity on Attenteve.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-mist-dim p-5">
          <p className="text-xs font-semibold text-steel uppercase tracking-wide">Plan</p>
          <p className="text-2xl font-bold text-lantern-deep">{status?.planTier ?? '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-mist-dim p-5">
          <p className="text-xs font-semibold text-steel uppercase tracking-wide">Active Jobs</p>
          <p className="text-2xl font-bold text-lantern-deep">{active.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-mist-dim p-5">
          <p className="text-xs font-semibold text-steel uppercase tracking-wide">Completed Jobs</p>
          <p className="text-2xl font-bold text-lantern-deep">{completed.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-mist-dim p-5">
          <p className="text-xs font-semibold text-steel uppercase tracking-wide">Vendor Status</p>
          <p className="text-lg font-bold text-lantern-deep">{status?.applicationStatus ?? '—'}</p>
        </div>
      </div>

      {status?.applicationStatus !== 'APPROVED' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm mb-8">
          Your vendor status is <strong>{status?.applicationStatus}</strong>.{' '}
          <Link href="/company" className="underline font-semibold">Review your documents</Link>.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
        <div className="p-6 border-b border-mist-dim">
          <h2 className="text-sm font-bold text-steel uppercase tracking-wide">Recent Jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="text-steel text-sm p-6">No jobs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-canvas border-b border-mist-dim">
              <tr>
                <SortableHeaderCell label="Ticket" indicator={sortIndicator('ticketNumber')} onClick={() => toggleSort('ticketNumber')} />
                <SortableHeaderCell label="Customer" indicator={sortIndicator('customer')} onClick={() => toggleSort('customer')} />
                <SortableHeaderCell label="Status" indicator={sortIndicator('status')} onClick={() => toggleSort('status')} />
              </tr>
              <tr>
                <FilterTextCell value={filters.ticketNumber ?? ''} onChange={(v) => setFilter('ticketNumber', v)} placeholder="Filter ticket…" />
                <FilterTextCell value={filters.customer ?? ''} onChange={(v) => setFilter('customer', v)} placeholder="Filter customer…" />
                <FilterSelectCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-canvas transition-colors">
                  <td className="px-6 py-3 font-medium text-ink">{j.ticketNumber}</td>
                  <td className="px-6 py-3 text-steel">{j.customer?.name ?? '—'}</td>
                  <td className="px-6 py-3 text-xs font-semibold text-steel">{j.status}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-6 text-center text-steel text-sm">No jobs match your filters.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
