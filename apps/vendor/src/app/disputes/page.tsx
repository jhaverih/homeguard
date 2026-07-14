'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorApi.getDisputes().then(setDisputes).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Disputes</h1>
      <p className="text-steel mb-8">Disputes raised against jobs completed by your company.</p>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center text-steel text-sm">No disputes.</div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-mist-dim p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-ink">{d.category}</div>
                  <p className="text-sm text-steel mt-1">{d.description}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                  d.status === 'OPEN' ? 'bg-yellow-50 text-yellow-700' : 'bg-mist-dim text-steel'
                }`}>
                  {d.status}
                </span>
              </div>
              {d.resolution && <p className="text-xs text-steel mt-3">Resolution: {d.resolution}</p>}
              <p className="text-xs text-steel mt-2">{new Date(d.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
