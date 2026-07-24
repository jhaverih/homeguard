'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { VerificationDocumentsSection } from '@/components/VerificationDocumentsSection';
import { US_STATES } from '@/lib/us-states';
import { usePermissions } from '@/lib/permissions';

// A capability groups under "Specialties" if it requires a certification
// document, or was explicitly flagged isSpecialty (premium marketplace
// verticals like Cleaning Services/Lawn & Landscaping/Pest Control/Flooring
// that don't need an uploaded license but should still read as a specialty).
const isSpecialty = (c: any) => c.requiredCertificationType !== 'NONE' || c.isSpecialty === true;

const CERT_TYPE_LABEL: Record<string, string> = {
  HVAC: 'HVAC',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  ROOFING: 'Roofing',
  GENERAL_CONTRACTOR: 'General Contractor',
  NABCEP: 'NABCEP PV IP (Solar)',
};
// Editing an existing certification isn't restricted to specialties the admin has
// currently selected (unlike the add form) — the cert may predate that selection,
// or the admin may just be fixing a data-entry mistake.
const ALL_CERT_TYPES = Object.keys(CERT_TYPE_LABEL);

export default function MyCapabilitiesPage() {
  const { isCompanyAdmin } = usePermissions();
  const [catalog, setCatalog] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ackFor, setAckFor] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [certForm, setCertForm] = useState<{ type: string; licenseNumber: string; issuingState: string; expirationDate: string; file: File | null }>({
    type: '', licenseNumber: '', issuingState: '', expirationDate: '', file: null,
  });
  const [submittingCert, setSubmittingCert] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ type: string; licenseNumber: string; issuingState: string; expirationDate: string; file: File | null }>({
    type: '', licenseNumber: '', issuingState: '', expirationDate: '', file: null,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const availableCertTypes = Array.from(
    new Set(mine.map((m: any) => m.requiredCertificationType).filter((t: string) => t && t !== 'NONE')),
  ) as string[];

  useEffect(() => {
    if (availableCertTypes.length > 0 && !availableCertTypes.includes(certForm.type)) {
      setCertForm((p) => ({ ...p, type: availableCertTypes[0] }));
    } else if (availableCertTypes.length === 0 && certForm.type !== '') {
      setCertForm((p) => ({ ...p, type: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCertTypes.join(',')]);

  // Certifications are now company-admin-only server-side (403 for technicians) —
  // don't even attempt the call for a non-admin, just leave the list empty.
  const load = () => Promise.all([
    vendorApi.getCapabilities(),
    vendorApi.getMyCapabilities(),
    isCompanyAdmin ? vendorApi.getMyCertifications() : Promise.resolve([]),
  ]).then(([cat, mine_, certs]) => { setCatalog(cat); setMine(mine_); setCertifications(certs); });

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Refetch when the tab/window regains focus (Next.js has no
    // useFocusEffect equivalent) so a capability an admin adds while this
    // tab is already open shows up without a manual reload — same fix
    // already applied to the equivalent mobile screen.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompanyAdmin]);

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
    if (!certForm.type || !certForm.file || !certForm.licenseNumber || !certForm.expirationDate) return;
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
      setCertForm({ type: availableCertTypes[0] ?? '', licenseNumber: '', issuingState: '', expirationDate: '', file: null });
      await load();
    } finally {
      setSubmittingCert(false);
    }
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({
      type: c.certificationType,
      licenseNumber: c.licenseNumber,
      issuingState: c.issuingState || '',
      expirationDate: c.expirationDate ? new Date(c.expirationDate).toISOString().slice(0, 10) : '',
      file: null,
    });
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const documentKey = editForm.file ? (await uploadsApi.upload(editForm.file, 'vendor-certifications')).key : undefined;
      const updated = await vendorApi.updateCertification(id, {
        certificationType: editForm.type,
        licenseNumber: editForm.licenseNumber,
        issuingState: editForm.issuingState,
        expirationDate: editForm.expirationDate,
        ...(documentKey ? { documentKey } : {}),
      });
      setCertifications((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  const specialties = catalog.filter(isSpecialty);
  const general = catalog.filter((c) => !isSpecialty(c));

  const renderCapabilityRow = (c: any) => (
    <div key={c.id}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mineIds.has(c.id)}
          disabled={saving}
          onChange={() => toggle(c)}
          className="w-4 h-4 rounded cursor-pointer accent-lantern"
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
          <p className="text-ink">
            Read Attenteve&apos;s installer guide before selecting this capability — it covers hub/sensor pairing and where sensors go.
          </p>
          <a
            href={c.trainingDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-semibold text-lantern-deep hover:underline"
          >
            Open training guide &rarr;
          </a>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => confirmAcknowledge(c.id)}
              disabled={acknowledging}
              className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors"
            >
              {acknowledging ? 'Confirming…' : 'I have read and understand the installation process'}
            </button>
            <button onClick={() => setAckFor(null)} className="text-steel hover:text-ink px-2 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">My Capabilities & Certifications</h1>
      <p className="text-steel mb-8">Select what you can do. Trade capabilities also require an approved certification — and your company must be on the Elite plan — before matching jobs appear in the open queue.</p>

      <VerificationDocumentsSection />

      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Specialties</h2>
        <p className="text-xs text-steel mb-4">Licensed trades and premium services — matching jobs in these areas also require the Elite plan.</p>
        <div className="grid grid-cols-2 gap-3">
          {specialties.map(renderCapabilityRow)}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Capabilities</h2>
        <div className="grid grid-cols-2 gap-3">
          {general.map(renderCapabilityRow)}
        </div>
      </div>

      {isCompanyAdmin && (
      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-8">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Team Certifications</h2>
        <p className="text-xs text-steel mb-4">Every license submitted by anyone on your team — only visible and editable by company admins.</p>
        {certifications.length === 0 ? (
          <p className="text-steel text-sm mb-4">None submitted yet.</p>
        ) : (
          <div className="space-y-1 mb-4">
            {certifications.map((c) => (
              <div key={c.id} className="border-b border-canvas py-2">
                {editingId === c.id ? (
                  <div className="grid grid-cols-2 gap-3 py-1">
                    <div>
                      <label className="block text-xs font-medium text-steel mb-1">License Type</label>
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                      >
                        {ALL_CERT_TYPES.map((t) => (
                          <option key={t} value={t}>{CERT_TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-steel mb-1">License Number</label>
                      <input
                        value={editForm.licenseNumber}
                        onChange={(e) => setEditForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-steel mb-1">Issuing State</label>
                      <select
                        value={editForm.issuingState}
                        onChange={(e) => setEditForm((p) => ({ ...p, issuingState: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                      >
                        <option value="">Select state</option>
                        {US_STATES.map((s) => (
                          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-steel mb-1">Expiration Date</label>
                      <input
                        type="date"
                        value={editForm.expirationDate}
                        onChange={(e) => setEditForm((p) => ({ ...p, expirationDate: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-steel mb-1">Replace document (optional)</label>
                      <input
                        type="file"
                        onChange={(e) => setEditForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
                        className="text-sm w-full"
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={savingEdit}
                        className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-steel hover:text-ink px-2 py-2 text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div>{CERT_TYPE_LABEL[c.certificationType] ?? c.certificationType} — #{c.licenseNumber} (exp. {new Date(c.expirationDate).toLocaleDateString()})</div>
                      {c.user?.name && <div className="text-xs text-steel mt-0.5">Submitted by {c.user.name}</div>}
                      <div className="flex items-center gap-3 mt-1">
                        {c.documentUrl && (
                          <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">
                            View Document
                          </a>
                        )}
                        <button onClick={() => startEdit(c)} className="text-xs text-lantern-deep font-semibold hover:underline">
                          Edit
                        </button>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                      c.status === 'APPROVED' ? 'bg-green-50 text-green-700' : c.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'
                    }`}>{c.status}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {availableCertTypes.length === 0 ? (
          <p className="text-xs text-steel border-t border-mist-dim pt-4">
            Select a licensed trade capability above to add a matching license.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 border-t border-mist-dim pt-4">
            <div>
              <label className="block text-xs font-medium text-steel mb-1">License Type</label>
              <select
                value={certForm.type}
                onChange={(e) => setCertForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              >
                {availableCertTypes.map((t) => (
                  <option key={t} value={t}>{CERT_TYPE_LABEL[t] ?? t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-steel mb-1">License Number</label>
              <input
                value={certForm.licenseNumber}
                onChange={(e) => setCertForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                placeholder="License number"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-steel mb-1">Issuing State</label>
              <select
                value={certForm.issuingState}
                onChange={(e) => setCertForm((p) => ({ ...p, issuingState: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-steel mb-1">Expiration Date</label>
              <input
                type="date"
                value={certForm.expirationDate}
                onChange={(e) => setCertForm((p) => ({ ...p, expirationDate: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              />
            </div>
            <input
              type="file"
              onChange={(e) => setCertForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
              className="col-span-2 text-sm"
            />
            <button
              onClick={submitCertification}
              disabled={submittingCert || !certForm.file || !certForm.licenseNumber || !certForm.expirationDate}
              className="col-span-2 bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
            >
              {submittingCert ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
