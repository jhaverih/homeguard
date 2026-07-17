'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function WaitlistPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getWaitlist().then(setRows).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-1">Waitlist</h1>
      <p className="text-steel mb-6">
        Homeowners who checked their ZIP on attenteve.com and weren&apos;t in a covered area yet — notify them once a vendor covers their ZIP.
      </p>

      {loading ? (
        <div className="text-steel text-sm py-12 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <p className="text-steel text-sm">No signups yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_180px] gap-4 px-6 py-3 bg-canvas border-b border-mist-dim">
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Email</span>
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">ZIP Code</span>
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Signed Up</span>
          </div>
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={`grid grid-cols-[1fr_140px_180px] gap-4 px-6 py-4 ${idx !== 0 ? 'border-t border-mist-dim' : ''}`}
            >
              <span className="text-sm font-medium text-ink">{row.email}</span>
              <span className="text-sm text-steel tabular-nums">{row.zipCode}</span>
              <span className="text-xs text-steel">{formatTs(row.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
