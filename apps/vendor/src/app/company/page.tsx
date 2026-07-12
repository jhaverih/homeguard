'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

// TODO: replace with Houmi's legal company name/address once provided — needed on the COI as additional insured.
const HOUMI_COI_PLACEHOLDER = 'Houmi, Inc. — additional insured details to be provided';

export default function CompanyPage() {
  const { isCompanyAdmin } = usePermissions();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [appForm, setAppForm] = useState({
    ein: '', businessTaxLicenseState: '', coiExpirationDate: '',
    stateRegistrationFile: null as File | null,
    businessTaxLicenseFile: null as File | null,
    coiFile: null as File | null,
  });
  const [submittingApp, setSubmittingApp] = useState(false);

  const load = () => vendorApi.getCompany().then((c) => { setCompany(c); setName(c.name); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const saveName = async () => {
    setSavingName(true);
    try {
      const updated = await vendorApi.updateCompany({ name });
      setCompany((prev: any) => ({ ...prev, ...updated }));
    } finally {
      setSavingName(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const { key } = await uploadsApi.upload(file, 'vendor-logos');
      const updated = await vendorApi.updateCompany({ logoKey: key });
      setCompany((prev: any) => ({ ...prev, ...updated }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const submitApplication = async () => {
    setSubmittingApp(true);
    try {
      const [stateRegistrationDocKey, businessTaxLicenseDocKey, coiDocumentKey] = await Promise.all([
        appForm.stateRegistrationFile ? uploadsApi.upload(appForm.stateRegistrationFile, 'vendor-applications').then((r) => r.key) : undefined,
        appForm.businessTaxLicenseFile ? uploadsApi.upload(appForm.businessTaxLicenseFile, 'vendor-applications').then((r) => r.key) : undefined,
        appForm.coiFile ? uploadsApi.upload(appForm.coiFile, 'vendor-applications').then((r) => r.key) : undefined,
      ]);
      await vendorApi.submitApplication({
        ein: appForm.ein || undefined,
        businessTaxLicenseState: appForm.businessTaxLicenseState || undefined,
        coiExpirationDate: appForm.coiExpirationDate || undefined,
        stateRegistrationDocKey,
        businessTaxLicenseDocKey,
        coiDocumentKey,
      });
      await load();
    } finally {
      setSubmittingApp(false);
    }
  };

  if (!isCompanyAdmin) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">Only your Vendor Admin can manage company settings.</div>;
  }

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Company</h1>
      <p className="text-gray-500 mb-8">Company profile and verification documents.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-4">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="Company logo" className="w-16 h-16 rounded-xl object-cover border border-gray-100" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 text-xs">No logo</div>
          )}
          <label className="bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-gray-50 transition-colors">
            {uploadingLogo ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <button
            onClick={saveName}
            disabled={savingName || name === company.name}
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Verification Documents</h2>
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
            company.applicationStatus === 'APPROVED' ? 'bg-green-50 text-green-700'
            : company.applicationStatus === 'REJECTED' ? 'bg-red-50 text-red-600'
            : 'bg-yellow-50 text-yellow-700'
          }`}>
            {company.applicationStatus}
          </span>
        </div>
        {company.reviewNotes && (
          <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg p-3">Reviewer note: {company.reviewNotes}</p>
        )}
        <p className="text-xs text-gray-400 mb-4">{HOUMI_COI_PLACEHOLDER}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">EIN</label>
            <input
              value={appForm.ein}
              onChange={(e) => setAppForm((p) => ({ ...p, ein: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Business tax license state</label>
            <input
              value={appForm.businessTaxLicenseState}
              onChange={(e) => setAppForm((p) => ({ ...p, businessTaxLicenseState: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proof of state registration</label>
            <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, stateRegistrationFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Business tax license</label>
            <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, businessTaxLicenseFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">COI expiration date</label>
            <input
              type="date"
              value={appForm.coiExpirationDate}
              onChange={(e) => setAppForm((p) => ({ ...p, coiExpirationDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Certificate of Insurance (COI)</label>
            <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, coiFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
          </div>
        </div>
        <button
          onClick={submitApplication}
          disabled={submittingApp}
          className="mt-4 bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors"
        >
          {submittingApp ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
    </div>
  );
}
