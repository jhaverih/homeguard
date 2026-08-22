'use client';
import { useEffect, useRef, useState } from 'react';
import { hvacAnalyticsApi } from '@/lib/api';

export type Customer = { id: string; name: string; email: string };

// Shared admin customer search/select dropdown — originally built for the
// HVAC Analytics page, reused wherever an admin needs to scope a view to
// one customer (e.g. Analytics Thresholds' per-customer overrides).
export function CustomerPicker({ selected, onSelect, placeholder = 'Select a customer…' }: { selected: Customer | null; onSelect: (c: Customer) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The full alphabetical roster, fetched once on first open and filtered
  // client-side as the admin types — no per-keystroke network round trip.
  const [allCustomers, setAllCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open || allCustomers !== null) return;
    hvacAnalyticsApi.searchCustomers('')
      .then(setAllCustomers)
      .catch(() => setLoadError(true));
  }, [open, allCustomers]);

  const q = query.trim().toLowerCase();
  const results = allCustomers === null ? [] : q === ''
    ? allCustomers
    : allCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));

  return (
    <div ref={wrapRef} className="relative w-80 flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white border border-mist-dim rounded-lg px-4 py-3 text-base flex items-center gap-2.5 text-left"
      >
        <span className="text-steel-quiet">🔍</span>
        <span className="flex-1 font-bold text-ink truncate">{selected ? selected.name : placeholder}</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-mist-dim rounded-lg shadow-lg overflow-hidden z-10">
          <div className="p-2.5 border-b border-canvas">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or email…"
              className="w-full text-base px-3 py-2.5 border border-mist-dim rounded-md outline-none focus:border-lantern"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loadError ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">Couldn&apos;t load customers. Close and reopen to retry.</div>
            ) : allCustomers === null ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">Loading customers…</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3.5 text-sm text-steel-quiet">No customers match &quot;{query}&quot;.</div>
            ) : (
              results.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setQuery(''); }}
                  className={`px-4 py-3 text-base flex items-center justify-between border-b border-canvas last:border-0 cursor-pointer hover:bg-canvas ${selected?.id === c.id ? 'bg-canvas font-bold' : ''}`}
                >
                  <span className="text-ink">{c.name}</span>
                  <span className="text-steel-quiet text-sm">{c.email}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
