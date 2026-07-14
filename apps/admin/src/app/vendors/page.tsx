'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState<Record<string, { avg: number; count: number }>>({});

  useEffect(() => {
    adminApi.getVendors().then((v) => {
      setVendors(v);
      // Load reviews for all vendors in parallel
      Promise.allSettled(
        v.map((vendor: any) =>
          adminApi.getVendorReviews(vendor.id).then((reviews: any[]) => {
            if (!reviews?.length) return;
            const avg = reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length;
            setReviewStats((prev) => ({ ...prev, [vendor.id]: { avg, count: reviews.length } }));
          })
        )
      );
    }).finally(() => setLoading(false));
  }, []);

  const approve = async (id: string) => {
    setApproving(id);
    try {
      await adminApi.approveVendor(id);
      setVendors((prev) => prev.map((v) => v.id === id ? { ...v, status: 'ACTIVE' } : v));
    } finally {
      setApproving(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Suspend vendor "${name}"? They will no longer be able to log in.`)) return;
    setRemoving(id);
    try {
      await adminApi.removeVendor(id);
      setVendors((prev) => prev.map((v) => v.id === id ? { ...v, status: 'SUSPENDED' } : v));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Vendors</h1>
      <p className="text-steel mb-8">Service providers registered on the platform.</p>

      {loading ? (
        <div className="text-steel text-sm">Loading...</div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">🔧</div>
          <p className="text-steel text-sm">No vendors yet. They register through the mobile app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas border-b border-mist-dim">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-steel">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Company</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Stripe</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Reviews</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Joined</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-canvas transition-colors">
                  <td className="px-6 py-4 font-medium text-ink">
                    <Link href={`/vendors/${v.id}`} className="text-lantern-deep hover:underline">{v.name}</Link>
                  </td>
                  <td className="px-6 py-4 text-steel">{v.companyName ?? <span className="text-steel text-xs">—</span>}</td>
                  <td className="px-6 py-4 text-steel">{v.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                      v.status === 'ACTIVE'
                        ? 'bg-green-50 text-green-700'
                        : v.status === 'PENDING_APPROVAL'
                        ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {v.status === 'PENDING_APPROVAL' ? 'Pending' : v.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {v.stripeConnected ? (
                      <span className="text-green-600 text-xs font-semibold">✓ Connected</span>
                    ) : (
                      <span className="text-steel text-xs">Not set up</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {reviewStats[v.id] ? (
                      <span className="text-sm font-semibold text-amber-600">
                        ★ {reviewStats[v.id].avg.toFixed(1)}
                        <span className="text-steel font-normal ml-1">({reviewStats[v.id].count})</span>
                      </span>
                    ) : (
                      <span className="text-steel text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-steel">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    {v.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => approve(v.id)}
                        disabled={approving === v.id}
                        className="bg-lantern text-ink text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {approving === v.id ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    {v.status !== 'SUSPENDED' && (
                      <button
                        onClick={() => remove(v.id, v.name)}
                        disabled={removing === v.id}
                        className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {removing === v.id ? 'Removing…' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
