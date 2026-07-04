'use client';
import { useEffect, useState } from 'react';
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

type Filter = 'ALL' | 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

function isResolved(status: string) {
  return status === 'RESOLVED_CUSTOMER' || status === 'RESOLVED_VENDOR';
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [form, setForm] = useState<{ resolution: string; note: string }>({ resolution: '', note: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    disputesApi.getAll().then(setDisputes).finally(() => setLoading(false));
  }, []);

  const filtered = disputes.filter((d) => {
    if (filter === 'ALL') return true;
    if (filter === 'OPEN') return d.status === 'OPEN';
    if (filter === 'UNDER_REVIEW') return d.status === 'UNDER_REVIEW';
    if (filter === 'RESOLVED') return isResolved(d.status);
    return true;
  });

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

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: counts.all },
    { key: 'OPEN', label: 'Open', count: counts.open },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: counts.underReview },
    { key: 'RESOLVED', label: 'Resolved', count: counts.resolved },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-1">Disputes</h1>
      <p className="text-gray-500 mb-6">Review and resolve customer payment disputes.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-800">{counts.all}</p>
          <p className="text-xs text-gray-400 mt-1">Total</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-2xl font-bold text-red-600">{counts.open}</p>
          <p className="text-xs text-gray-400 mt-1">Open</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-2xl font-bold text-yellow-600">{counts.underReview}</p>
          <p className="text-xs text-gray-400 mt-1">Under Review</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4">
          <p className="text-2xl font-bold text-green-600">{counts.resolved}</p>
          <p className="text-xs text-gray-400 mt-1">Resolved</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                filter === t.key ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">⚖️</div>
          <p className="text-gray-400 text-sm">No disputes in this category.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {filtered.map((dispute, idx) => {
            const isOpen = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW';
            const isExpandedRow = expanded === dispute.id;
            return (
              <div key={dispute.id} className={idx !== 0 ? 'border-t border-gray-100' : ''}>
                {/* Main row */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_STYLE[dispute.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[dispute.status] || dispute.status}
                      </span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                        {CATEGORY_LABEL[dispute.category] || dispute.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">{dispute.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(dispute.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {dispute.resolvedAt && (
                        <> &mdash; resolved {new Date(dispute.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}
                    </p>
                  </div>

                  <div className="text-xs text-gray-400 hidden lg:block w-32 shrink-0">
                    <p className="font-medium text-gray-600 truncate">Customer</p>
                    <p className="truncate">{dispute.customerId?.slice(0, 8)}…</p>
                  </div>
                  <div className="text-xs text-gray-400 hidden lg:block w-32 shrink-0">
                    <p className="font-medium text-gray-600 truncate">Vendor</p>
                    <p className="truncate">{dispute.vendorId?.slice(0, 8)}…</p>
                  </div>

                  <button
                    onClick={() => toggleExpand(dispute.id)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      isExpandedRow
                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                        : 'bg-white text-brand border-brand hover:bg-brand hover:text-white'
                    }`}
                  >
                    {isExpandedRow ? 'Collapse' : 'View Details'}
                  </button>
                </div>

                {/* Expanded panel */}
                {isExpandedRow && (
                  <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-6 mt-4">
                      {/* Left: dispute details */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{dispute.description}</p>

                        {dispute.stripePaymentIntentId && (
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">Stripe Payment Intent</h3>
                            <code className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">
                              {dispute.stripePaymentIntentId}
                            </code>
                          </div>
                        )}

                        {dispute.photoUrls?.length > 0 && (
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Evidence Photos</h3>
                            <div className="flex flex-wrap gap-2">
                              {dispute.photoUrls.map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt={`Evidence ${i + 1}`}
                                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {dispute.resolution && (
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">Resolution Note</h3>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{dispute.resolution}</p>
                          </div>
                        )}
                      </div>

                      {/* Right: resolve form (only for open disputes) */}
                      {isOpen ? (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">Resolve Dispute</h3>
                          <div className="space-y-2 mb-4">
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              form.resolution === 'RESOLVED_CUSTOMER'
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}>
                              <input
                                type="radio"
                                name={`res-${dispute.id}`}
                                value="RESOLVED_CUSTOMER"
                                checked={form.resolution === 'RESOLVED_CUSTOMER'}
                                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                                className="mt-0.5"
                              />
                              <div>
                                <p className="text-sm font-semibold text-blue-700">Resolve for Customer</p>
                                <p className="text-xs text-gray-500 mt-0.5">Void the charge — customer is not billed.</p>
                              </div>
                            </label>
                            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              form.resolution === 'RESOLVED_VENDOR'
                                ? 'border-green-400 bg-green-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}>
                              <input
                                type="radio"
                                name={`res-${dispute.id}`}
                                value="RESOLVED_VENDOR"
                                checked={form.resolution === 'RESOLVED_VENDOR'}
                                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                                className="mt-0.5"
                              />
                              <div>
                                <p className="text-sm font-semibold text-green-700">Resolve for Vendor</p>
                                <p className="text-xs text-gray-500 mt-0.5">Release payment — vendor receives funds.</p>
                              </div>
                            </label>
                          </div>

                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Resolution Note <span className="text-red-400">*</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Explain your decision — this is sent to both parties."
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                          />

                          {formError && (
                            <p className="text-xs text-red-500 mt-2">{formError}</p>
                          )}

                          <button
                            onClick={() => submitResolve(dispute.id)}
                            disabled={resolving === dispute.id}
                            className="mt-3 w-full bg-brand text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            {resolving === dispute.id ? 'Resolving…' : 'Submit Resolution'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="text-center text-gray-400">
                            <div className="text-3xl mb-2">✓</div>
                            <p className="text-sm font-medium">Dispute resolved</p>
                            <p className="text-xs mt-1">{STATUS_LABEL[dispute.status]}</p>
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
