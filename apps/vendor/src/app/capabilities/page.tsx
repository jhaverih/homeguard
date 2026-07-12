'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';

export default function MyCapabilitiesPage() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ackFor, setAckFor] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [certForm, setCertForm] = useState<{ type: string; licenseNumber: string; issuingState: string; expirationDate: string; file: File | null }>({
    type: 'HVAC', licenseNumber: '', issuingState: '', expirationDate: '', file: null,
  });
  const [submittingCert, setSubmittingCert] = useState(false);

  const load = () => Promise.all([vendorApi.getCapabilities(), vendorApi.getMyCapabilities(), vendorApi.getMyCertifications()])
    .then(([cat, mine_, certs]) => { setCatalog(cat); setMine(mine_); setCertifications(certs); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const mineIds = new Set(mine.map((m: any) => m.id));

  const applyToggle = async (capabilityId: string) => {
    setSaving(true);
    try {
      const next = mineIds.has(capabilityId)
        ? mine.filter((m) => m.id !== capabilityId).map((m) => m.id)
        : [...mine.map((m) => m.id), capabilityId];
      const updated = await vendorApi.setMyCapabilities(next);
      setMine(updated);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (capability: any) => {
    // Unchecking never needs re-confirmation; only newly selecting a
    // training-gated, not-yet-acknowledged capability opens the confirm panel.
    const isSelecting = !mineIds.has(capability.id);
    if (isSelecting && capability.requiresAcknowledgment && !capability.acknowledged) {
      setAckFor(capability.id);
      return;
    }
    await applyToggle(capability.id);
  };

  const confirmAcknowledge = async (capabilityId: string) => {
    setAcknowledging(true);
    try {
      await vendorApi.acknowledgeCapability(capabilityId);
      setCatalog((prev) => prev.map((c) => (c.id === capabilityId ? { ...c, acknowledged: true } : c)));
      setAckFor(null);
      await applyToggle(capabilityId);
    } finally {
      setAcknowledging(false);
    }
  };

  const submitCertification = async () => {
    if (!certForm.file || !certForm.licenseNumber || !certForm.expirationDate) return;
    setSubmittingCert(true);
    try {
      const { key } = await uploadsApi.upload(certForm.file, 'vendor-certifications');
      await vendorApi.submitCertification({
        certificationType: certForm.type,
        licenseNumber: certForm.licenseNumber,
        issuingState: certForm.issuingState,
        expirationDate: certForm.expirationDate,
        documentKey: key,
      });
      setCertForm({ type: 'HVAC', licenseNumber: '', issuingState: '', expirationDate: '', file: null });
      await load();
    } finally {
      setSubmittingCert(false);
    }
  };

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">My Capabilities & Certifications</h1>
      <p className="text-gray-500 mb-8">Select what you can do. Trade capabilities also require an approved certification — and your company must be on the Elite plan — before matching jobs appear in the open queue.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Capabilities</h2>
        <div className="grid grid-cols-2 gap-3">
          {catalog.map((c) => (
            <div key={c.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mineIds.has(c.id)}
                  disabled={saving}
                  onChange={() => toggle(c)}
                  className="w-4 h-4 rounded cursor-pointer accent-teal-700"
                />
                {c.name}
                {c.requiredCertificationType !== 'NONE' && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{c.requiredCertificationType}</span>
                )}
                {c.requiresAcknowledgment && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${c.acknowledged ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'}`}>
                    {c.acknowledged ? 'Training confirmed' : 'Training required'}
                  </span>
                )}
              </label>

              {ackFor === c.id && (
                <div className="mt-2 ml-6 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2">
                  <p className="text-gray-700">
                    Read Houmi&apos;s installer guide before selecting this capability — it covers hub/sensor pairing and where sensors go.
                  </p>
                  <a
                    href={c.trainingDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-semibold text-brand hover:underline"
                  >
                    Open training guide &rarr;
                  </a>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => confirmAcknowledge(c.id)}
                      disabled={acknowledging}
                      className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors"
                    >
                      {acknowledging ? 'Confirming…' : 'I have read and understand the installation process'}
                    </button>
                    <button onClick={() => setAckFor(null)} className="text-gray-400 hover:text-gray-600 px-2 py-1.5">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">My Certifications</h2>
        {certifications.length === 0 ? (
          <p className="text-gray-400 text-sm mb-4">None submitted yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {certifications.map((c) => (
              <div key={c.id} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                <span>{c.certificationType} — #{c.licenseNumber} (exp. {new Date(c.expirationDate).toLocaleDateString()})</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                  c.status === 'APPROVED' ? 'bg-green-50 text-green-700' : c.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <select
            value={certForm.type}
            onChange={(e) => setCertForm((p) => ({ ...p, type: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          >
            <option value="HVAC">HVAC</option>
            <option value="ELECTRICAL">Electrical</option>
            <option value="PLUMBING">Plumbing</option>
          </select>
          <input
            value={certForm.licenseNumber}
            onChange={(e) => setCertForm((p) => ({ ...p, licenseNumber: e.target.value }))}
            placeholder="License number"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <input
            value={certForm.issuingState}
            onChange={(e) => setCertForm((p) => ({ ...p, issuingState: e.target.value }))}
            placeholder="Issuing state"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <input
            type="date"
            value={certForm.expirationDate}
            onChange={(e) => setCertForm((p) => ({ ...p, expirationDate: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <input
            type="file"
            onChange={(e) => setCertForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
            className="col-span-2 text-sm"
          />
          <button
            onClick={submitCertification}
            disabled={submittingCert || !certForm.file || !certForm.licenseNumber || !certForm.expirationDate}
            className="col-span-2 bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors"
          >
            {submittingCert ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </div>
    </div>
  );
}
