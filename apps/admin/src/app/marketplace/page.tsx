'use client';
import { useEffect, useState } from 'react';
import { marketplaceApi, pricingApi, adminApi } from '@/lib/api';

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

// Holds every table for one Marketplace subscription type (today: House
// Cleaning's 5 tables). Each future subscription type gets its own sibling
// CollapsibleGroup with its own groupKey — a light wrapper around
// SectionCards, not itself card-styled, so it doesn't double up borders.
function CollapsibleGroup({ label, collapsed, onToggle, children }: { label: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 mb-4 text-left"
      >
        <span className={`inline-block text-xs text-steel transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
        <h2 className="text-lg font-bold text-lantern-deep">{label}</h2>
      </button>
      {!collapsed && children}
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
  // Accordion: at most one group open at a time — opening one collapses
  // whichever other was open. null means everything starts collapsed.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const toggleGroupCollapsed = (key: string) =>
    setOpenGroup((prev) => (prev === key ? null : key));

  const load = () => Promise.all([marketplaceApi.getConfig(), marketplaceApi.getLawncareConfig(), marketplaceApi.getPestConfig(), pricingApi.getAll(), adminApi.getCapabilities()]).then(([c, lc, pc, catalog, capabilities]: any[]) => {
    // Catalog items (the general ServicePrice table, managed day-to-day on
    // the Pricing page) that are also tagged serviceGroups: MARKETPLACE —
    // e.g. Flooring Services — so they're visible/editable here too, not
    // just buried in the full catalog. Not a 4th dedicated vertical (no
    // packages/property-profile of its own): just the same rows, filtered.
    // Excludes the 3 placeholder catalog rows ('House Cleaning', 'Lawncare
    // Subscription', 'Pest Control Subscription') that back the 3 dedicated
    // verticals above — their real config is already shown/edited there;
    // these stub rows' own price fields are unused, so surfacing them here
    // too would just be confusing dead fields (see MarketplaceService's
    // HOUSE_CLEANING_CATALOG_NAME/LAWNCARE_CATALOG_NAME/
    // PEST_CONTROL_CATALOG_NAME).
    const MARKETPLACE_STUB_NAMES = new Set(['House Cleaning', 'Lawncare Subscription', 'Pest Control Subscription']);
    const otherMarketplaceServices = catalog.filter((s: any) => s.serviceGroups?.includes('MARKETPLACE') && !MARKETPLACE_STUB_NAMES.has(s.name));
    const merged = {
      ...c, lawncareServices: lc.services, lawncarePackages: lc.packages,
      lawncarePropertyDetailFields: lc.propertyDetailFields,
      pestServices: pc.services, pestPackages: pc.packages,
      otherMarketplaceServices, capabilities,
    };
    setConfig(merged);
    const d: Record<string, any> = {};
    for (const row of [...c.plans, ...c.roomUnits, ...c.conditions, ...c.addOns, ...c.frequencyDiscounts, ...lc.services, ...lc.packages, ...lc.propertyDetailFields, ...pc.services, ...pc.packages, ...otherMarketplaceServices]) {
      d[row.id] = { ...row };
    }
    setDrafts(d);
  });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const setField = (id: string, field: string, value: any) => setDrafts((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const isDirty = (original: any, draft: any) => JSON.stringify(original) !== JSON.stringify(draft);

  const save = async (kind: 'plan' | 'roomUnit' | 'condition' | 'addOn' | 'frequencyDiscount' | 'lawncareService' | 'lawncarePackage' | 'lawncarePropertyDetailField' | 'pestService' | 'pestPackage' | 'catalogService', id: string, payload: any) => {
    setSaving((p) => new Set(p).add(id));
    try {
      if (kind === 'plan') await marketplaceApi.updatePlan(id, payload);
      else if (kind === 'roomUnit') await marketplaceApi.updateRoomUnit(id, payload);
      else if (kind === 'condition') await marketplaceApi.updateCondition(id, payload);
      else if (kind === 'addOn') await marketplaceApi.updateAddOn(id, payload);
      else if (kind === 'frequencyDiscount') await marketplaceApi.updateFrequencyDiscount(id, payload);
      else if (kind === 'lawncareService') await marketplaceApi.updateLawncareService(id, payload);
      else if (kind === 'lawncarePackage') await marketplaceApi.updateLawncarePackage(id, payload);
      else if (kind === 'lawncarePropertyDetailField') await marketplaceApi.updateLawncarePropertyDetailField(id, payload);
      else if (kind === 'pestService') await marketplaceApi.updatePestService(id, payload);
      else if (kind === 'pestPackage') await marketplaceApi.updatePestPackage(id, payload);
      else await pricingApi.update(id, payload);
      await load();
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const [addingField, setAddingField] = useState(false);
  const addPropertyDetailField = async () => {
    setAddingField(true);
    try {
      await marketplaceApi.createLawncarePropertyDetailField('New Field', 'count');
      await load();
    } finally {
      setAddingField(false);
    }
  };

  const [removingFieldId, setRemovingFieldId] = useState<string | null>(null);
  const removePropertyDetailField = async (id: string) => {
    setRemovingFieldId(id);
    try {
      await marketplaceApi.removeLawncarePropertyDetailField(id);
      await load();
    } finally {
      setRemovingFieldId(null);
    }
  };

  const [addingOffer, setAddingOffer] = useState(false);
  const addMarketplaceOffer = async () => {
    setAddingOffer(true);
    try {
      await pricingApi.create({
        name: 'New Marketplace Offer', description: '', basePrice: 0,
        pricingMethod: 'REQUEST_QUOTE', requiresQuote: true, serviceGroups: ['MARKETPLACE'], isActive: true,
      });
      await load();
    } finally {
      setAddingOffer(false);
    }
  };

  const [removingOfferId, setRemovingOfferId] = useState<string | null>(null);
  const removeMarketplaceOffer = async (id: string) => {
    setRemovingOfferId(id);
    try {
      await pricingApi.remove(id);
      await load();
    } finally {
      setRemovingOfferId(null);
    }
  };

  // Local-only draft state for the Lawn Mowing size-tier table — a nested
  // array field on one service row, doesn't fit the generic flat-field
  // drafts/setField mechanism above.
  const [tierDrafts, setTierDrafts] = useState<any[] | null>(null);
  const [savingTiers, setSavingTiers] = useState(false);
  const lawnMowingService = config?.lawncareServices?.find((s: any) => s.key === 'lawn_mowing');
  const activeTierDrafts = tierDrafts ?? lawnMowingService?.sizeTiers ?? [];
  const tiersDirty = tierDrafts != null && JSON.stringify(tierDrafts) !== JSON.stringify(lawnMowingService?.sizeTiers ?? []);
  const setTierField = (index: number, field: string, value: any) => {
    setTierDrafts((prev) => {
      const base = prev ?? lawnMowingService?.sizeTiers ?? [];
      return base.map((t: any, i: number) => (i === index ? { ...t, [field]: value } : t));
    });
  };
  const saveTiers = async () => {
    if (!lawnMowingService || !tierDrafts) return;
    setSavingTiers(true);
    try {
      await marketplaceApi.updateLawncareService(lawnMowingService.id, { sizeTiers: tierDrafts });
      setTierDrafts(null);
      await load();
    } finally {
      setSavingTiers(false);
    }
  };

  if (loading || !config) return <div className="text-steel p-8">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Marketplace</h1>
      <p className="text-steel mb-8">Pricing configuration for Marketplace subscriptions, grouped by service — every field here is what the mobile pricing formula actually reads.</p>

      <CollapsibleGroup
        label="House Cleaning"
        collapsed={openGroup !== 'HOUSE_CLEANING'}
        onToggle={() => toggleGroupCollapsed('HOUSE_CLEANING')}
      >
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
      </CollapsibleGroup>

      <CollapsibleGroup
        label="Lawncare"
        collapsed={openGroup !== 'LAWN_LANDSCAPING'}
        onToggle={() => toggleGroupCollapsed('LAWN_LANDSCAPING')}
      >
      <SectionCard title="Lawncare Services" subtitle="À-la-carte pricing per service. Sub cost is paid to the vendor; customer price is what the customer is charged. Base + per-unit covers services priced per additional unit beyond what's included. Volume discount text is always the source of truth (shown to customers/vendors) — the numeric tiers are optional structured data for a future quote engine.">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Service</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Pricing Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Frequency</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Sub Cost Base</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Sub Cost/Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Price Base</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Price/Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Volume Discount</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Threshold 1</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Rate 1 %</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Threshold 2</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Rate 2 %</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.lawncareServices.map((s: any) => {
              const d = drafts[s.id] ?? s;
              const tierPriced = s.key === 'lawn_mowing';
              return (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{s.label}</td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.pricingUnit} onChange={(e) => setField(s.id, 'pricingUnit', e.target.value)} className="w-32 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.recommendedFrequency} onChange={(e) => setField(s.id, 'recommendedFrequency', e.target.value)} className="w-28 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.subCostBase} disabled={tierPriced} title={tierPriced ? 'Ignored — priced from Size Tiers below' : undefined} onChange={(e) => setField(s.id, 'subCostBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right disabled:opacity-30 disabled:bg-canvas" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.subCostPerUnit} disabled={tierPriced} title={tierPriced ? 'Ignored — priced from Size Tiers below' : undefined} onChange={(e) => setField(s.id, 'subCostPerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right disabled:opacity-30 disabled:bg-canvas" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.customerPriceBase} disabled={tierPriced} title={tierPriced ? 'Ignored — priced from Size Tiers below' : undefined} onChange={(e) => setField(s.id, 'customerPriceBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right disabled:opacity-30 disabled:bg-canvas" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.customerPricePerUnit} disabled={tierPriced} title={tierPriced ? 'Ignored — priced from Size Tiers below' : undefined} onChange={(e) => setField(s.id, 'customerPricePerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right disabled:opacity-30 disabled:bg-canvas" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.volumeDiscountText} onChange={(e) => setField(s.id, 'volumeDiscountText', e.target.value)} className="w-44 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.volumeDiscountThreshold1 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountThreshold1', e.target.value === '' ? null : e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.5" value={d.volumeDiscountRate1 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountRate1', e.target.value === '' ? null : e.target.value)} className="w-16 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.volumeDiscountThreshold2 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountThreshold2', e.target.value === '' ? null : e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.5" value={d.volumeDiscountRate2 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountRate2', e.target.value === '' ? null : e.target.value)} className="w-16 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(s.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton
                      dirty={isDirty(s, d)}
                      saving={saving.has(s.id)}
                      onClick={() => save('lawncareService', s.id, {
                        pricingUnit: d.pricingUnit,
                        recommendedFrequency: d.recommendedFrequency,
                        subCostBase: Number(d.subCostBase),
                        subCostPerUnit: Number(d.subCostPerUnit),
                        customerPriceBase: Number(d.customerPriceBase),
                        customerPricePerUnit: Number(d.customerPricePerUnit),
                        volumeDiscountText: d.volumeDiscountText,
                        volumeDiscountThreshold1: d.volumeDiscountThreshold1 === '' || d.volumeDiscountThreshold1 === null ? null : Number(d.volumeDiscountThreshold1),
                        volumeDiscountRate1: d.volumeDiscountRate1 === '' || d.volumeDiscountRate1 === null ? null : Number(d.volumeDiscountRate1),
                        volumeDiscountThreshold2: d.volumeDiscountThreshold2 === '' || d.volumeDiscountThreshold2 === null ? null : Number(d.volumeDiscountThreshold2),
                        volumeDiscountRate2: d.volumeDiscountRate2 === '' || d.volumeDiscountRate2 === null ? null : Number(d.volumeDiscountRate2),
                        isActive: d.isActive,
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </SectionCard>

      {lawnMowingService && (
        <SectionCard title="Lawn Mowing Size Tiers" subtitle="What actually prices Lawn Mowing now — the Sub Cost/Cust. Price columns above are ignored for this service. Price = Base + Add'l Rate × (Max SF ÷ 1000). Leave Add'l Rate blank and check Custom Quote for a tier with no computed price (e.g. Large Estate).">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist-dim">
                <th className="px-3 py-2 text-left font-semibold text-steel">Tier</th>
                <th className="px-3 py-2 text-right font-semibold text-steel">Max SF</th>
                <th className="px-3 py-2 text-right font-semibold text-steel">Vendor Base</th>
                <th className="px-3 py-2 text-right font-semibold text-steel">Vendor Add'l/1000 SF</th>
                <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Base</th>
                <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Add'l/1000 SF</th>
                <th className="px-3 py-2 text-center font-semibold text-steel">Custom Quote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {activeTierDrafts.map((t: any, i: number) => (
                <tr key={t.key}>
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{t.label}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="1" value={t.maxSF ?? ''} onChange={(e) => setTierField(i, 'maxSF', e.target.value === '' ? null : Number(e.target.value))} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={t.vendorBase ?? ''} onChange={(e) => setTierField(i, 'vendorBase', e.target.value === '' ? null : Number(e.target.value))} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={t.vendorAddlRate ?? ''} onChange={(e) => setTierField(i, 'vendorAddlRate', e.target.value === '' ? null : Number(e.target.value))} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={t.customerBase ?? ''} onChange={(e) => setTierField(i, 'customerBase', e.target.value === '' ? null : Number(e.target.value))} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={t.customerAddlRate ?? ''} onChange={(e) => setTierField(i, 'customerAddlRate', e.target.value === '' ? null : Number(e.target.value))} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!t.requiresQuote} onChange={(e) => setTierField(i, 'requiresQuote', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="mt-4">
            <SaveButton dirty={tiersDirty} saving={savingTiers} onClick={saveTiers} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Property Details" subtitle="Admin-manageable fields shown on the customer's Lawncare property-details form (Property Size is separate — see Size Tiers above). Add/remove take effect immediately; label/unit edits use Save like every other table.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Label</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Unit</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {(config.lawncarePropertyDetailFields ?? []).map((f: any) => {
              const d = drafts[f.id] ?? f;
              return (
                <tr key={f.id}>
                  <td className="px-3 py-2">
                    <input type="text" value={d.label} onChange={(e) => setField(f.id, 'label', e.target.value)} className="w-56 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.unit} onChange={(e) => setField(f.id, 'unit', e.target.value)} className="w-24 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(f.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <SaveButton
                      dirty={isDirty(f, d)}
                      saving={saving.has(f.id)}
                      onClick={() => save('lawncarePropertyDetailField', f.id, { label: d.label, unit: d.unit, isActive: d.isActive })}
                    />
                    <button
                      onClick={() => removePropertyDetailField(f.id)}
                      disabled={removingFieldId === f.id}
                      className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30"
                    >
                      ✕ Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={addPropertyDetailField}
          disabled={addingField}
          className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors"
        >
          {addingField ? 'Adding…' : '+ New Field'}
        </button>
      </SectionCard>

      <SectionCard title="Subscription Packages" subtitle="Bundled monthly Lawncare tiers. &quot;Starting at&quot; marks a tier priced as a floor rather than a flat rate (e.g. Estate).">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Package</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Description</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Monthly Price</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Starting At</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.lawncarePackages.map((pkg: any) => {
              const d = drafts[pkg.id] ?? pkg;
              return (
                <tr key={pkg.id}>
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{pkg.label}</td>
                  <td className="px-3 py-2">
                    <textarea value={d.description} onChange={(e) => setField(pkg.id, 'description', e.target.value)} rows={4} className="w-96 border border-border rounded px-2 py-1 whitespace-pre-wrap" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.monthlyPrice} onChange={(e) => setField(pkg.id, 'monthlyPrice', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isStartingAt} onChange={(e) => setField(pkg.id, 'isStartingAt', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(pkg.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton
                      dirty={isDirty(pkg, d)}
                      saving={saving.has(pkg.id)}
                      onClick={() => save('lawncarePackage', pkg.id, {
                        description: d.description,
                        monthlyPrice: Number(d.monthlyPrice),
                        isStartingAt: d.isStartingAt,
                        isActive: d.isActive,
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
      </CollapsibleGroup>

      <CollapsibleGroup
        label="Pest Control"
        collapsed={openGroup !== 'PEST_CONTROL'}
        onToggle={() => toggleGroupCollapsed('PEST_CONTROL')}
      >
      <SectionCard title="Pest Control Services" subtitle="À-la-carte pricing per service. Dimension 2 (Per-Unit 2 / Included 2) only applies to the Premium/Ultimate memberships, which scale by both home sq ft and lot acreage at once — leave at 0 for every other service. Volume discount text is always the source of truth. Membership benefits (e.g. &quot;Included with Ultimate&quot;) and frequency discounts are seed-configured, not editable here yet.">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Service</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Pricing Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Frequency</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Sub Cost Base</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Sub Cost/Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Price Base</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Price/Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Cust. Price/Unit 2</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Volume Discount</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Threshold 1</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Rate 1 %</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.pestServices.map((s: any) => {
              const d = drafts[s.id] ?? s;
              return (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{s.label}</td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.pricingUnit} onChange={(e) => setField(s.id, 'pricingUnit', e.target.value)} className="w-32 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.recommendedFrequency} onChange={(e) => setField(s.id, 'recommendedFrequency', e.target.value)} className="w-28 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.subCostBase} onChange={(e) => setField(s.id, 'subCostBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.001" value={d.subCostPerUnit} onChange={(e) => setField(s.id, 'subCostPerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.customerPriceBase} onChange={(e) => setField(s.id, 'customerPriceBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.001" value={d.customerPricePerUnit} onChange={(e) => setField(s.id, 'customerPricePerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.customerPricePerUnit2} onChange={(e) => setField(s.id, 'customerPricePerUnit2', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.volumeDiscountText} onChange={(e) => setField(s.id, 'volumeDiscountText', e.target.value)} className="w-44 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.volumeDiscountThreshold1 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountThreshold1', e.target.value === '' ? null : e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.5" value={d.volumeDiscountRate1 ?? ''} onChange={(e) => setField(s.id, 'volumeDiscountRate1', e.target.value === '' ? null : e.target.value)} className="w-16 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(s.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton
                      dirty={isDirty(s, d)}
                      saving={saving.has(s.id)}
                      onClick={() => save('pestService', s.id, {
                        pricingUnit: d.pricingUnit,
                        recommendedFrequency: d.recommendedFrequency,
                        subCostBase: Number(d.subCostBase),
                        subCostPerUnit: Number(d.subCostPerUnit),
                        customerPriceBase: Number(d.customerPriceBase),
                        customerPricePerUnit: Number(d.customerPricePerUnit),
                        customerPricePerUnit2: Number(d.customerPricePerUnit2),
                        volumeDiscountText: d.volumeDiscountText,
                        volumeDiscountThreshold1: d.volumeDiscountThreshold1 === '' || d.volumeDiscountThreshold1 === null ? null : Number(d.volumeDiscountThreshold1),
                        volumeDiscountRate1: d.volumeDiscountRate1 === '' || d.volumeDiscountRate1 === null ? null : Number(d.volumeDiscountRate1),
                        isActive: d.isActive,
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </SectionCard>

      <SectionCard title="Subscription Packages" subtitle="Bundled monthly Pest Control tiers (Basic/Premium/Ultimate Protection). Composition (which services drive the computed price) is seed-configured, not editable here yet.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Package</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Description</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Monthly Price</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {config.pestPackages.map((pkg: any) => {
              const d = drafts[pkg.id] ?? pkg;
              return (
                <tr key={pkg.id}>
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{pkg.label}</td>
                  <td className="px-3 py-2">
                    <textarea value={d.description} onChange={(e) => setField(pkg.id, 'description', e.target.value)} rows={3} className="w-96 border border-border rounded px-2 py-1 whitespace-pre-wrap" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={d.monthlyPrice} onChange={(e) => setField(pkg.id, 'monthlyPrice', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(pkg.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2">
                    <SaveButton
                      dirty={isDirty(pkg, d)}
                      saving={saving.has(pkg.id)}
                      onClick={() => save('pestPackage', pkg.id, {
                        description: d.description,
                        monthlyPrice: Number(d.monthlyPrice),
                        isActive: d.isActive,
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
      </CollapsibleGroup>

      <CollapsibleGroup
        label="Marketplace Offers"
        collapsed={openGroup !== 'OTHER_MARKETPLACE'}
        onToggle={() => toggleGroupCollapsed('OTHER_MARKETPLACE')}
      >
      <SectionCard title="Marketplace Offers" subtitle="Standalone offers on the Marketplace tab of the customer app (alongside House Cleaning/Lawncare/Pest Control) that don't need their own dedicated packages or property profile — e.g. Flooring Services. Create/edit/remove here; full field editing (category, pricing method, volume tiers) stays on the Pricing page.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist-dim">
              <th className="px-3 py-2 text-left font-semibold text-steel">Offer</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Description</th>
              <th className="px-3 py-2 text-right font-semibold text-steel">Price</th>
              <th className="px-3 py-2 text-left font-semibold text-steel">Capability</th>
              <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {(config.otherMarketplaceServices ?? []).map((s: any) => {
              const d = drafts[s.id] ?? s;
              return (
                <tr key={s.id}>
                  <td className="px-3 py-2">
                    <input type="text" value={d.name ?? ''} onChange={(e) => setField(s.id, 'name', e.target.value)} className="w-48 border border-border rounded px-2 py-1 font-medium" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={d.description ?? ''} onChange={(e) => setField(s.id, 'description', e.target.value)} className="w-64 border border-border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.requiresQuote ? (
                      <span className="text-xs text-steel italic">Request Quote</span>
                    ) : (
                      <input type="number" step="0.01" value={d.basePrice} onChange={(e) => setField(s.id, 'basePrice', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select value={d.requiredCapabilityId ?? ''} onChange={(e) => setField(s.id, 'requiredCapabilityId', e.target.value || null)} className="w-44 border border-border rounded px-2 py-1">
                      <option value="">Any vendor</option>
                      {(config.capabilities ?? []).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={d.isActive} onChange={(e) => setField(s.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <SaveButton
                      dirty={isDirty(s, d)}
                      saving={saving.has(s.id)}
                      onClick={() => save('catalogService', s.id, {
                        name: d.name,
                        description: d.description,
                        basePrice: d.requiresQuote ? s.basePrice : Number(d.basePrice),
                        requiredCapabilityId: d.requiredCapabilityId || null,
                        isActive: d.isActive,
                      })}
                    />
                    <button
                      onClick={() => removeMarketplaceOffer(s.id)}
                      disabled={removingOfferId === s.id}
                      className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30"
                    >
                      ✕ Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={addMarketplaceOffer}
          disabled={addingOffer}
          className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors"
        >
          {addingOffer ? 'Adding…' : '+ Add Marketplace Offer'}
        </button>
      </SectionCard>
      </CollapsibleGroup>
    </div>
  );
}
