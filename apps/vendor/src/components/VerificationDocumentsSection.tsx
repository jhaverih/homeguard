'use client';
import { useCallback, useEffect, useState } from 'react';
import { onboardingApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

// Company documents for the vendor portal (company admin only):
//   - the states the company can operate in, each with its business
//     registration, plus uploading a registration for another state;
//   - the certificate of insurance.
// Uploaded documents are read automatically by Attenteve's AI, then verified.
// Customers only see the company in states with a verified registration.

const ADDITIONAL_INSURED = 'Attenteve LLC';
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
  'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];
const STATUS_LABEL: Record<string, string> = {
  READING: 'Reading…', PENDING_REVIEW: 'Pending verification', NEEDS_REVIEW: 'Needs review',
  APPROVED: 'Verified', REJECTED: 'Not accepted', EXPIRED: 'Expired',
};
const STATUS_STYLE: Record<string, string> = {
  READING: 'bg-mist-dim text-steel', PENDING_REVIEW: 'bg-yellow-50 text-yellow-700', NEEDS_REVIEW: 'bg-orange-50 text-orange-700',
  APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-600', EXPIRED: 'bg-red-50 text-red-600',
};
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

function Badge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${STATUS_STYLE[status] ?? 'bg-mist-dim text-steel'}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function Reasons({ reasons }: { reasons?: string[] | null }) {
  if (!reasons?.length) return null;
  return <ul className="text-xs text-orange-700 list-disc ml-4 mt-1">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>;
}

// One file input + upload button; `submit` receives the stored file key.
function Upload({ label, submit }: { label: string; submit: (key: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('The file is larger than 10 MB.'); return; }
    setBusy(true);
    setError('');
    try {
      const { key } = await uploadsApi.upload(file, 'vendor-applications');
      await submit(key);
      setFile(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      <button
        onClick={go}
        disabled={!file || busy}
        className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
      >
        {busy ? 'Uploading…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function VerificationDocumentsSection() {
  const { isCompanyAdmin } = usePermissions();
  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newState, setNewState] = useState('');

  const load = useCallback(() => onboardingApi.get().then(setApp).catch(() => {}).finally(() => setLoading(false)), []);
  useEffect(() => {
    if (!isCompanyAdmin) { setLoading(false); return; }
    load();
  }, [isCompanyAdmin, load]);

  // Re-check every 10 seconds while a document is being read.
  const reading = app && (app.documents?.coiStatus === 'READING' || app.states?.some((s: any) => s.registration?.status === 'READING'));
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [reading, load]);

  if (!isCompanyAdmin || loading || !app) return null;
  const states: any[] = app.states ?? [];
  const docs = app.documents ?? {};
  const operating = states.filter((s) => s.canOperate).map((s) => s.state);
  const canUpload = (r: any) => !r || !r.documentUrl || ['REJECTED', 'EXPIRED', 'NEEDS_REVIEW'].includes(r.status);

  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
      <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Company Documents</h2>
      <p className="text-sm text-steel mb-4">
        {operating.length ? `You can serve customers in: ${operating.join(', ')}.` : 'You can\'t serve customers in any state yet.'}{' '}
        Customers only see your company in states where your business registration is verified.
      </p>

      <h3 className="text-sm font-semibold text-ink mb-2">States you can operate in</h3>
      {states.map((s) => {
        const r = s.registration;
        return (
          <div key={s.state} className="border border-border rounded-xl p-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{s.state}</span>
              {s.canOperate
                ? <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-green-50 text-green-700">Can operate{r?.graceUntil ? ` until ${day(r.graceUntil)}` : ''}</span>
                : r ? <Badge status={r.status} /> : <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-red-50 text-red-600">Registration needed</span>}
              {!s.open && <span className="text-xs text-steel">Attenteve isn&apos;t open in {s.state} yet</span>}
              {!s.required && <span className="text-xs text-steel">no counties here</span>}
              {r?.documentUrl && <a href={r.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">View document</a>}
            </div>
            {r?.graceUntil && !r.documentUrl && (
              <p className="text-xs text-orange-700 mt-1">You were already serving {s.state}; upload its registration before {day(r.graceUntil)} to keep serving it.</p>
            )}
            <Reasons reasons={r?.reviewReasons} />
            {canUpload(r) && (
              <Upload label={`Upload ${s.state} registration`} submit={async (key) => { setApp(await onboardingApi.uploadStateRegistration(s.state, key)); }} />
            )}
          </div>
        );
      })}
      <div className="border border-dashed border-border rounded-xl p-3 mb-6">
        <p className="text-sm font-semibold text-ink mb-1">Add another state</p>
        <select value={newState} onChange={(e) => setNewState(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-sm">
          <option value="">Choose a state</option>
          {STATES.filter((c) => !states.some((s) => s.state === c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {newState && (
          <Upload label={`Upload ${newState} registration`} submit={async (key) => { setApp(await onboardingApi.uploadStateRegistration(newState, key)); setNewState(''); }} />
        )}
      </div>

      <h3 className="text-sm font-semibold text-ink mb-1">Certificate of insurance</h3>
      <p className="text-xs text-steel mb-2">
        Your general liability certificate must list <span className="font-semibold">{ADDITIONAL_INSURED}</span> as additional insured,
        with at least $1,000,000 per occurrence.
      </p>
      <div className="border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {docs.coiOnFile ? <Badge status={docs.coiStatus} /> : <span className="text-xs text-steel">No certificate uploaded</span>}
          {docs.coiExpirationDate && <span className="text-xs text-steel">expires {day(docs.coiExpirationDate)}</span>}
          {docs.coiUrl && <a href={docs.coiUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">View certificate</a>}
        </div>
        <Reasons reasons={docs.coiReviewReasons} />
        {docs.coiStatus !== 'READING' && (
          <Upload label={docs.coiOnFile ? 'Upload new certificate' : 'Upload certificate'} submit={async (key) => { setApp(await onboardingApi.uploadInsurance(key)); }} />
        )}
      </div>
    </div>
  );
}
