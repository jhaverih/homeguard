'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorApi.getDisputes().then(setDisputes).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Disputes</h1>
      <p className="text-gray-500 mb-8">Disputes raised against jobs completed by your company.</p>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">No disputes.</div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-800">{d.category}</div>
                  <p className="text-sm text-gray-500 mt-1">{d.description}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                  d.status === 'OPEN' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {d.status}
                </span>
              </div>
              {d.resolution && <p className="text-xs text-gray-400 mt-3">Resolution: {d.resolution}</p>}
              <p className="text-xs text-gray-300 mt-2">{new Date(d.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
