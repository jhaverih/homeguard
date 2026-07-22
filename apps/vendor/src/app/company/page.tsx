'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { VerificationDocumentsSection } from '@/components/VerificationDocumentsSection';

export default function CompanyPage() {
  const { isCompanyAdmin } = usePermissions();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [counties, setCounties] = useState<Record<string, { fips: string; name: string }[]>>({});
  const [selectedCounties, setSelectedCounties] = useState<Set<string>>(new Set());
  const [savingServiceArea, setSavingServiceArea] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const load = () => vendorApi.getCompany().then((c) => {
    setCompany(c);
    setName(c.name);
    setSelectedCounties(new Set<string>(c.serviceCounties ?? []));
  });

  useEffect(() => {
    Promise.all([load(), vendorApi.getCounties().then(setCounties)]).finally(() => setLoading(false));
  }, []);

  const saveName = async () => {
    setSavingName(true);
    try {
      const updated = await vendorApi.updateCompany({ name });
      setCompany((prev: any) => ({ ...prev, ...updated }));
    } finally {
      setSavingName(false);
    }
  };

  const toggleCounty = (fips: string) => {
    setSelectedCounties((prev) => {
      const next = new Set(prev);
      if (next.has(fips)) next.delete(fips); else next.add(fips);
      return next;
    });
  };

  const toggleAllInState = (stateCounties: { fips: string; name: string }[]) => {
    const allSelected = stateCounties.every((c) => selectedCounties.has(c.fips));
    setSelectedCounties((prev) => {
      const next = new Set(prev);
      for (const c of stateCounties) {
        if (allSelected) next.delete(c.fips); else next.add(c.fips);
      }
      return next;
    });
  };

  const saveServiceArea = async () => {
    setSavingServiceArea(true);
    try {
      const updated = await vendorApi.updateCompany({ serviceCounties: Array.from(selectedCounties) });
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
        <p className="text-xs text-steel mb-4">Select every county your team serves — this determines whether customers near them can request your services.</p>
        {company.baseZipCode && (
          <p className="text-xs text-steel mb-4 bg-canvas rounded-lg p-3">
            Legacy zip-based coverage (ZIP {company.baseZipCode}, {company.serviceRadiusMiles} mi radius) stays active as a fallback until you select counties below.
          </p>
        )}
        {Object.keys(counties).length === 0 ? (
          <p className="text-xs text-steel">No states are currently open for county selection.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(counties).map(([state, stateCounties]) => (
              <div key={state}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-lantern-deep">{state}</h3>
                  <button
                    onClick={() => toggleAllInState(stateCounties)}
                    className="text-xs font-semibold text-steel hover:text-lantern-deep transition-colors"
                  >
                    {stateCounties.every((c) => selectedCounties.has(c.fips)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 max-h-64 overflow-y-auto border border-mist-dim rounded-lg p-3">
                  {stateCounties.map((c) => (
                    <label key={c.fips} className="flex items-center gap-2 text-sm text-steel cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCounties.has(c.fips)}
                        onChange={() => toggleCounty(c.fips)}
                        className="accent-lantern"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={saveServiceArea}
              disabled={
                savingServiceArea
                || (selectedCounties.size === (company.serviceCounties?.length ?? 0)
                  && (company.serviceCounties ?? []).every((f: string) => selectedCounties.has(f)))
              }
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
            >
              {savingServiceArea ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <VerificationDocumentsSection />
    </div>
  );
}
