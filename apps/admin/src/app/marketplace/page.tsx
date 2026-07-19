'use client';
import { useEffect, useState } from 'react';
import { marketplaceApi } from '@/lib/api';

const CLEANING_TYPE_LABELS: Record<string, string> = { STANDARD: 'Standard', DEEP: 'Deep', MOVE_OUT: 'Move-Out' };
const FREQUENCY_LABELS: Record<string, string> = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', BIWEEKLY: 'Bi-weekly', WEEKLY: 'Weekly' };
const ALL_FREQUENCIES = ['ONE_TIME', 'MONTHLY', 'BIWEEKLY', 'WEEKLY'];

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-6">
      <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">{title}</h2>
      <p className="text-xs text-steel mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-30 transition-colors"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

export default function MarketplacePage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const load = () => marketplaceApi.getConfig().then((c: any) => {
    setConfig(c);
    const d: Record<string, any> = {};
    for (const row of [...c.plans, ...c.roomUnits, ...c.conditions, ...c.addOns, ...c.frequencyDiscounts]) {
      d[row.id] = { ...row };
    }
    setDrafts(d);
  });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const setField = (id: string, field: string, value: any) => setDrafts((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const isDirty = (original: any, draft: any) => JSON.stringify(original) !== JSON.stringify(draft);

  const save = async (kind: 'plan' | 'roomUnit' | 'condition' | 'addOn' | 'frequencyDiscount', id: string, payload: any) => {
    setSaving((p) => new Set(p).add(id));
    try {
      if (kind === 'plan') await marketplaceApi.updatePlan(id, payload);
      else if (kind === 'roomUnit') await marketplaceApi.updateRoomUnit(id, payload);
      else if (kind === 'condition') await marketplaceApi.updateCondition(id, payload);
      else if (kind === 'addOn') await marketplaceApi.updateAddOn(id, payload);
      else await marketplaceApi.updateFrequencyDiscount(id, payload);
      await load();
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  if (loading || !config) return <div className="text-steel p-8">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Marketplace</h1>
      <p className="text-steel mb-8">Pricing configuration for House Cleaning subscriptions — every field here is what the mobile pricing formula actually reads, seeded with the Tennessee defaults.</p>

      <SectionCard title="Cleaning Plans" subtitle="Cost/unit (internal), retail/unit (customer-facing), and which visit frequencies each plan allows.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Type</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cost/Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Retail/Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Allowed Frequencies</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.plans.map((p: any) => {
              const d = drafts[p.id] ?? p;
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium text-ink">{CLEANING_TYPE_LABELS[p.cleaningType] ?? p.cleaningType}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.costPerUnit} onChange={(e) => setField(p.id, 'costPerUnit', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.retailPerUnit} onChange={(e) => setField(p.id, 'retailPerUnit', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {ALL_FREQUENCIES.map((f) => {
                        const checked = (d.allowedFrequencies ?? []).includes(f);
                        return (
                          <label key={f} className="flex items-center gap-1 text-xs text-steel cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={(e) => {
                              const next = e.target.checked
                                ? [...(d.allowedFrequencies ?? []), f]
                                : (d.allowedFrequencies ?? []).filter((v: string) => v !== f);
                              setField(p.id, 'allowedFrequencies', next);
                            }} className="accent-lantern" />
                            {FREQUENCY_LABELS[f]}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(p.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton dirty={isDirty(p, d)} saving={saving.has(p.id)} onClick={() => save('plan', p.id, { costPerUnit: Number(d.costPerUnit), retailPerUnit: Number(d.retailPerUnit), allowedFrequencies: d.allowedFrequencies, isActive: d.isActive })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Room Units" subtitle="Base Cleaning Unit (BCU) weight per house area.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Area</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Units</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.roomUnits.map((r: any) => {
              const d = drafts[r.id] ?? r;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-ink">{r.label}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.25" value={d.units} onChange={(e) => setField(r.id, 'units', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(r.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton dirty={isDirty(r, d)} saving={saving.has(r.id)} onClick={() => save('roomUnit', r.id, { units: Number(d.units), isActive: d.isActive })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Condition Multipliers" subtitle="Base tier (mutually exclusive) and stacking modifiers. Multiplier and base-tier/forces-quote flags are structural — only the value and enabled state are editable.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Condition</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Type</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Multiplier</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.conditions.map((c: any) => {
              const d = drafts[c.id] ?? c;
              return (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium text-ink">{c.label}</td>
                  <td className="px-3 py-2 text-xs text-steel">{c.forcesQuote ? 'Forces quote' : c.isBaseTier ? 'Base tier' : 'Stacking modifier'}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.multiplier} onChange={(e) => setField(c.id, 'multiplier', e.target.value)} disabled={c.forcesQuote} className="w-20 border border-border rounded px-2 py-1 text-right disabled:opacity-40" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(c.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton dirty={isDirty(c, d)} saving={saving.has(c.id)} onClick={() => save('condition', c.id, { multiplier: Number(d.multiplier), isActive: d.isActive })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Add-Ons" subtitle="Sub cost (internal) and customer price. Per-unit add-ons (Interior Windows, Bed Linen) charge customerPrice × the quantity the customer enters.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Add-On</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Sub Cost</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Customer Price</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.addOns.map((a: any) => {
              const d = drafts[a.id] ?? a;
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium text-ink">{a.label}{a.perUnit ? <span className="text-xs text-steel"> (per {a.unitLabel})</span> : null}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.subCost} onChange={(e) => setField(a.id, 'subCost', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.customerPrice} onChange={(e) => setField(a.id, 'customerPrice', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(a.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton dirty={isDirty(a, d)} saving={saving.has(a.id)} onClick={() => save('addOn', a.id, { subCost: Number(d.subCost), customerPrice: Number(d.customerPrice), isActive: d.isActive })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Frequency Discounts" subtitle="Discount applied to the per-visit price for recurring plans. Monthly has no row (0% by definition).">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Frequency</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Discount %</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.frequencyDiscounts.map((f: any) => {
              const d = drafts[f.id] ?? f;
              return (
                <tr key={f.id}>
                  <td className="px-3 py-2 font-medium text-ink">{FREQUENCY_LABELS[f.frequency] ?? f.frequency}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.5" value={d.discountPercent} onChange={(e) => setField(f.id, 'discountPercent', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(f.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton dirty={isDirty(f, d)} saving={saving.has(f.id)} onClick={() => save('frequencyDiscount', f.id, { discountPercent: Number(d.discountPercent), isActive: d.isActive })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
