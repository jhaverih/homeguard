'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

// TODO: replace with Attenteve's legal company name/address once provided — needed on the COI as additional insured.
const ATTENTEVE_COI_PLACEHOLDER = 'Attenteve, Inc. — additional insured details to be provided';

export function VerificationDocumentsSection() {
  const { isCompanyAdmin } = usePermissions();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [appForm, setAppForm] = useState({
    ein: '', coiExpirationDate: '',
    stateRegistrationFile: null as File | null,
    coiFile: null as File | null,
  });
  const [submittingApp, setSubmittingApp] = useState(false);

  useEffect(() => {
    if (!isCompanyAdmin) { setLoading(false); return; }
    vendorApi.getCompany().then(setCompany).finally(() => setLoading(false));
  }, [isCompanyAdmin]);

  const submitApplication = async () => {
    setSubmittingApp(true);
    try {
      const [stateRegistrationDocKey, coiDocumentKey] = await Promise.all([
        appForm.stateRegistrationFile ? uploadsApi.upload(appForm.stateRegistrationFile, 'vendor-applications').then((r) => r.key) : undefined,
        appForm.coiFile ? uploadsApi.upload(appForm.coiFile, 'vendor-applications').then((r) => r.key) : undefined,
      ]);
      await vendorApi.submitApplication({
        ein: appForm.ein || undefined,
        coiExpirationDate: appForm.coiExpirationDate || undefined,
        stateRegistrationDocKey,
        coiDocumentKey,
      });
      const updated = await vendorApi.getCompany();
      setCompany(updated);
    } finally {
      setSubmittingApp(false);
    }
  };

  if (!isCompanyAdmin || loading || !company) return null;

  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide">Verification Documents</h2>
        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
          company.applicationStatus === 'APPROVED' ? 'bg-green-50 text-green-700'
          : company.applicationStatus === 'REJECTED' ? 'bg-red-50 text-red-600'
          : 'bg-yellow-50 text-yellow-700'
        }`}>
          {company.applicationStatus}
        </span>
      </div>
      {company.reviewNotes && (
        <p className="text-xs text-steel mb-4 bg-canvas rounded-lg p-3">Reviewer note: {company.reviewNotes}</p>
      )}
      <p className="text-xs text-steel mb-4">{ATTENTEVE_COI_PLACEHOLDER}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-steel mb-1">EIN</label>
          <input
            value={appForm.ein}
            onChange={(e) => setAppForm((p) => ({ ...p, ein: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel mb-1">Proof of state registration</label>
          <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, stateRegistrationFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel mb-1">General Liability Insurance Expiration Date</label>
          <input
            type="date"
            value={appForm.coiExpirationDate}
            onChange={(e) => setAppForm((p) => ({ ...p, coiExpirationDate: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel mb-1">General Liability Insurance (COI)</label>
          <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, coiFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
        </div>
      </div>
      <button
        onClick={submitApplication}
        disabled={submittingApp}
        className="mt-4 bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
      >
        {submittingApp ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  );
}
