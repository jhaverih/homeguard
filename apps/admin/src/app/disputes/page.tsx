'use client';
import { useEffect, useState, useMemo } from 'react';
import { disputesApi } from '@/lib/api';

const CATEGORY_LABEL: Record<string, string> = {
  WORK_NOT_COMPLETED: 'Work not completed',
  QUALITY_ISSUE: 'Quality issue',
  WRONG_PRICE: 'Wrong price',
  SERVICE_NOT_AS_DESCRIBED: 'Not as described',
  OTHER: 'Other',
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-red-50 text-red-700',
  UNDER_REVIEW: 'bg-yellow-50 text-yellow-700',
  RESOLVED_CUSTOMER: 'bg-blue-50 text-blue-700',
  RESOLVED_VENDOR: 'bg-green-50 text-green-700',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under Review',
  RESOLVED_CUSTOMER: 'Resolved (Customer)',
  RESOLVED_VENDOR: 'Resolved (Vendor)',
};

type StatusFilter = 'ALL' | 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

function isResolved(status: string) {
  return status === 'RESOLVED_CUSTOMER' || status === 'RESOLVED_VENDOR';
}

function getName(entity: any, idField: string, dispute: any): string {
  if (entity) {
    return entity.name || `${entity.firstName ?? ''} ${entity.lastName ?? ''}`.trim() || entity.email || '—';
  }
  return dispute[idField]?.slice(0, 8) ? `ID: ${dispute[idField].slice(0, 8)}…` : '—';
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [partySearch, setPartySearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [form, setForm] = useState<{ resolution: string; note: string }>({ resolution: '', note: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    disputesApi.getAll().then(setDisputes).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const search = partySearch.toLowerCase();
    return disputes.filter((d) => {
      if (statusFilter === 'OPEN' && d.status !== 'OPEN') return false;
      if (statusFilter === 'UNDER_REVIEW' && d.status !== 'UNDER_REVIEW') return false;
      if (statusFilter === 'RESOLVED' && !isResolved(d.status)) return false;
      if (search) {
        const customerName = getName(d.customer, 'customerId', d).toLowerCase();
        const vendorName = getName(d.vendor, 'vendorId', d).toLowerCase();
        return customerName.includes(search) || vendorName.includes(search);
      }
      return true;
    });
  }, [disputes, statusFilter, partySearch]);

  const counts = {
    all: disputes.length,
    open: disputes.filter((d) => d.status === 'OPEN').length,
    underReview: disputes.filter((d) => d.status === 'UNDER_REVIEW').length,
    resolved: disputes.filter((d) => isResolved(d.status)).length,
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setForm({ resolution: '', note: '' });
    setFormError('');
  };

  const submitResolve = async (id: string) => {
    if (!form.resolution) { setFormError('Select a resolution direction.'); return; }
    if (!form.note.trim()) { setFormError('Enter a resolution note.'); return; }
    const sideEffect = form.resolution === 'RESOLVED_CUSTOMER'
      ? 'void the charge — the customer will not be billed'
      : 'release the payment — the vendor will receive funds';
    if (!window.confirm(`This will ${sideEffect}. This cannot be undone. Continue?`)) return;
    setResolving(id);
    setFormError('');
    try {
      const updated = await disputesApi.resolve(id, form.resolution, form.note);
      setDisputes((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
      setExpanded(null);
    } catch {
      setFormError('Failed to resolve dispute. Please try again.');
    } finally {
      setResolving(null);
    }
  };

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: counts.all },
    { key: 'OPEN', label: 'Open', count: counts.open },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: counts.underReview },
    { key: 'RESOLVED', label: 'Resolved', count: counts.resolved },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-1">Disputes</h1>
      <p className="text-steel mb-6">Review and resolve customer payment disputes.</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-mist-dim p-4">
          <p className="text-2xl font-bold text-ink">{counts.all}</p>
          <p className="text-xs text-steel mt-1">Total</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-2xl font-bold text-red-600">{counts.open}</p>
          <p className="text-xs text-steel mt-1">Open</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-2xl font-bold text-yellow-600">{counts.underReview}</p>
          <p className="text-xs text-steel mt-1">Under Review</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4">
          <p className="text-2xl font-bold text-green-600">{counts.resolved}</p>
          <p className="text-xs text-steel mt-1">Resolved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-mist-dim p-1 rounded-lg">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setStatusFilter(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === t.key ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  statusFilter === t.key ? 'bg-lantern text-ink' : 'bg-border text-steel'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Filter by customer or vendor name…"
          value={partySearch}
          onChange={(e) => setPartySearch(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-lantern/30 w-64"
        />
        {partySearch && (
          <button onClick={() => setPartySearch('')} className="text-xs text-steel hover:text-ink underline">
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-steel text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">⚖️</div>
          <p className="text-steel text-sm">No disputes match the current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_180px_180px_120px] gap-4 px-6 py-3 bg-canvas border-b border-mist-dim text-xs font-semibold text-steel uppercase tracking-wide">
            <span>Dispute</span>
            <span>Customer</span>
            <span>Vendor</span>
            <span>Actions</span>
          </div>

          {filtered.map((dispute, idx) => {
            const isExpandedRow = expanded === dispute.id;
            const isActive = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW';
            const customerName = getName(dispute.customer, 'customerId', dispute);
            const vendorName = getName(dispute.vendor, 'vendorId', dispute);

            return (
              <div key={dispute.id} className={idx !== 0 ? 'border-t border-mist-dim' : ''}>
                <div className="grid grid-cols-[1fr_180px_180px_120px] gap-4 px-6 py-4 hover:bg-canvas transition-colors items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_STYLE[dispute.status] || 'bg-mist-dim text-steel'}`}>
                        {STATUS_LABEL[dispute.status] || dispute.status}
                      </span>
                      <span className="text-xs text-steel bg-mist-dim px-2 py-0.5 rounded-lg">
                        {CATEGORY_LABEL[dispute.category] || dispute.category}
                      </span>
                    </div>
                    <p className="text-sm text-ink truncate">{dispute.description}</p>
                    <p className="text-xs text-steel mt-0.5">
                      {new Date(dispute.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Customer */}
                  <div className="min-w-0">
                    {dispute.customer ? (
                      <a href={`/customers/${dispute.customer.id}`} className="text-sm font-medium text-lantern-deep hover:underline truncate block">
                        {customerName}
                      </a>
                    ) : (
                      <p className="text-sm text-steel truncate">{customerName}</p>
                    )}
                    {dispute.customer?.email && (
                      <p className="text-xs text-steel truncate">{dispute.customer.email}</p>
                    )}
                  </div>

                  {/* Vendor */}
                  <div className="min-w-0">
                    {dispute.vendor ? (
                      <a href={`/vendors/${dispute.vendor.id}`} className="text-sm font-medium text-green-700 hover:underline truncate block">
                        {vendorName}
                      </a>
                    ) : (
                      <p className="text-sm text-steel truncate">{vendorName}</p>
                    )}
                    {dispute.vendor?.email && (
                      <p className="text-xs text-steel truncate">{dispute.vendor.email}</p>
                    )}
                  </div>

                  <button
                    onClick={() => toggleExpand(dispute.id)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      isExpandedRow
                        ? 'bg-mist-dim text-steel border-border'
                        : 'bg-white text-lantern-deep border-lantern hover:bg-lantern-deep hover:text-white'
                    }`}
                  >
                    {isExpandedRow ? 'Collapse' : 'Details'}
                  </button>
                </div>

                {isExpandedRow && (
                  <div className="px-6 pb-6 bg-canvas border-t border-mist-dim">
                    <div className="grid grid-cols-2 gap-6 mt-4">
                      <div>
                        <h3 className="text-sm font-semibold text-ink mb-2">Description</h3>
                        <p className="text-sm text-steel whitespace-pre-wrap">{dispute.description}</p>
                        {dispute.stripePaymentIntentId && (
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-ink mb-1">Stripe Payment Intent</h3>
                            <code className="text-xs text-steel bg-white border border-border px-2 py-1 rounded">
                              {dispute.stripePaymentIntentId}
                            </code>
                          </div>
                        )}
                        {dispute.photoUrls?.length > 0 && (
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-ink mb-2">Evidence Photos</h3>
                            <div className="flex flex-wrap gap-2">
                              {dispute.photoUrls.map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt={`Evidence ${i + 1}`}
                                    className="w-20 h-20 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Quick links */}
                        <div className="mt-4 flex gap-4">
                          {dispute.customer?.id && (
                            <a href={`/customers/${dispute.customer.id}`} className="text-xs text-lantern-deep font-semibold hover:underline">
                              → Customer activity
                            </a>
                          )}
                          {dispute.vendor?.id && (
                            <a href={`/vendors/${dispute.vendor.id}`} className="text-xs text-green-700 font-semibold hover:underline">
                              → Vendor activity
                            </a>
                          )}
                        </div>
                      </div>

                      {isActive ? (
                        <div>
                          <h3 className="text-sm font-semibold text-ink mb-3">Resolve Dispute</h3>
                          <div className="space-y-2 mb-4">
                            {[
                              { value: 'RESOLVED_CUSTOMER', label: 'Resolve for Customer', desc: 'Void the charge — customer is not billed.', cls: 'border-blue-400 bg-blue-50', textCls: 'text-blue-700' },
                              { value: 'RESOLVED_VENDOR', label: 'Resolve for Vendor', desc: 'Release payment — vendor receives funds.', cls: 'border-green-400 bg-green-50', textCls: 'text-green-700' },
                            ].map((opt) => (
                              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.resolution === opt.value ? opt.cls : 'border-border hover:border-steel'}`}>
                                <input type="radio" name={`res-${dispute.id}`} value={opt.value}
                                  checked={form.resolution === opt.value}
                                  onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                                  className="mt-0.5" />
                                <div>
                                  <p className={`text-sm font-semibold ${opt.textCls}`}>{opt.label}</p>
                                  <p className="text-xs text-steel mt-0.5">{opt.desc}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                          <textarea rows={3} placeholder="Explain your decision — sent to both parties."
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:ring-2 focus:ring-lantern/30 resize-none" />
                          {formError && <p className="text-xs text-red-500 mt-2">{formError}</p>}
                          <button onClick={() => submitResolve(dispute.id)} disabled={resolving === dispute.id}
                            className="mt-3 w-full bg-lantern text-ink text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {resolving === dispute.id ? 'Resolving…' : 'Submit Resolution'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="text-center text-steel">
                            <div className="text-3xl mb-2">✓</div>
                            <p className="text-sm font-medium">Dispute resolved</p>
                            <p className="text-xs mt-1">{STATUS_LABEL[dispute.status]}</p>
                            {dispute.resolution && <p className="text-xs text-steel mt-2 max-w-xs">{dispute.resolution}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
