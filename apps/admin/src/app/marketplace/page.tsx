'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { marketplaceApi, pricingApi, adminApi, templateApi } from '@/lib/api';

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

// Self-service Marketplace Offer Template builder — a genuinely different
// shape from the rest of this page (per-template nested config, lazily
// loaded on selection) so it keeps its own local load/drafts/save state
// rather than folding into the page-wide `config`/`drafts` singleton above.
// Mirrors the same table/SaveButton/create-then-inline-edit/remove patterns
// as every other section on this page — see addPropertyDetailField /
// removePropertyDetailField / addMarketplaceOffer for the precedent.
function OfferTemplatesSection({ collapsed, onToggle, initialTemplateId, autoAddService }: { collapsed: boolean; onToggle: () => void; initialTemplateId?: string | null; autoAddService?: boolean }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tConfig, setTConfig] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tDrafts, setTDrafts] = useState<Record<string, any>>({});
  const [tSaving, setTSaving] = useState<Set<string>>(new Set());
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [removingTemplate, setRemovingTemplate] = useState(false);
  const [addingKind, setAddingKind] = useState<string | null>(null);
  const [removingRowId, setRemovingRowId] = useState<string | null>(null);

  const tIsDirty = (original: any, draft: any) => JSON.stringify(original) !== JSON.stringify(draft);
  const tSetField = (id: string, field: string, value: any) => setTDrafts((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const loadTemplates = async () => {
    const list = await templateApi.getTemplates();
    setTemplates(list);
    return list;
  };

  const loadTemplateConfig = async (id: string) => {
    const cfg = await templateApi.getTemplateConfig(id);
    setTConfig(cfg);
    const d: Record<string, any> = { [cfg.template.id]: { ...cfg.template } };
    for (const row of [...cfg.packages, ...cfg.propertyFields, ...cfg.factors, ...cfg.services, ...cfg.frequencyDiscounts]) {
      d[row.id] = { ...row };
    }
    setTDrafts(d);
  };

  useEffect(() => {
    Promise.all([loadTemplates(), adminApi.getCapabilities().then(setCapabilities)])
      .then(([list]) => {
        const preferred = initialTemplateId && list.some((t: any) => t.id === initialTemplateId) ? initialTemplateId : null;
        if (preferred) setSelectedId(preferred);
        else if (list.length > 0) setSelectedId(list[0].id);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadTemplateConfig(selectedId);
    else setTConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Deep-link from the Pricing page's "+ Add a Service" router: once the
  // requested template's config has loaded, auto-trigger the same "+
  // Add-on Service" action the admin would otherwise click manually.
  const autoAddedRef = useRef(false);
  useEffect(() => {
    if (autoAddService && !autoAddedRef.current && tConfig && selectedId === initialTemplateId) {
      autoAddedRef.current = true;
      addRow('service');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tConfig, selectedId]);

  const createTemplate = async () => {
    setCreatingTemplate(true);
    try {
      const created = await templateApi.createTemplate();
      await loadTemplates();
      setSelectedId(created.id);
    } finally {
      setCreatingTemplate(false);
    }
  };

  const removeTemplate = async () => {
    if (!selectedId) return;
    if (!window.confirm('Remove this Marketplace Offer Template and everything under it (packages, property fields, factors, services, frequency discounts)? This cannot be undone.')) return;
    setRemovingTemplate(true);
    try {
      await templateApi.removeTemplate(selectedId);
      const list = await loadTemplates();
      setSelectedId(list.length > 0 ? list[0].id : null);
    } finally {
      setRemovingTemplate(false);
    }
  };

  const saveTemplateField = async (payload: any) => {
    if (!selectedId) return;
    setTSaving((p) => new Set(p).add(selectedId));
    try {
      await templateApi.updateTemplate(selectedId, payload);
      await Promise.all([loadTemplates(), loadTemplateConfig(selectedId)]);
    } finally {
      setTSaving((p) => { const n = new Set(p); n.delete(selectedId); return n; });
    }
  };

  type RowKind = 'package' | 'propertyField' | 'factor' | 'service' | 'frequencyDiscount';
  const updaters: Record<RowKind, (id: string, data: any) => Promise<any>> = {
    package: templateApi.updateTemplatePackage,
    propertyField: templateApi.updateTemplatePropertyField,
    factor: templateApi.updateTemplateFactor,
    service: templateApi.updateTemplateService,
    frequencyDiscount: templateApi.updateTemplateFrequencyDiscount,
  };
  const removers: Record<RowKind, (id: string) => Promise<any>> = {
    package: templateApi.removeTemplatePackage,
    propertyField: templateApi.removeTemplatePropertyField,
    factor: templateApi.removeTemplateFactor,
    service: templateApi.removeTemplateService,
    frequencyDiscount: templateApi.removeTemplateFrequencyDiscount,
  };
  const creators: Record<RowKind, (templateId: string) => Promise<any>> = {
    package: templateApi.createTemplatePackage,
    propertyField: (id) => templateApi.createTemplatePropertyField(id),
    factor: (id) => templateApi.createTemplateFactor(id),
    service: (id) => templateApi.createTemplateService(id),
    frequencyDiscount: (id) => templateApi.createTemplateFrequencyDiscount(id),
  };

  const saveRow = async (kind: RowKind, id: string, payload: any) => {
    setTSaving((p) => new Set(p).add(id));
    try {
      await updaters[kind](id, payload);
      if (selectedId) await loadTemplateConfig(selectedId);
    } finally {
      setTSaving((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const addRow = async (kind: RowKind) => {
    if (!selectedId) return;
    setAddingKind(kind);
    try {
      await creators[kind](selectedId);
      await loadTemplateConfig(selectedId);
    } finally {
      setAddingKind(null);
    }
  };

  const removeRow = async (kind: RowKind, id: string) => {
    setRemovingRowId(id);
    try {
      await removers[kind](id);
      if (selectedId) await loadTemplateConfig(selectedId);
    } finally {
      setRemovingRowId(null);
    }
  };

  const toggleInArray = (arr: string[] | undefined, value: string) =>
    (arr ?? []).includes(value) ? (arr ?? []).filter((v) => v !== value) : [...(arr ?? []), value];

  return (
    <CollapsibleGroup label="Marketplace Offer Templates" collapsed={collapsed} onToggle={onToggle}>
      <SectionCard title="Marketplace Offer Templates" subtitle="Self-service rich marketplace verticals — Subscription Packages, Service Properties, Service Factors, Add-on Services, and Frequency Discounts, all admin-configurable with no code change. Coexists with the simpler flat &quot;Marketplace Offers&quot; above, which stays the right tool for a plain Request-Quote offer.">
        {loading ? (
          <div className="text-steel text-sm">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value || null)} className="border border-border rounded px-2 py-1.5 text-sm min-w-[220px]">
                {templates.length === 0 && <option value="">No templates yet</option>}
                {templates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}{!t.isActive ? ' (disabled)' : ''}</option>
                ))}
              </select>
              <button
                onClick={createTemplate}
                disabled={creatingTemplate}
                className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors"
              >
                {creatingTemplate ? 'Creating…' : '+ Create New Marketplace Offer Template'}
              </button>
              {selectedId && (
                <button
                  onClick={removeTemplate}
                  disabled={removingTemplate}
                  className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30"
                >
                  ✕ Remove This Template
                </button>
              )}
            </div>

            {tConfig && (
              <>
                <div className="flex items-end gap-4 flex-wrap mb-6 pb-6 border-b border-mist-dim">
                  <div>
                    <label className="block text-xs font-semibold text-steel mb-1">Offer Name</label>
                    <input
                      type="text"
                      value={tDrafts[tConfig.template.id]?.name ?? ''}
                      onChange={(e) => tSetField(tConfig.template.id, 'name', e.target.value)}
                      className="w-64 border border-border rounded px-2 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-steel mb-1">Specialty Skill Required</label>
                    <select
                      value={tDrafts[tConfig.template.id]?.requiredCapabilityId ?? ''}
                      onChange={(e) => tSetField(tConfig.template.id, 'requiredCapabilityId', e.target.value || null)}
                      className="w-56 border border-border rounded px-2 py-1.5"
                    >
                      <option value="">Any vendor</option>
                      {capabilities.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-steel cursor-pointer pb-1.5">
                    <input
                      type="checkbox"
                      checked={tDrafts[tConfig.template.id]?.isActive ?? true}
                      onChange={(e) => tSetField(tConfig.template.id, 'isActive', e.target.checked)}
                      className="w-4 h-4 accent-lantern cursor-pointer"
                    />
                    Enabled
                  </label>
                  <SaveButton
                    dirty={tIsDirty(tConfig.template, tDrafts[tConfig.template.id] ?? tConfig.template)}
                    saving={tSaving.has(tConfig.template.id)}
                    onClick={() => saveTemplateField({
                      name: tDrafts[tConfig.template.id].name,
                      requiredCapabilityId: tDrafts[tConfig.template.id].requiredCapabilityId || null,
                      isActive: tDrafts[tConfig.template.id].isActive,
                    })}
                  />
                </div>

                <SectionCard title="Subscription Packages" subtitle="Package name, description, monthly price, and an optional Bundle Discount % — while a customer has this package active, every Add-on Service scoped &quot;Only when this package selected&quot; gets that % off automatically.">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-mist-dim">
                        <th className="px-3 py-2 text-left font-semibold text-steel">Package</th>
                        <th className="px-3 py-2 text-left font-semibold text-steel">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Monthly Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Bundle Discount %</th>
                        <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
                        <th className="w-32" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-canvas">
                      {tConfig.packages.map((pkg: any) => {
                        const d = tDrafts[pkg.id] ?? pkg;
                        return (
                          <tr key={pkg.id}>
                            <td className="px-3 py-2">
                              <input type="text" value={d.name} onChange={(e) => tSetField(pkg.id, 'name', e.target.value)} className="w-40 border border-border rounded px-2 py-1 font-medium" />
                            </td>
                            <td className="px-3 py-2">
                              <textarea value={d.description} onChange={(e) => tSetField(pkg.id, 'description', e.target.value)} rows={2} className="w-72 border border-border rounded px-2 py-1" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" step="0.01" value={d.monthlyPrice} onChange={(e) => tSetField(pkg.id, 'monthlyPrice', e.target.value)} className="w-24 border border-border rounded px-2 py-1 text-right" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" step="0.5" value={d.bundleDiscountPercent} onChange={(e) => tSetField(pkg.id, 'bundleDiscountPercent', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" checked={d.isActive} onChange={(e) => tSetField(pkg.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" />
                            </td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <SaveButton
                                dirty={tIsDirty(pkg, d)}
                                saving={tSaving.has(pkg.id)}
                                onClick={() => saveRow('package', pkg.id, {
                                  name: d.name, description: d.description,
                                  monthlyPrice: Number(d.monthlyPrice), bundleDiscountPercent: Number(d.bundleDiscountPercent),
                                  isActive: d.isActive,
                                })}
                              />
                              <button onClick={() => removeRow('package', pkg.id)} disabled={removingRowId === pkg.id} className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30">✕ Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => addRow('package')} disabled={addingKind === 'package'} className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                    {addingKind === 'package' ? 'Creating…' : '+ Create New Subscription Package'}
                  </button>
                </SectionCard>

                <SectionCard title="Service Properties" subtitle="Customer input fields (e.g. sq ft, room count) — a value entered for one of these on the customer/vendor app becomes the billable quantity for any Add-on Service below that references it.">
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
                      {tConfig.propertyFields.map((f: any) => {
                        const d = tDrafts[f.id] ?? f;
                        return (
                          <tr key={f.id}>
                            <td className="px-3 py-2"><input type="text" value={d.label} onChange={(e) => tSetField(f.id, 'label', e.target.value)} className="w-56 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2"><input type="text" value={d.unit} onChange={(e) => tSetField(f.id, 'unit', e.target.value)} className="w-24 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.isActive} onChange={(e) => tSetField(f.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" /></td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <SaveButton dirty={tIsDirty(f, d)} saving={tSaving.has(f.id)} onClick={() => saveRow('propertyField', f.id, { label: d.label, unit: d.unit, isActive: d.isActive })} />
                              <button onClick={() => removeRow('propertyField', f.id)} disabled={removingRowId === f.id} className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30">✕ Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => addRow('propertyField')} disabled={addingKind === 'propertyField'} className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                    {addingKind === 'propertyField' ? 'Adding…' : '+ New Field'}
                  </button>
                </SectionCard>

                <SectionCard title="Service Factors" subtitle="Stacking price modifiers (like Cleaning's Condition Multipliers) — 1.10 means +10%. Selected factors stack additively and impact both Sub Cost and Customer Price on any Add-on Service below.">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-mist-dim">
                        <th className="px-3 py-2 text-left font-semibold text-steel">Label</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Multiplier</th>
                        <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
                        <th className="w-32" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-canvas">
                      {tConfig.factors.map((f: any) => {
                        const d = tDrafts[f.id] ?? f;
                        return (
                          <tr key={f.id}>
                            <td className="px-3 py-2"><input type="text" value={d.label} onChange={(e) => tSetField(f.id, 'label', e.target.value)} className="w-56 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.multiplier} onChange={(e) => tSetField(f.id, 'multiplier', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.isActive} onChange={(e) => tSetField(f.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" /></td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <SaveButton dirty={tIsDirty(f, d)} saving={tSaving.has(f.id)} onClick={() => saveRow('factor', f.id, { label: d.label, multiplier: Number(d.multiplier), isActive: d.isActive })} />
                              <button onClick={() => removeRow('factor', f.id)} disabled={removingRowId === f.id} className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30">✕ Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => addRow('factor')} disabled={addingKind === 'factor'} className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                    {addingKind === 'factor' ? 'Adding…' : '+ New Factor'}
                  </button>
                </SectionCard>

                <SectionCard title="Add-on Services" subtitle="Same pricing fields as Pest Control Services, plus which Service Property drives quantity, which Factors apply, and whether this service is always requestable or only shown under specific Subscription Packages.">
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
                        <th className="px-3 py-2 text-left font-semibold text-steel">Property Field</th>
                        <th className="px-3 py-2 text-left font-semibold text-steel">Property Field 2</th>
                        <th className="px-3 py-2 text-left font-semibold text-steel">Factors</th>
                        <th className="px-3 py-2 text-left font-semibold text-steel">Package Visibility</th>
                        <th className="px-3 py-2 text-left font-semibold text-steel">Volume Discount</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Threshold 1</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Rate 1 %</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Threshold 2</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Rate 2 %</th>
                        <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
                        <th className="w-32" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-canvas">
                      {tConfig.services.map((s: any) => {
                        const d = tDrafts[s.id] ?? s;
                        return (
                          <tr key={s.id}>
                            <td className="px-3 py-2"><input type="text" value={d.label} onChange={(e) => tSetField(s.id, 'label', e.target.value)} className="w-36 border border-border rounded px-2 py-1 font-medium" /></td>
                            <td className="px-3 py-2"><input type="text" value={d.pricingUnit} onChange={(e) => tSetField(s.id, 'pricingUnit', e.target.value)} className="w-24 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2"><input type="text" value={d.recommendedFrequency} onChange={(e) => tSetField(s.id, 'recommendedFrequency', e.target.value)} className="w-24 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.subCostBase} onChange={(e) => tSetField(s.id, 'subCostBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.001" value={d.subCostPerUnit} onChange={(e) => tSetField(s.id, 'subCostPerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.customerPriceBase} onChange={(e) => tSetField(s.id, 'customerPriceBase', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.001" value={d.customerPricePerUnit} onChange={(e) => tSetField(s.id, 'customerPricePerUnit', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.customerPricePerUnit2} onChange={(e) => tSetField(s.id, 'customerPricePerUnit2', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2">
                              <select value={d.propertyFieldId ?? ''} onChange={(e) => tSetField(s.id, 'propertyFieldId', e.target.value || null)} className="w-36 border border-border rounded px-2 py-1">
                                <option value="">None</option>
                                {tConfig.propertyFields.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select value={d.propertyField2Id ?? ''} onChange={(e) => tSetField(s.id, 'propertyField2Id', e.target.value || null)} className="w-36 border border-border rounded px-2 py-1">
                                <option value="">None</option>
                                {tConfig.propertyFields.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1 w-36">
                                {tConfig.factors.map((f: any) => (
                                  <label key={f.id} className="flex items-center gap-1 text-xs text-steel cursor-pointer">
                                    <input type="checkbox" checked={(d.factorIds ?? []).includes(f.id)} onChange={() => tSetField(s.id, 'factorIds', toggleInArray(d.factorIds, f.id))} className="accent-lantern" />
                                    {f.label}
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <select value={d.packageVisibility ?? 'ALWAYS'} onChange={(e) => tSetField(s.id, 'packageVisibility', e.target.value)} className="w-32 border border-border rounded px-2 py-1 mb-1">
                                <option value="ALWAYS">Always</option>
                                <option value="PACKAGE_ONLY">Only w/ package</option>
                              </select>
                              {d.packageVisibility === 'PACKAGE_ONLY' && (
                                <div className="flex flex-col gap-1 w-36">
                                  {tConfig.packages.map((pkg: any) => (
                                    <label key={pkg.id} className="flex items-center gap-1 text-xs text-steel cursor-pointer">
                                      <input type="checkbox" checked={(d.packageIds ?? []).includes(pkg.id)} onChange={() => tSetField(s.id, 'packageIds', toggleInArray(d.packageIds, pkg.id))} className="accent-lantern" />
                                      {pkg.name}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2"><input type="text" value={d.volumeDiscountText} onChange={(e) => tSetField(s.id, 'volumeDiscountText', e.target.value)} className="w-40 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.volumeDiscountThreshold1 ?? ''} onChange={(e) => tSetField(s.id, 'volumeDiscountThreshold1', e.target.value === '' ? null : e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.5" value={d.volumeDiscountRate1 ?? ''} onChange={(e) => tSetField(s.id, 'volumeDiscountRate1', e.target.value === '' ? null : e.target.value)} className="w-16 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={d.volumeDiscountThreshold2 ?? ''} onChange={(e) => tSetField(s.id, 'volumeDiscountThreshold2', e.target.value === '' ? null : e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.5" value={d.volumeDiscountRate2 ?? ''} onChange={(e) => tSetField(s.id, 'volumeDiscountRate2', e.target.value === '' ? null : e.target.value)} className="w-16 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.isActive} onChange={(e) => tSetField(s.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" /></td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <SaveButton
                                dirty={tIsDirty(s, d)}
                                saving={tSaving.has(s.id)}
                                onClick={() => saveRow('service', s.id, {
                                  label: d.label,
                                  pricingUnit: d.pricingUnit,
                                  recommendedFrequency: d.recommendedFrequency,
                                  subCostBase: Number(d.subCostBase),
                                  subCostPerUnit: Number(d.subCostPerUnit),
                                  customerPriceBase: Number(d.customerPriceBase),
                                  customerPricePerUnit: Number(d.customerPricePerUnit),
                                  customerPricePerUnit2: Number(d.customerPricePerUnit2),
                                  propertyFieldId: d.propertyFieldId || null,
                                  propertyField2Id: d.propertyField2Id || null,
                                  factorIds: d.factorIds ?? [],
                                  packageVisibility: d.packageVisibility ?? 'ALWAYS',
                                  packageIds: d.packageIds ?? [],
                                  volumeDiscountText: d.volumeDiscountText,
                                  volumeDiscountThreshold1: d.volumeDiscountThreshold1 === '' || d.volumeDiscountThreshold1 == null ? null : Number(d.volumeDiscountThreshold1),
                                  volumeDiscountRate1: d.volumeDiscountRate1 === '' || d.volumeDiscountRate1 == null ? null : Number(d.volumeDiscountRate1),
                                  volumeDiscountThreshold2: d.volumeDiscountThreshold2 === '' || d.volumeDiscountThreshold2 == null ? null : Number(d.volumeDiscountThreshold2),
                                  volumeDiscountRate2: d.volumeDiscountRate2 === '' || d.volumeDiscountRate2 == null ? null : Number(d.volumeDiscountRate2),
                                  isActive: d.isActive,
                                })}
                              />
                              <button onClick={() => removeRow('service', s.id)} disabled={removingRowId === s.id} className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30">✕ Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  <button onClick={() => addRow('service')} disabled={addingKind === 'service'} className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                    {addingKind === 'service' ? 'Adding…' : '+ Add-on Service'}
                  </button>
                </SectionCard>

                <SectionCard title="Frequency Discounts" subtitle="Shared across every Add-on Service under this template — same format as House Cleaning's Frequency Discounts (a flat % applied when the customer picks that frequency).">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-mist-dim">
                        <th className="px-3 py-2 text-left font-semibold text-steel">Label</th>
                        <th className="px-3 py-2 text-right font-semibold text-steel">Discount %</th>
                        <th className="px-3 py-2 text-center font-semibold text-steel">Enabled</th>
                        <th className="w-32" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-canvas">
                      {tConfig.frequencyDiscounts.map((f: any) => {
                        const d = tDrafts[f.id] ?? f;
                        return (
                          <tr key={f.id}>
                            <td className="px-3 py-2"><input type="text" value={d.label} onChange={(e) => tSetField(f.id, 'label', e.target.value)} className="w-40 border border-border rounded px-2 py-1" /></td>
                            <td className="px-3 py-2 text-right"><input type="number" step="0.5" value={d.discountPercent} onChange={(e) => tSetField(f.id, 'discountPercent', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-right" /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.isActive} onChange={(e) => tSetField(f.id, 'isActive', e.target.checked)} className="w-4 h-4 accent-lantern cursor-pointer" /></td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <SaveButton dirty={tIsDirty(f, d)} saving={tSaving.has(f.id)} onClick={() => saveRow('frequencyDiscount', f.id, { label: d.label, discountPercent: Number(d.discountPercent), isActive: d.isActive })} />
                              <button onClick={() => removeRow('frequencyDiscount', f.id)} disabled={removingRowId === f.id} className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-30">✕ Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => addRow('frequencyDiscount')} disabled={addingKind === 'frequencyDiscount'} className="mt-4 bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                    {addingKind === 'frequencyDiscount' ? 'Adding…' : '+ New Frequency Discount'}
                  </button>
                </SectionCard>
              </>
            )}
          </>
        )}
      </SectionCard>
    </CollapsibleGroup>
  );
}

function MarketplacePageInner() {
  const searchParams = useSearchParams();
  const deepLinkAction = searchParams.get('action');
  const deepLinkTemplateId = searchParams.get('templateId');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Accordion: at most one group open at a time — opening one collapses
  // whichever other was open. null means everything starts collapsed.
  // Pre-opened via ?openGroup= when arriving from the Pricing page's
  // "+ Add a Service" router.
  const [openGroup, setOpenGroup] = useState<string | null>(() => searchParams.get('openGroup'));

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

  // Deep-link from the Pricing page's "+ Add a Service" router: once the
  // catalog has loaded, auto-trigger the same "+ Add Marketplace Offer"
  // action the admin would otherwise click manually.
  const autoAddedOfferRef = useRef(false);
  useEffect(() => {
    if (deepLinkAction === 'addOffer' && config && !autoAddedOfferRef.current) {
      autoAddedOfferRef.current = true;
      addMarketplaceOffer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

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

      <OfferTemplatesSection
        collapsed={openGroup !== 'OFFER_TEMPLATES'}
        onToggle={() => toggleGroupCollapsed('OFFER_TEMPLATES')}
        initialTemplateId={deepLinkTemplateId}
        autoAddService={deepLinkAction === 'addService'}
      />
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="text-steel p-8">Loading…</div>}>
      <MarketplacePageInner />
    </Suspense>
  );
}
