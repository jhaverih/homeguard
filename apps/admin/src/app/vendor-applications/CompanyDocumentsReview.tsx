'use client';
import { useState } from 'react';
import { adminApi } from '@/lib/api';

// Review box for a company's state business registrations and certificate of
// insurance, shown inside an expanded application. Both are read by the AI
// laptop first; this shows what was read, why something needs a closer look,
// and lets an admin correct values and approve or reject each document.
//
// Approving the whole application also approves documents that passed the
// automatic checks ("Pending verification"); ones still reading or flagged
// "Needs review" must be decided here first.

const STATUS_LABEL: Record<string, string> = {
  READING: 'Reading…',
  PENDING_REVIEW: 'Pending verification',
  NEEDS_REVIEW: 'Needs review',
  APPROVED: 'Approved',
  REJECTED: 'Not accepted',
  EXPIRED: 'Expired',
};
const STATUS_STYLE: Record<string, string> = {
  READING: 'bg-mist-dim text-steel',
  PENDING_REVIEW: 'bg-yellow-50 text-yellow-700',
  NEEDS_REVIEW: 'bg-orange-50 text-orange-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-600',
  EXPIRED: 'bg-red-50 text-red-600',
};

function Status({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-steel">Not uploaded</span>;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${STATUS_STYLE[status] ?? 'bg-mist-dim text-steel'}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function Reasons({ reasons }: { reasons?: string[] | null }) {
  if (!reasons?.length) return null;
  return (
    <ul className="mt-1 mb-1 text-xs text-orange-700 list-disc ml-4">
      {reasons.map((r) => <li key={r}>{r}</li>)}
    </ul>
  );
}

// Approve / reject controls with an optional note and correction fields.
function Decide({ fields, onDecide }: {
  fields: { key: string; label: string; type?: string; initial: string }[];
  onDecide: (status: 'APPROVED' | 'REJECTED', note: string, values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.initial])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (status: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    setError('');
    try {
      await onDecide(status, note.trim(), values);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save the decision.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 bg-white border border-border rounded-lg p-3">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="text-xs text-steel">
            {f.label}
            <input
              type={f.type ?? 'text'}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-0.5 w-full border border-border rounded-md px-2 py-1 text-sm text-ink"
            />
          </label>
        ))}
      </div>
      <input
        placeholder="Note to the vendor (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2 w-full border border-border rounded-md px-2 py-1 text-sm"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button disabled={busy} onClick={() => go('APPROVED')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-green-400 bg-green-50 text-green-700 disabled:opacity-50">Approve</button>
        <button disabled={busy} onClick={() => go('REJECTED')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-400 bg-red-50 text-red-700 disabled:opacity-50">Reject</button>
      </div>
    </div>
  );
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US')}`);
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

export function CompanyDocumentsReview({ item, onChanged }: { item: any; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const states: any[] = item.states ?? [];
  const ins = item.insurance ?? {};
  const canDecide = (status: string | null | undefined) => !!status && status !== 'READING';

  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-ink mb-1">State business registrations</h3>
      {states.length === 0 && <p className="text-xs text-steel mb-2">No service area or registrations yet.</p>}
      {states.map((s) => {
        const r = s.registration;
        const key = `reg-${s.state}`;
        return (
          <div key={s.state} className="text-sm text-steel mb-2 border-l-2 border-mist-dim pl-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{s.state}</span>
              <Status status={r?.status} />
              {s.canOperate && <span className="text-xs text-green-700">can operate</span>}
              {!s.required && <span className="text-xs text-steel">(no counties here)</span>}
              {!s.open && <span className="text-xs text-steel">(state not open)</span>}
              {r?.graceUntil && !r.documentUrl && <span className="text-xs text-orange-700">temporary pass until {day(r.graceUntil)}, no document</span>}
              {r?.documentUrl && <a href={r.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">document</a>}
            </div>
            {r?.documentUrl && r.status !== 'READING' && (
              <p className="text-xs">
                Read: {r.businessName ?? '—'} · #{r.entityNumber ?? '—'} · state {r.registeredState ?? '—'} · status {r.registrationStatus ?? '—'} · formed {day(r.formationDate)}
                {r.extractionConfidence && ` · ${r.extractionConfidence} confidence`}
              </p>
            )}
            <Reasons reasons={r?.reviewReasons} />
            {r?.documentUrl && canDecide(r.status) && (
              open === key ? (
                <Decide
                  fields={[
                    { key: 'businessName', label: 'Business name', initial: r.businessName ?? '' },
                    { key: 'entityNumber', label: 'Entity number', initial: r.entityNumber ?? '' },
                  ]}
                  onDecide={async (status, note, v) => {
                    await adminApi.reviewStateRegistration(r.id, status, note || undefined, {
                      businessName: v.businessName || undefined, entityNumber: v.entityNumber || undefined,
                    });
                    setOpen(null);
                    onChanged();
                  }}
                />
              ) : (
                <button onClick={() => setOpen(key)} className="text-xs font-semibold text-lantern-deep hover:underline">Review {s.state} registration</button>
              )
            )}
          </div>
        );
      })}

      <h3 className="text-sm font-semibold text-ink mt-3 mb-1">Certificate of insurance</h3>
      <div className="text-sm text-steel border-l-2 border-mist-dim pl-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Status status={item.coiDocumentKey ? ins.coiStatus : null} />
          {item.coiExpirationDate && <span className="text-xs">expires {day(item.coiExpirationDate)}</span>}
          {item.coiUrl && <a href={item.coiUrl} target="_blank" rel="noreferrer" className="text-xs text-lantern-deep font-semibold hover:underline">document</a>}
        </div>
        {ins.coiInsuredName && (
          <p className="text-xs">
            Read: insured {ins.coiInsuredName} · {ins.coiInsurerName ?? '—'} · policy {ins.coiPolicyNumber ?? '—'} · GL {money(ins.coiGeneralLiability)} per occurrence ·
            additional insured {ins.coiAdditionalInsured ? (ins.coiAdditionalInsuredName ?? 'yes') : 'not shown'}
          </p>
        )}
        <Reasons reasons={ins.coiReviewReasons} />
        {item.coiDocumentKey && canDecide(ins.coiStatus) && (
          open === 'coi' ? (
            <Decide
              fields={[{ key: 'expirationDate', label: 'Expiration date', type: 'date', initial: item.coiExpirationDate ? String(item.coiExpirationDate).slice(0, 10) : '' }]}
              onDecide={async (status, note, v) => {
                await adminApi.reviewInsurance(item.id, status, note || undefined, { expirationDate: v.expirationDate || undefined });
                setOpen(null);
                onChanged();
              }}
            />
          ) : (
            <button onClick={() => setOpen('coi')} className="text-xs font-semibold text-lantern-deep hover:underline">Review certificate</button>
          )
        )}
      </div>
    </div>
  );
}
