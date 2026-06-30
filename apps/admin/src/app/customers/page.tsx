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
      <h1 className="text-2xl font-bold text-brand mb-2">Customers</h1>
      <p className="text-gray-500 mb-8">All homeowners registered on the platform.</p>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">🏠</div>
          <p className="text-gray-400 text-sm">No customers yet. They register through the mobile app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Plan</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Inspections</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                  <td className="px-6 py-4 text-gray-500">{c.email}</td>
                  <td className="px-6 py-4">
                    {c.subscription ? (
                      <span className="bg-blue-50 text-brand px-2 py-1 rounded-lg text-xs font-semibold">
                        {c.subscription.plan}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">No plan</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {c.subscription ? (
                      <div className="flex gap-3 text-xs">
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-green-600 text-sm">{c.subscription.inspectionsLeft}</span>
                          <span className="text-gray-400">Left</span>
                        </span>
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-orange-500 text-sm">{c.subscription.inspectionsPending}</span>
                          <span className="text-gray-400">Pending</span>
                        </span>
                        <span className="flex flex-col items-center">
                          <span className="font-bold text-brand text-sm">{c.subscription.inspectionsCompleted}</span>
                          <span className="text-gray-400">Done</span>
                        </span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-400">
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
