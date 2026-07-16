'use client';
import { useEffect, useState, useMemo } from 'react';
import { adminApi, userApi } from '@/lib/api';

type ViewKey = 'applications' | 'certifications' | 'elite';

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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-mist-dim text-steel'}`}>
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

  // Elite membership requests — vendors already exist and are just requesting
  // an upgrade, so this reuses adminApi.getVendors() (filtered client-side)
  // rather than needing a dedicated backend endpoint.
  const [eliteVendors, setEliteVendors] = useState<any[]>([]);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [confirmingEliteId, setConfirmingEliteId] = useState<string | null>(null);
  const [approvingEliteId, setApprovingEliteId] = useState<string | null>(null);
  const [eliteError, setEliteError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    return Promise.all([adminApi.getVendorApplications(), adminApi.getVendorCertifications(), adminApi.getVendors()])
      .then(([apps, certs, vendors]) => {
        setApplications(apps);
        setCertifications(certs);
        setEliteVendors((vendors || []).filter((v: any) => v.eliteRequestedAt));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    userApi.getMe().then((me: any) => setIsSuperUser(me.adminLevel === 'SUPER_USER')).catch(() => {});
  }, []);

  const approveElite = async (vendorId: string) => {
    setApprovingEliteId(vendorId);
    setEliteError(null);
    try {
      await adminApi.setVendorPlan(vendorId, 'ELITE');
      setEliteVendors((prev) => prev.filter((v) => v.id !== vendorId));
      setConfirmingEliteId(null);
    } catch (err: any) {
      setEliteError(err.response?.data?.message || 'Could not activate Elite for this vendor.');
    } finally {
      setApprovingEliteId(null);
    }
  };

  useEffect(() => {
    setStatusFilter('ALL');
    setExpanded(null);
    setConfirmingEliteId(null);
    setEliteError(null);
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
      <h1 className="text-2xl font-bold text-lantern-deep mb-1">Vendor Applications</h1>
      <p className="text-steel mb-6">Review company applications and individual trade certifications.</p>

      <div className="flex gap-1 bg-mist-dim p-1 rounded-lg w-fit mb-4">
        <button
          onClick={() => setView('applications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'applications' ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
        >
          Company Applications
        </button>
        <button
          onClick={() => setView('certifications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'certifications' ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
        >
          Certifications
        </button>
        <button
          onClick={() => setView('elite')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'elite' ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
        >
          Elite Requests
          {eliteVendors.length > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${view === 'elite' ? 'bg-lantern text-ink' : 'bg-border text-steel'}`}>{eliteVendors.length}</span>}
        </button>
      </div>

      {view !== 'elite' && (
      <div className="flex gap-1 bg-mist-dim p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === 'ALL' ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
        >
          All
          {counts.ALL > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === 'ALL' ? 'bg-lantern text-ink' : 'bg-border text-steel'}`}>{counts.ALL}</span>}
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === s ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'}`}
          >
            {STATUS_LABEL[s]}
            {counts[s] > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === s ? 'bg-lantern text-ink' : 'bg-border text-steel'}`}>{counts[s]}</span>}
          </button>
        ))}
      </div>
      )}

      {view === 'elite' ? (
        loading ? (
          <div className="text-steel text-sm">Loading...</div>
        ) : eliteVendors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
            <div className="text-4xl mb-4">⭐</div>
            <p className="text-steel text-sm">No pending Elite membership requests.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
            {eliteVendors.map((v, idx) => (
              <div key={v.id} className={`px-6 py-4 ${idx !== 0 ? 'border-t border-mist-dim' : ''}`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{v.name}</p>
                    <p className="text-xs text-steel">
                      {v.companyName ? `${v.companyName} · ` : ''}Requested {new Date(v.eliteRequestedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {isSuperUser ? (
                    confirmingEliteId === v.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-steel">Charges the vendor's card immediately —</span>
                        <button
                          onClick={() => approveElite(v.id)}
                          disabled={approvingEliteId === v.id}
                          className="bg-lantern text-ink text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {approvingEliteId === v.id ? 'Charging…' : 'Confirm Charge & Activate'}
                        </button>
                        <button
                          onClick={() => setConfirmingEliteId(null)}
                          disabled={approvingEliteId === v.id}
                          className="bg-white text-steel border border-border text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-canvas disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmingEliteId(v.id); setEliteError(null); }}
                        className="shrink-0 bg-lantern text-ink text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Approve Elite
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-steel">Requires Super User to approve</span>
                  )}
                </div>
                {confirmingEliteId === v.id && eliteError && (
                  <p className="text-xs text-red-500 mt-2">{eliteError}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="text-steel text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
          <div className="text-4xl mb-4">📄</div>
          <p className="text-steel text-sm">No {view === 'applications' ? 'applications' : 'certifications'} match the current filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {filtered.map((item, idx) => {
            const isExpandedRow = expanded === item.id;
            const status = item.applicationStatus ?? item.status;
            const isPending = status === 'PENDING_REVIEW';

            return (
              <div key={item.id} className={idx !== 0 ? 'border-t border-mist-dim' : ''}>
                <div className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-canvas transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_STYLE[status] || 'bg-mist-dim text-steel'}`}>
                        {STATUS_LABEL[status] || status}
                      </span>
                      {view === 'certifications' && (
                        <span className="text-xs text-steel bg-mist-dim px-2 py-0.5 rounded-lg">
                          {CERT_TYPE_LABEL[item.certificationType] || item.certificationType}
                        </span>
                      )}
                    </div>
                    {view === 'applications' ? (
                      <>
                        <p className="text-sm font-medium text-ink">{item.name}</p>
                        <p className="text-xs text-steel">{item.vendorAdmin?.name || '—'} · {item.vendorAdmin?.email || '—'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-ink">{item.user?.name || '—'}</p>
                        <p className="text-xs text-steel">License #{item.licenseNumber} · {item.issuingState}</p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpand(item.id)}
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
                        {view === 'applications' ? (
                          <>
                            <h3 className="text-sm font-semibold text-ink mb-2">Completeness</h3>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              <CompletenessBadge ok={item.completeness.stateRegistration} label="State Registration" />
                              <CompletenessBadge ok={item.completeness.ein} label="EIN" />
                              <CompletenessBadge ok={item.completeness.businessTaxLicense} label="Tax License" />
                              <CompletenessBadge ok={item.completeness.coi} label="COI (valid)" />
                              <CompletenessBadge ok={item.completeness.vendorAdminPhoto} label="Admin Photo" />
                            </div>
                            <p className="text-sm text-steel mb-1">EIN: <span className="font-mono">{item.ein || '—'}</span></p>
                            <div className="flex flex-col gap-1 mt-3">
                              {item.stateRegistrationUrl && (
                                <a href={item.stateRegistrationUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">→ State registration document</a>
                              )}
                              {item.businessTaxLicenseUrl && (
                                <a href={item.businessTaxLicenseUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">→ Business tax license ({item.businessTaxLicenseState || '—'})</a>
                              )}
                              {item.coiUrl && (
                                <a href={item.coiUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">
                                  → Certificate of Insurance {item.coiExpirationDate && `(expires ${new Date(item.coiExpirationDate).toLocaleDateString()})`}
                                </a>
                              )}
                            </div>
                            {item.reviewNotes && (
                              <div className="mt-4">
                                <h3 className="text-sm font-semibold text-ink mb-1">Last Review Note</h3>
                                <p className="text-sm text-steel">{item.reviewNotes}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <h3 className="text-sm font-semibold text-ink mb-2">Completeness</h3>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              <CompletenessBadge ok={item.completeness.licenseNumber} label="License Number" />
                              <CompletenessBadge ok={item.completeness.notExpired} label="Not Expired" />
                              <CompletenessBadge ok={item.completeness.document} label="Document" />
                            </div>
                            <p className="text-sm text-steel mb-1">Issued in: {item.issuingState || '—'}</p>
                            <p className="text-sm text-steel mb-1">Expires: {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}</p>
                            <p className="text-sm text-steel mb-1">Submitted by: {item.user?.email || '—'}</p>
                            {item.documentUrl && (
                              <a href={item.documentUrl} target="_blank" rel="noreferrer" className="block mt-3 text-xs text-lantern-deep font-semibold hover:underline">→ License document</a>
                            )}
                            {item.reviewNotes && (
                              <div className="mt-4">
                                <h3 className="text-sm font-semibold text-ink mb-1">Last Review Note</h3>
                                <p className="text-sm text-steel">{item.reviewNotes}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {isPending ? (
                        <div>
                          <h3 className="text-sm font-semibold text-ink mb-3">Decision</h3>
                          <div className="space-y-2 mb-4">
                            {decisionOptions.map((opt) => (
                              <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.decision === opt.value ? opt.cls : 'border-border hover:border-steel'}`}>
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
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:ring-2 focus:ring-lantern/30 resize-none" />
                          {formError && <p className="text-xs text-red-500 mt-2">{formError}</p>}
                          <button onClick={() => submitReview(item.id)} disabled={reviewing === item.id}
                            className="mt-3 w-full bg-lantern text-ink text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {reviewing === item.id ? 'Submitting…' : 'Submit Decision'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="text-center text-steel">
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
