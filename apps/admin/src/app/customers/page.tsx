'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getCustomers().then(setCustomers).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Customers</h1>
      <p className="text-steel mb-8">All homeowners registered on the platform.</p>

      {loading ? (
        <div className="text-steel text-sm">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">🏠</div>
          <p className="text-steel text-sm">No customers yet. They register through the mobile app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-x-hidden">
          <table className="w-full text-sm sticky-thead">
            <thead className="bg-canvas border-b border-mist-dim">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-steel">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Plan</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Assessments</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-canvas transition-colors cursor-pointer" onClick={() => window.location.href = `/customers/${c.id}`}>
                  <td className="px-6 py-4 font-medium text-lantern-deep hover:underline">{c.name}</td>
                  <td className="px-6 py-4 text-steel">{c.email}</td>
                  <td className="px-6 py-4">
                    {c.subscription ? (
                      <span className="bg-blue-50 text-lantern-deep px-2 py-1 rounded-lg text-xs font-semibold">
                        {c.subscription.plan}
                      </span>
                    ) : (
                      <span className="text-steel text-xs">No plan</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {c.subscription ? (
                      <div className="flex gap-3 text-xs">
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-green-600 text-sm">{c.subscription.inspectionsLeft}</span>
                          <span className="text-steel">Left</span>
                        </span>
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-orange-500 text-sm">{c.subscription.inspectionsPending}</span>
                          <span className="text-steel">Pending</span>
                        </span>
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-lantern-deep text-sm">{c.subscription.inspectionsCompleted}</span>
                          <span className="text-steel">Done</span>
                        </span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-steel">
                    {new Date(c.createdAt).toLocaleDateString()}
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
