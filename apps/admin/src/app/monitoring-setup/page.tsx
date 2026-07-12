'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

export default function MonitoringSetupPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const load = () => adminApi.getMonitoringSetupRequests().then(setCustomers);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const requestConnection = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await adminApi.requestMonitoringConnection(id);
      setRequestedIds((prev) => new Set(prev).add(id));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not dispatch this request.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Monitoring Setup</h1>
      <p className="text-gray-500 mb-8">
        Customers on Standard or Premium who don&apos;t have Yolink home monitoring connected yet.
        Pressing Request Connection dispatches a job any Yolink-trained vendor can accept.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">{error}</div>
      )}

      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          No customers are currently waiting on monitoring setup.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                  <td className="px-6 py-4 text-gray-500">{c.email}</td>
                  <td className="px-6 py-4">
                    {requestedIds.has(c.id) ? (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                        ✅ Dispatched
                      </span>
                    ) : (
                      <button
                        onClick={() => requestConnection(c.id)}
                        disabled={busyId === c.id}
                        className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-brand-light disabled:opacity-50 transition-colors"
                      >
                        {busyId === c.id ? 'Dispatching…' : 'Request Connection'}
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
