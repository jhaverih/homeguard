'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { vendorApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { useTableSortFilter } from '@/lib/useTableSortFilter';
import { SortableHeaderCell, FilterTextCell, FilterSelectCell } from '@/components/SortFilterHeader';

const STATUS_OPTIONS = ['PENDING', 'PENDING_CUSTOMER_REVIEW', 'ACCEPTED', 'VENDOR_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export default function JobsPage() {
  const { isCompanyAdmin } = usePermissions();
  const [jobs, setJobs] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => Promise.all([vendorApi.getJobs(), vendorApi.getTeam()]).then(([j, t]) => { setJobs(j); setTeam(t); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const { rows, toggleSort, filters, setFilter, sortIndicator } = useTableSortFilter(jobs, {
    ticketNumber: (j) => j.ticketNumber ?? '',
    customer: (j) => j.customer?.name ?? '',
    status: (j) => j.status ?? '',
    technician: (j) => j.technician?.name ?? '',
  });

  const assign = async (jobId: string, technicianId: string) => {
    if (!technicianId) return;
    setBusyId(jobId);
    try {
      await vendorApi.assignJob(jobId, technicianId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const autoAssign = async (jobId: string) => {
    setBusyId(jobId);
    try {
      await vendorApi.autoAssignJob(jobId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Jobs</h1>
      <p className="text-steel mb-8">All jobs assigned to your company, and who's handling each one.</p>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center text-steel text-sm">No jobs yet.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas border-b border-mist-dim">
              <tr>
                <SortableHeaderCell label="Ticket" indicator={sortIndicator('ticketNumber')} onClick={() => toggleSort('ticketNumber')} />
                <SortableHeaderCell label="Customer" indicator={sortIndicator('customer')} onClick={() => toggleSort('customer')} />
                <SortableHeaderCell label="Status" indicator={sortIndicator('status')} onClick={() => toggleSort('status')} />
                <SortableHeaderCell label="Technician" indicator={sortIndicator('technician')} onClick={() => toggleSort('technician')} />
                {isCompanyAdmin && <th className="text-left px-6 py-3 font-semibold text-steel">Reassign</th>}
                <th className="text-left px-6 py-3 font-semibold text-steel"></th>
              </tr>
              <tr>
                <FilterTextCell value={filters.ticketNumber ?? ''} onChange={(v) => setFilter('ticketNumber', v)} placeholder="Filter ticket…" />
                <FilterTextCell value={filters.customer ?? ''} onChange={(v) => setFilter('customer', v)} placeholder="Filter customer…" />
                <FilterSelectCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
                <FilterTextCell value={filters.technician ?? ''} onChange={(v) => setFilter('technician', v)} placeholder="Filter technician…" />
                {isCompanyAdmin && <th />}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-canvas transition-colors">
                  <td className="px-6 py-4 font-medium text-ink">{j.ticketNumber}</td>
                  <td className="px-6 py-4 text-steel">{j.customer?.name ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-semibold text-steel">{j.status}</span>
                  </td>
                  <td className="px-6 py-4 text-steel">{j.technician?.name ?? '—'}</td>
                  {isCompanyAdmin && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue=""
                          disabled={busyId === j.id}
                          onChange={(e) => assign(j.id, e.target.value)}
                          className="border border-border rounded-lg px-2 py-1.5 text-xs focus:border-lantern outline-none disabled:opacity-50"
                        >
                          <option value="" disabled>Assign to…</option>
                          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button
                          onClick={() => autoAssign(j.id)}
                          disabled={busyId === j.id}
                          className="text-xs font-semibold text-lantern-deep hover:underline disabled:opacity-50"
                        >
                          Auto
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <Link href={`/jobs/${j.id}`} className="text-lantern-deep text-xs font-semibold hover:underline">Report</Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={isCompanyAdmin ? 6 : 5} className="px-6 py-6 text-center text-steel text-sm">No jobs match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
