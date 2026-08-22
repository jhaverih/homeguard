'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsThresholdsApi } from '@/lib/api';
import { CustomerPicker, Customer } from '@/components/CustomerPicker';

type ThresholdRow = {
  key: string; label: string; description: string; unit: string;
  min: number; max: number; defaultValue: number;
  platformValue: number; customerValue: number | null; ruleIds: string[];
};

function ThresholdTable({
  rows, edits, onEdit, onSave, onClear, savingKey, mode,
}: {
  rows: ThresholdRow[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  onSave: (row: ThresholdRow) => void;
  onClear?: (row: ThresholdRow) => void;
  savingKey: string | null;
  mode: 'platform' | 'customer';
}) {
  return (
    <div className="bg-white border border-mist-dim rounded-2xl overflow-hidden">
      {rows.map((row) => {
        const currentValue = mode === 'platform' ? row.platformValue : row.customerValue ?? row.platformValue;
        const editValue = edits[row.key] ?? String(currentValue);
        const dirty = editValue !== String(currentValue);
        const hasOverride = mode === 'customer' && row.customerValue != null;
        return (
          <div key={row.key} className="flex items-center gap-5 px-6 py-5 border-b border-canvas last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base font-extrabold text-ink">{row.label}</span>
                {hasOverride && (
                  <span className="text-xs font-bold text-lantern-deep bg-[#FFF7ED] px-2.5 py-0.5 rounded-full">Custom override</span>
                )}
              </div>
              <p className="text-sm text-steel mt-1 max-w-xl">{row.description}</p>
              <p className="text-xs text-steel-quiet mt-1.5">
                Platform default: <span className="font-bold tabular-nums">{row.defaultValue}{row.unit}</span>
                {' · '}Affects: {row.ruleIds.join(', ')}
                {mode === 'customer' && row.customerValue == null && <> · Currently using the platform value ({row.platformValue}{row.unit})</>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                value={editValue}
                onChange={(e) => onEdit(row.key, e.target.value)}
                min={row.min}
                max={row.max}
                className="w-28 text-base font-bold tabular-nums text-right px-3 py-2.5 border border-mist-dim rounded-lg outline-none focus:border-lantern"
              />
              <span className="text-sm text-steel-quiet w-10">{row.unit}</span>
              <button
                type="button"
                disabled={!dirty || savingKey === row.key}
                onClick={() => onSave(row)}
                className="text-sm font-bold px-4 py-2.5 rounded-lg bg-lantern-deep text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {savingKey === row.key ? 'Saving…' : 'Save'}
              </button>
              {mode === 'customer' && onClear && (
                <button
                  type="button"
                  disabled={!hasOverride || savingKey === row.key}
                  onClick={() => onClear(row)}
                  className="text-sm font-bold px-3 py-2.5 rounded-lg border border-mist-dim text-steel disabled:opacity-30 disabled:cursor-not-allowed hover:bg-canvas"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsThresholdsPage() {
  const [platformRows, setPlatformRows] = useState<ThresholdRow[] | null>(null);
  const [platformEdits, setPlatformEdits] = useState<Record<string, string>>({});
  const [platformSavingKey, setPlatformSavingKey] = useState<string | null>(null);
  const [platformError, setPlatformError] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerRows, setCustomerRows] = useState<ThresholdRow[] | null>(null);
  const [customerEdits, setCustomerEdits] = useState<Record<string, string>>({});
  const [customerSavingKey, setCustomerSavingKey] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState(false);

  const loadPlatform = () => {
    analyticsThresholdsApi.getPlatform()
      .then((rows) => { setPlatformRows(rows); setPlatformError(false); })
      .catch(() => setPlatformError(true));
  };

  useEffect(() => { loadPlatform(); }, []);

  useEffect(() => {
    if (!customer) { setCustomerRows(null); return; }
    setCustomerRows(null);
    setCustomerError(false);
    analyticsThresholdsApi.getForCustomer(customer.id)
      .then(setCustomerRows)
      .catch(() => setCustomerError(true));
  }, [customer]);

  const savePlatform = async (row: ThresholdRow) => {
    const value = Number(platformEdits[row.key]);
    if (Number.isNaN(value)) return;
    setPlatformSavingKey(row.key);
    try {
      await analyticsThresholdsApi.setPlatformValue(row.key, value);
      setPlatformEdits((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
      loadPlatform();
    } catch {
      alert(`Couldn't save ${row.label} — check the value is between ${row.min} and ${row.max} ${row.unit}.`);
    } finally {
      setPlatformSavingKey(null);
    }
  };

  const saveCustomer = async (row: ThresholdRow) => {
    if (!customer) return;
    const value = Number(customerEdits[row.key]);
    if (Number.isNaN(value)) return;
    setCustomerSavingKey(row.key);
    try {
      await analyticsThresholdsApi.setCustomerValue(row.key, customer.id, value);
      setCustomerEdits((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
      const rows = await analyticsThresholdsApi.getForCustomer(customer.id);
      setCustomerRows(rows);
    } catch {
      alert(`Couldn't save ${row.label} — check the value is between ${row.min} and ${row.max} ${row.unit}.`);
    } finally {
      setCustomerSavingKey(null);
    }
  };

  const clearCustomer = async (row: ThresholdRow) => {
    if (!customer) return;
    setCustomerSavingKey(row.key);
    try {
      await analyticsThresholdsApi.clearCustomerValue(row.key, customer.id);
      const rows = await analyticsThresholdsApi.getForCustomer(customer.id);
      setCustomerRows(rows);
    } finally {
      setCustomerSavingKey(null);
    }
  };

  return (
    <div>
      <div className="mb-7">
        <Link href="/hvac-analytics" className="text-sm font-bold text-steel hover:text-ink">← Back to HVAC Analytics</Link>
        <h1 className="text-3xl font-bold text-lantern-deep mb-2 mt-2">Analytics Thresholds</h1>
        <p className="text-steel text-base max-w-2xl">
          Every numeric threshold the HVAC analytics engine evaluates against — nothing is hardcoded in the rule logic.
          Set a platform-wide default below, and optionally override it for one customer if their home needs a different value.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-lg font-extrabold text-ink mb-3">Platform Defaults</h2>
          {platformError ? (
            <div className="bg-white rounded-2xl border border-mist-dim p-10 text-center text-steel text-base">Couldn&apos;t load thresholds.</div>
          ) : !platformRows ? (
            <div className="text-steel text-base">Loading…</div>
          ) : (
            <ThresholdTable
              rows={platformRows}
              edits={platformEdits}
              onEdit={(key, value) => setPlatformEdits((prev) => ({ ...prev, [key]: value }))}
              onSave={savePlatform}
              savingKey={platformSavingKey}
              mode="platform"
            />
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-5 flex-wrap mb-3">
            <h2 className="text-lg font-extrabold text-ink">Customer Overrides</h2>
            <CustomerPicker selected={customer} onSelect={setCustomer} placeholder="Select a customer to override…" />
          </div>
          {!customer ? (
            <div className="bg-white rounded-2xl border border-mist-dim p-10 text-center text-steel text-base">
              Search for a customer above to set thresholds specific to their home.
            </div>
          ) : customerError ? (
            <div className="bg-white rounded-2xl border border-mist-dim p-10 text-center text-steel text-base">Couldn&apos;t load thresholds for {customer.name}.</div>
          ) : !customerRows ? (
            <div className="text-steel text-base">Loading…</div>
          ) : (
            <ThresholdTable
              rows={customerRows}
              edits={customerEdits}
              onEdit={(key, value) => setCustomerEdits((prev) => ({ ...prev, [key]: value }))}
              onSave={saveCustomer}
              onClear={clearCustomer}
              savingKey={customerSavingKey}
              mode="customer"
            />
          )}
        </div>
      </div>
    </div>
  );
}
