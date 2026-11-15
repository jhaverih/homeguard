'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// Waiting-list signups from attenteve.com. Two lists:
//   Homeowners: email + ZIP (from the coming-soon page or the ZIP checker).
//   Pros: email + ZIP + company + the services they offer (coming-soon Pros page).
type Tab = 'HOMEOWNER' | 'PRO';

export default function WaitlistPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('HOMEOWNER');

  useEffect(() => {
    adminApi.getWaitlist().then(setRows).finally(() => setLoading(false));
  }, []);

  // Signups made before pros could join have no audience; they are homeowners.
  const audienceOf = (r: any): Tab => (r.audience === 'PRO' ? 'PRO' : 'HOMEOWNER');
  const shown = useMemo(() => rows.filter((r) => audienceOf(r) === tab), [rows, tab]);
  const count = (t: Tab) => rows.filter((r) => audienceOf(r) === t).length;
  const pro = tab === 'PRO';
  const grid = pro ? 'grid-cols-[1.2fr_90px_1fr_2fr_170px]' : 'grid-cols-[1fr_140px_180px]';

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-1">Waitlist</h1>
      <p className="text-steel mb-4">
        People who joined the waiting list on attenteve.com. Contact them when Attenteve launches or reaches their area.
      </p>

      <div className="flex gap-1 bg-mist-dim p-1 rounded-lg w-fit mb-4">
        {(['HOMEOWNER', 'PRO'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
          >
            {t === 'PRO' ? 'Pros' : 'Homeowners'} ({count(t)})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-steel text-sm py-12 text-center">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <p className="text-steel text-sm">No signups yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          <div className={`grid ${grid} gap-4 px-6 py-3 bg-canvas border-b border-mist-dim`}>
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Email</span>
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">ZIP Code</span>
            {pro && <span className="text-xs font-semibold text-steel uppercase tracking-wide">Company</span>}
            {pro && <span className="text-xs font-semibold text-steel uppercase tracking-wide">Services offered</span>}
            <span className="text-xs font-semibold text-steel uppercase tracking-wide">Signed Up</span>
          </div>
          {shown.map((row, idx) => (
            <div
              key={row.id}
              className={`grid ${grid} gap-4 px-6 py-4 ${idx !== 0 ? 'border-t border-mist-dim' : ''}`}
            >
              <span className="text-sm font-medium text-ink break-all">{row.email}</span>
              <span className="text-sm text-steel tabular-nums">{row.zipCode}</span>
              {pro && <span className="text-sm text-steel">{row.companyName || '—'}</span>}
              {pro && <span className="text-xs text-steel">{(row.services ?? []).join(', ') || '—'}</span>}
              <span className="text-xs text-steel">{formatTs(row.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
