'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, userApi } from '@/lib/api';

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
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [counties, setCounties] = useState<Record<string, { fips: string; name: string }[]>>({});
  const [selectedCounties, setSelectedCounties] = useState<Set<string>>(new Set());
  const [savedCounties, setSavedCounties] = useState<Set<string>>(new Set());
  const [savingServiceArea, setSavingServiceArea] = useState(false);

  const load = () => adminApi.getVendorKpi(id).then((k) => {
    setKpi(k);
    setAddress(k.vendor.address ?? '');
    setCity(k.vendor.city ?? '');
    setState(k.vendor.state ?? '');
    setZip(k.vendor.zipCode ?? '');
    const saved = new Set<string>(k.vendor.serviceCounties ?? []);
    setSelectedCounties(saved);
    setSavedCounties(saved);
  });

  useEffect(() => {
    Promise.all([load(), adminApi.getCounties().then(setCounties)]).finally(() => setLoading(false));
    userApi.getMe().then((me: any) => setIsSuperUser(me.adminLevel === 'SUPER_USER')).catch(() => {});
  }, [id]);

  const toggleCounty = (fips: string) => {
    setSelectedCounties((prev) => {
      const next = new Set(prev);
      if (next.has(fips)) next.delete(fips); else next.add(fips);
      return next;
    });
  };

  const toggleAllInState = (stateCounties: { fips: string; name: string }[]) => {
    const allSelected = stateCounties.every((c) => selectedCounties.has(c.fips));
    setSelectedCounties((prev) => {
      const next = new Set(prev);
      for (const c of stateCounties) {
        if (allSelected) next.delete(c.fips); else next.add(c.fips);
      }
      return next;
    });
  };

  const saveAddress = async () => {
    setSavingServiceArea(true);
    try {
      await adminApi.updateVendorServiceArea(id, {
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: zip.trim(),
      });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to save address.');
    } finally {
      setSavingServiceArea(false);
    }
  };

  const saveCounties = async () => {
    setSavingServiceArea(true);
    try {
      await adminApi.updateVendorServiceArea(id, { serviceCounties: Array.from(selectedCounties) });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to save counties.');
    } finally {
      setSavingServiceArea(false);
    }
  };

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

      {/* Location */}
      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Location</h2>
        <p className="text-xs text-steel mb-4">Mailing address on file — display/records only, not used for coverage matching.</p>
        {isSuperUser ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-steel mb-1">Street address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">State</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    placeholder="TN"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">Zip</label>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    maxLength={10}
                    placeholder="37201"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={saveAddress}
              disabled={savingServiceArea}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
            >
              {savingServiceArea ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <p className="text-sm text-steel">
            {address || city || state || zip
              ? [address, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
              : '— No address on file —'}
          </p>
        )}
      </div>

      {/* Service Area */}
      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Service Area</h2>
        <p className="text-xs text-steel mb-4">
          Counties this vendor's team serves — determines whether the public zip-code checker reports coverage for a customer near them.
          {selectedCounties.size === 0 && (
            <span className="text-red-500 font-medium"> No coverage set yet — this vendor won't match any zip until counties are selected.</span>
          )}
        </p>
        {Object.keys(counties).length === 0 ? (
          <p className="text-xs text-steel">No states are currently open for county selection.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(counties).map(([st, stateCounties]) => (
              <div key={st}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-lantern-deep">{st}</h3>
                  <button
                    onClick={() => toggleAllInState(stateCounties)}
                    className="text-xs font-semibold text-steel hover:text-lantern-deep transition-colors"
                  >
                    {stateCounties.every((c) => selectedCounties.has(c.fips)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 max-h-64 overflow-y-auto border border-mist-dim rounded-lg p-3">
                  {stateCounties.map((c) => (
                    <label key={c.fips} className="flex items-center gap-2 text-sm text-steel cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCounties.has(c.fips)}
                        onChange={() => toggleCounty(c.fips)}
                        className="accent-lantern"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={saveCounties}
              disabled={
                savingServiceArea
                || (selectedCounties.size === savedCounties.size && Array.from(savedCounties).every((f) => selectedCounties.has(f)))
              }
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
            >
              {savingServiceArea ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
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
