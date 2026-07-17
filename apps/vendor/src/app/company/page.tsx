'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

// TODO: replace with Attenteve's legal company name/address once provided — needed on the COI as additional insured.
const ATTENTEVE_COI_PLACEHOLDER = 'Attenteve, Inc. — additional insured details to be provided';

export default function CompanyPage() {
  const { isCompanyAdmin } = usePermissions();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [baseZipCode, setBaseZipCode] = useState('');
  const [serviceRadiusMiles, setServiceRadiusMiles] = useState('25');
  const [savingServiceArea, setSavingServiceArea] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [appForm, setAppForm] = useState({
    ein: '', businessTaxLicenseState: '', coiExpirationDate: '',
    stateRegistrationFile: null as File | null,
    businessTaxLicenseFile: null as File | null,
    coiFile: null as File | null,
  });
  const [submittingApp, setSubmittingApp] = useState(false);

  const load = () => vendorApi.getCompany().then((c) => {
    setCompany(c);
    setName(c.name);
    setBaseZipCode(c.baseZipCode ?? '');
    setServiceRadiusMiles(c.serviceRadiusMiles != null ? String(c.serviceRadiusMiles) : '25');
  });

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

  const saveServiceArea = async () => {
    setSavingServiceArea(true);
    try {
      const updated = await vendorApi.updateCompany({
        baseZipCode: baseZipCode.trim(),
        serviceRadiusMiles: parseInt(serviceRadiusMiles, 10) || 25,
      });
      setCompany((prev: any) => ({ ...prev, ...updated }));
    } finally {
      setSavingServiceArea(false);
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
    return <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center text-steel text-sm">Only your Vendor Admin can manage company settings.</div>;
  }

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Company</h1>
      <p className="text-steel mb-8">Company profile and verification documents.</p>

      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-4">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="Company logo" className="w-16 h-16 rounded-xl object-cover border border-mist-dim" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-mist-dim flex items-center justify-center text-steel text-xs">No logo</div>
          )}
          <label className="bg-white border border-border text-steel px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-canvas transition-colors">
            {uploadingLogo ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
          />
          <button
            onClick={saveName}
            disabled={savingName || name === company.name}
            className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Service Area</h2>
        <p className="text-xs text-steel mb-4">Where you're based and how far you'll travel — this determines whether customers near you can request your services.</p>
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Base ZIP code</label>
            <input
              value={baseZipCode}
              onChange={(e) => setBaseZipCode(e.target.value)}
              placeholder="e.g. 78701"
              maxLength={5}
              className="w-32 border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Service radius (miles)</label>
            <input
              type="number"
              value={serviceRadiusMiles}
              onChange={(e) => setServiceRadiusMiles(e.target.value)}
              min="1"
              className="w-32 border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
            />
          </div>
          <button
            onClick={saveServiceArea}
            disabled={savingServiceArea || (baseZipCode === (company.baseZipCode ?? '') && serviceRadiusMiles === String(company.serviceRadiusMiles ?? 25))}
            className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
          >
            {savingServiceArea ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-mist-dim p-6">
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
            <label className="block text-xs font-medium text-steel mb-1">Business tax license state</label>
            <input
              value={appForm.businessTaxLicenseState}
              onChange={(e) => setAppForm((p) => ({ ...p, businessTaxLicenseState: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Proof of state registration</label>
            <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, stateRegistrationFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Business tax license</label>
            <input type="file" onChange={(e) => setAppForm((p) => ({ ...p, businessTaxLicenseFile: e.target.files?.[0] ?? null }))} className="text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-steel mb-1">COI expiration date</label>
            <input
              type="date"
              value={appForm.coiExpirationDate}
              onChange={(e) => setAppForm((p) => ({ ...p, coiExpirationDate: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Certificate of Insurance (COI)</label>
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
    </div>
  );
}
