'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400 text-lg tracking-wide">
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      <span className="text-steel text-sm ml-2">{rating.toFixed(1)}</span>
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-steel uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-lantern-deep">{value}</p>
      {sub && <p className="text-xs text-steel">{sub}</p>}
    </div>
  );
}

export default function VendorKpiPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getVendorKpi(id).then(setKpi).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-steel text-sm p-8">Loading…</div>;
  if (!kpi) return <div className="text-red-500 p-8">Vendor not found.</div>;

  const { vendor, jobs, responsiveness, revenue, monthlyTrend, reviews } = kpi;

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-steel hover:text-lantern-deep mb-4 flex items-center gap-1">
        ← Back to Vendors
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep">{vendor.name}</h1>
          {vendor.companyName && <p className="text-steel text-sm mt-1">{vendor.companyName}</p>}
          <p className="text-steel text-xs mt-1">{vendor.email} · Joined {new Date(vendor.joinedAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Jobs Completed" value={jobs.completed} sub={`${jobs.completionRate}% completion rate`} />
        <KpiCard label="Total Jobs" value={jobs.total} sub={`${jobs.cancelled} cancelled`} />
        <KpiCard
          label="Avg Response Time"
          value={responsiveness.avgResponseHours != null ? `${responsiveness.avgResponseHours}h` : '—'}
          sub="Creation → scheduled date"
        />
        <KpiCard
          label="Avg Job Duration"
          value={responsiveness.avgCompletionHours != null ? `${responsiveness.avgCompletionHours}h` : '—'}
          sub="Scheduled → completed"
        />
        <KpiCard label="Total Revenue Paid" value={`$${revenue.total.toFixed(2)}`} sub={`${revenue.jobCount} captured payments`} />
        <KpiCard
          label="Customer Rating"
          value={reviews.averageRating != null ? `${reviews.averageRating}/5` : '—'}
          sub={`${reviews.totalCount} review${reviews.totalCount !== 1 ? 's' : ''}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly trend */}
        <div className="bg-white rounded-2xl border border-mist-dim p-6">
          <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Jobs — Last 6 Months</h2>
          {monthlyTrend.length === 0 ? (
            <p className="text-steel text-sm">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {monthlyTrend.map((m: any) => {
                const pct = m.total > 0 ? Math.round(m.completed / m.total * 100) : 0;
                return (
                  <div key={m.month}>
                    <div className="flex justify-between text-xs text-steel mb-1">
                      <span>{m.month}</span>
                      <span>{m.completed}/{m.total} completed ({pct}%)</span>
                    </div>
                    <div className="w-full bg-mist-dim rounded-full h-2">
                      <div className="bg-lantern h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rating breakdown */}
        <div className="bg-white rounded-2xl border border-mist-dim p-6">
          <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Rating Breakdown</h2>
          {reviews.totalCount === 0 ? (
            <p className="text-steel text-sm">No reviews yet.</p>
          ) : (
            <div className="space-y-2">
              {[...reviews.ratingBreakdown].reverse().map((b: any) => {
                const pct = reviews.totalCount > 0 ? Math.round(b.count / reviews.totalCount * 100) : 0;
                return (
                  <div key={b.star} className="flex items-center gap-3">
                    <span className="text-xs text-amber-500 w-10 text-right">{'★'.repeat(b.star)}</span>
                    <div className="flex-1 bg-mist-dim rounded-full h-2">
                      <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-steel w-8">{b.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent reviews */}
      {reviews.recent.length > 0 && (
        <div className="bg-white rounded-2xl border border-mist-dim p-6">
          <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Recent Reviews</h2>
          <div className="space-y-4">
            {reviews.recent.map((r: any) => (
              <div key={r.id} className="border-b border-canvas pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-steel">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-sm text-steel italic">"{r.comment}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
