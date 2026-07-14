'use client';
import { useEffect, useState, useMemo } from 'react';
import { adminApi } from '@/lib/api';

type ViewKey = 'applications' | 'certifications';

const APPLICATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO'] as const;
const CERTIFICATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;

const STATUS_STYLE: Record<string, string> = {
  PENDING_REVIEW: 'bg-yellow-50 text-yellow-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  NEEDS_INFO: 'bg-blue-50 text-blue-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  NEEDS_INFO: 'Needs Info',
};

const CERT_TYPE_LABEL: Record<string, string> = {
  HVAC: 'HVAC (Mechanical)',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  ROOFING: 'Roofing',
  GENERAL_CONTRACTOR: 'General Contractor',
  NABCEP: 'NABCEP (Solar)',
};

function CompletenessBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

export default function VendorApplicationsPage() {
  const [view, setView] = useState<ViewKey>('applications');
  const [applications, setApplications] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [form, setForm] = useState<{ decision: string; note: string }>({ decision: '', note: '' });
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    return Promise.all([adminApi.getVendorApplications(), adminApi.getVendorCertifications()])
      .then(([apps, certs]) => {
        setApplications(apps);
        setCertifications(certs);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setStatusFilter('ALL');
    setExpanded(null);
  }, [view]);

  const statuses = view === 'applications' ? APPLICATION_STATUSES : CERTIFICATION_STATUSES;
  const items = view === 'applications' ? applications : certifications;

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return items;
    return items.filter((i) => i.applicationStatus === statusFilter || i.status === statusFilter);
  }, [items, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length };
    for (const s of statuses) {
      c[s] = items.filter((i) => (i.applicationStatus ?? i.status) === s).length;
    }
    return c;
  }, [items, statuses]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setForm({ decision: '', note: '' });
    setFormError('');
  };

  const submitReview = async (id: string) => {
    if (!form.decision) { setFormError('Select a decision.'); return; }
    setReviewing(id);
    setFormError('');
    try {
      if (view === 'applications') {
        const updated = await adminApi.reviewVendorApplication(id, form.decision, form.note.trim() || undefined);
        setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      } else {
        const updated = await adminApi.reviewVendorCertification(id, form.decision, form.note.trim() || undefined);
        setCertifications((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      }
      setExpanded(null);
    } catch {
      setFormError('Failed to submit review. Please try again.');
    } finally {
      setReviewing(null);
    }
  };

  const decisionOptions = view === 'applications'
    ? [
        { value: 'APPROVED', label: 'Approve', cls: 'border-green-400 bg-green-50', textCls: 'text-green-700' },
        { value: 'NEEDS_INFO', label: 'Needs Info', cls: 'border-blue-400 bg-blue-50', textCls: 'text-blue-700' },
        { value: 'REJECTED', label: 'Reject', cls: 'border-red-400 bg-red-50', textCls: 'text-red-700' },
      ]
    : [
        { value: 'APPROVED', label: 'Approve', cls: 'border-green-400 bg-green-50', textCls: 'text-green-700' },
        { value: 'REJECTED', label: 'Reject', cls: 'border-red-400 bg-red-50', textCls: 'text-red-700' },
      ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-1">Vendor Applications</h1>
      <p className="text-gray-500 mb-6">Review company applications and individual trade certifications.</p>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        <button
          onClick={() => setView('applications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'applications' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Company Applications
        </button>
        <button
          onClick={() => setView('certifications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'certifications' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Certifications
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === 'ALL' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          All
          {counts.ALL > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === 'ALL' ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'}`}>{counts.ALL}</span>}
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === s ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {STATUS_LABEL[s]}
            {counts[s] > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === s ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'}`}>{counts[s]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📄</div>
          <p className="text-gray-400 text-sm">No {view === 'applications' ? 'applications' : 'certifications'} match the current filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {filtered.map((item, idx) => {
            const isExpandedRow = expanded === item.id;
            const status = item.applicationStatus ?? item.status;
            const isPending = status === 'PENDING_REVIEW';

            return (
              <div key={item.id} className={idx !== 0 ? 'border-t border-gray-100' : ''}>
                <div className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[status] || status}
                      </span>
                      {view === 'certifications' && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                          {CERT_TYPE_LABEL[item.certificationType] || item.certificationType}
                        </span>
                      )}
                    </div>
                    {view === 'applications' ? (
                      <>
                        <p className="text-sm font-medium text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.vendorAdmin?.name || '—'} · {item.vendorAdmin?.email || '—'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-800">{item.user?.name || '—'}</p>
                        <p className="text-xs text-gray-400">License #{item.licenseNumber} · {item.issuingState}</p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      isExpandedRow
                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                        : 'bg-white text-brand border-brand hover:bg-brand hover:text-white'
                    }`}
                  >
                    {isExpandedRow ? 'Collapse' : 'Details'}
                  </button>
                </div>

                {isExpandedRow && (
                  <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-6 mt-4">
                      <div>
                        {view === 'applications' ? (
                          <>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Completeness</h3>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              <CompletenessBadge ok={item.completeness.stateRegistration} label="State Registration" />
                              <CompletenessBadge ok={item.completeness.ein} label="EIN" />
                              <CompletenessBadge ok={item.completeness.businessTaxLicense} label="Tax License" />
                              <CompletenessBadge ok={item.completeness.coi} label="COI (valid)" />
                              <CompletenessBadge ok={item.completeness.vendorAdminPhoto} label="Admin Photo" />
                            </div>
                            <p className="text-sm text-gray-600 mb-1">EIN: <span className="font-mono">{item.ein || '—'}</span></p>
                            <div className="flex flex-col gap-1 mt-3">
                              {item.stateRegistrationUrl && (
                                <a href={item.stateRegistrationUrl} target="_blank" rel="noreferrer" className="text-xs text-brand font-semibold hover:underline">→ State registration document</a>
                              )}
                              {item.businessTaxLicenseUrl && (
                                <a href={item.businessTaxLicenseUrl} target="_blank" rel="noreferrer" className="text-xs text-brand font-semibold hover:underline">→ Business tax license ({item.businessTaxLicenseState || '—'})</a>
                              )}
                              {item.coiUrl && (
                                <a href={item.coiUrl} target="_blank" rel="noreferrer" className="text-xs text-brand font-semibold hover:underline">
                                  → Certificate of Insurance {item.coiExpirationDate && `(expires ${new Date(item.coiExpirationDate).toLocaleDateString()})`}
                                </a>
                              )}
                            </div>
                            {item.reviewNotes && (
                              <div className="mt-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-1">Last Review Note</h3>
                                <p className="text-sm text-gray-600">{item.reviewNotes}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Completeness</h3>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              <CompletenessBadge ok={item.completeness.licenseNumber} label="License Number" />
                              <CompletenessBadge ok={item.completeness.notExpired} label="Not Expired" />
                              <CompletenessBadge ok={item.completeness.document} label="Document" />
                            </div>
                            <p className="text-sm text-gray-600 mb-1">Issued in: {item.issuingState || '—'}</p>
                            <p className="text-sm text-gray-600 mb-1">Expires: {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}</p>
                            <p className="text-sm text-gray-600 mb-1">Submitted by: {item.user?.email || '—'}</p>
                            {item.documentUrl && (
                              <a href={item.documentUrl} target="_blank" rel="noreferrer" className="block mt-3 text-xs text-brand font-semibold hover:underline">→ License document</a>
                            )}
                            {item.reviewNotes && (
                              <div className="mt-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-1">Last Review Note</h3>
                                <p className="text-sm text-gray-600">{item.reviewNotes}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {isPending ? (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">Decision</h3>
                          <div className="space-y-2 mb-4">
                            {decisionOptions.map((opt) => (
                              <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.decision === opt.value ? opt.cls : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name={`decision-${item.id}`} value={opt.value}
                                  checked={form.decision === opt.value}
                                  onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}
                                />
                                <p className={`text-sm font-semibold ${opt.textCls}`}>{opt.label}</p>
                              </label>
                            ))}
                          </div>
                          <textarea rows={3} placeholder="Optional note — sent to the vendor."
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
                          {formError && <p className="text-xs text-red-500 mt-2">{formError}</p>}
                          <button onClick={() => submitReview(item.id)} disabled={reviewing === item.id}
                            className="mt-3 w-full bg-brand text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {reviewing === item.id ? 'Submitting…' : 'Submit Decision'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="text-center text-gray-400">
                            <div className="text-3xl mb-2">✓</div>
                            <p className="text-sm font-medium">Already reviewed</p>
                            <p className="text-xs mt-1">{STATUS_LABEL[status]}</p>
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
