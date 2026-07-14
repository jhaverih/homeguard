'use client';
import { useEffect, useRef, useState } from 'react';
import { pricingApi, subscriptionsApi, adminApi } from '@/lib/api';

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

function calcPricing(providerCost: number, markupPct: number) {
  const markupDollar = providerCost * markupPct / 100;
  const subtotal = providerCost + markupDollar;
  const stripeFee = subtotal * STRIPE_RATE + STRIPE_FIXED;
  const customerPrice = subtotal + stripeFee;
  return { markupDollar, stripeFee, customerPrice };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      values.push(current); current = '';
    } else {
      current += c;
    }
  }
  values.push(current);
  return values;
}

type PriceRow = {
  id: string;
  name: string;
  description: string;
  priceNote: string | null;
  requiresQuote: boolean;
  basePrice: number;
  markupPercent: number | null;
  quantityLabel: string | null;
  minimumQuantity: number | null;
  isActive: boolean;
  requiredCapabilityId: string | null;
  customerRequestable: boolean;
};

type EditState = {
  name: string;
  description: string;
  priceNote: string;
  requiresQuote: boolean;
  basePrice: string;
  markupPercent: string;
  quantityLabel: string;
  minimumQuantity: string;
  requiredCapabilityId: string;
  customerRequestable: boolean;
};

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalMarkup, setGlobalMarkup] = useState('15');
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<EditState>({
    name: '', description: '', priceNote: '', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: '', minimumQuantity: '',
    requiredCapabilityId: '', customerRequestable: true,
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([pricingApi.getAll(), subscriptionsApi.getPlans(), adminApi.getCapabilities()])
      .then(([p, s, caps]) => {
        setPrices(p);
        setPlans(s);
        setCapabilities(caps);
        const states: Record<string, EditState> = {};
        for (const price of p) states[price.id] = rowToEdit(price);
        setEditStates(states);
      })
      .finally(() => setLoading(false));
  }, []);

  function rowToEdit(price: PriceRow): EditState {
    return {
      name: price.name,
      description: price.description ?? '',
      priceNote: price.priceNote ?? '',
      requiresQuote: price.requiresQuote ?? false,
      basePrice: String(price.basePrice),
      markupPercent: price.markupPercent != null ? String(price.markupPercent) : '',
      quantityLabel: price.quantityLabel ?? '',
      minimumQuantity: price.minimumQuantity != null ? String(price.minimumQuantity) : '',
      requiredCapabilityId: price.requiredCapabilityId ?? '',
      customerRequestable: price.customerRequestable ?? true,
    };
  }

  const reload = async () => {
    const p = await pricingApi.getAll();
    setPrices(p);
    const states: Record<string, EditState> = {};
    for (const price of p) states[price.id] = rowToEdit(price);
    setEditStates(states);
  };

  const savePrice = async (id: string) => {
    const state = editStates[id];
    if (!state) return;
    setSaving((s) => new Set(s).add(id));
    try {
      const updated = await pricingApi.update(id, {
        name: state.name,
        description: state.description,
        priceNote: state.priceNote || null,
        requiresQuote: state.requiresQuote,
        basePrice: parseFloat(state.basePrice) || 0,
        markupPercent: state.markupPercent !== '' ? parseFloat(state.markupPercent) : null,
        quantityLabel: state.quantityLabel || null,
        minimumQuantity: state.minimumQuantity !== '' ? parseFloat(state.minimumQuantity) : null,
        requiredCapabilityId: state.requiredCapabilityId || null,
        customerRequestable: state.customerRequestable,
      });
      setPrices((prev) => prev.map((p) => p.id === id ? { ...p, ...updated } : p));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    setSaving((s) => new Set(s).add(id));
    try {
      await pricingApi.update(id, { isActive: !current });
      setPrices((prev) => prev.map((p) => p.id === id ? { ...p, isActive: !current } : p));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const deletePrice = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await pricingApi.remove(id);
      setPrices((prev) => prev.filter((p) => p.id !== id));
      setEditStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setDeletingId(null);
    }
  };

  const addRow = async () => {
    if (!newRow.name.trim()) return;
    setSaving((s) => new Set(s).add('new'));
    try {
      const created = await pricingApi.create({
        name: newRow.name,
        description: newRow.description,
        priceNote: newRow.priceNote || null,
        requiresQuote: newRow.requiresQuote,
        basePrice: parseFloat(newRow.basePrice) || 0,
        markupPercent: newRow.markupPercent !== '' ? parseFloat(newRow.markupPercent) : null,
        quantityLabel: newRow.quantityLabel || null,
        minimumQuantity: newRow.minimumQuantity !== '' ? parseFloat(newRow.minimumQuantity) : null,
        requiredCapabilityId: newRow.requiredCapabilityId || null,
        customerRequestable: newRow.customerRequestable,
      });
      setPrices((prev) => [...prev, created]);
      setEditStates((prev) => ({ ...prev, [created.id]: rowToEdit(created) }));
      setNewRow({
        name: '', description: '', priceNote: '', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: '', minimumQuantity: '',
        requiredCapabilityId: '', customerRequestable: true,
      });
      setAddingRow(false);
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete('new'); return n; });
    }
  };

  const updateField = (id: string, field: keyof EditState, value: any) =>
    setEditStates((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const headers = ['name', 'description', 'priceNote', 'requiresQuote', 'basePrice', 'markupPercent', 'quantityLabel', 'minimumQuantity', 'isActive', 'customerRequestable'];
    const rows = prices.map((p) => {
      const s = editStates[p.id];
      const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
      return [
        esc(s?.name || p.name),
        esc(s?.description || p.description || ''),
        esc(s?.priceNote || p.priceNote || ''),
        s?.requiresQuote ? 'true' : 'false',
        s?.basePrice || String(p.basePrice),
        s?.markupPercent || (p.markupPercent != null ? String(p.markupPercent) : ''),
        esc(s?.quantityLabel || p.quantityLabel || ''),
        s?.minimumQuantity || (p.minimumQuantity != null ? String(p.minimumQuantity) : ''),
        p.isActive ? 'true' : 'false',
        (s?.customerRequestable ?? p.customerRequestable) ? 'true' : 'false',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attenteve-services-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV Import ──────────────────────────────────────────────────────────────
  const importCsv = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setImportResult('File appears empty.'); return; }
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const results: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row: any = {};
        headers.forEach((h, idx) => {
          const v = (values[idx] || '').trim();
          row[h] = v;
        });
        if (!row.name) continue;

        const payload = {
          description: row.description || '',
          priceNote: row.priceNote || null,
          requiresQuote: row.requiresQuote === 'true',
          basePrice: parseFloat(row.basePrice) || 0,
          markupPercent: row.markupPercent !== '' && row.markupPercent != null ? parseFloat(row.markupPercent) : null,
          quantityLabel: row.quantityLabel || null,
          minimumQuantity: row.minimumQuantity !== '' && row.minimumQuantity != null ? parseFloat(row.minimumQuantity) : null,
          isActive: row.isActive !== 'false',
          customerRequestable: row.customerRequestable !== 'false',
        };

        const existing = prices.find((p) => p.name.toLowerCase() === row.name.toLowerCase());
        try {
          if (existing) {
            await pricingApi.update(existing.id, payload);
            results.push(`✓ Updated: ${row.name}`);
          } else {
            await pricingApi.create({ name: row.name, ...payload });
            results.push(`+ Created: ${row.name}`);
          }
        } catch {
          results.push(`✗ Error: ${row.name}`);
        }
      }

      await reload();
      setImportResult(results.join('\n') || 'No rows processed.');
    } catch (e: any) {
      setImportResult(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Pricing Management</h1>
      <p className="text-steel mb-8">Edit service names, descriptions, pricing notes, and rates. Changes save on blur.</p>

      {/* Subscription Plans */}
      <div className="bg-white rounded-2xl border border-mist-dim mb-8">
        <div className="p-6 border-b border-mist-dim">
          <h2 className="text-lg font-bold text-lantern-deep">Subscription Plan Prices</h2>
        </div>
        <div className="divide-y divide-canvas">
          {plans.map((plan: any) => (
            <div key={plan.id} className="p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-ink">{plan.name}</div>
                <div className="text-sm text-steel">{plan.tier} tier</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-steel">$</span>
                <input
                  type="number"
                  defaultValue={plan.price}
                  onBlur={(e) => subscriptionsApi.updatePlan(plan.id, { price: parseFloat(e.target.value) })}
                  className="w-24 border border-border rounded-lg px-3 py-2 text-right focus:border-lantern outline-none"
                />
                <span className="text-sm text-steel">/year</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service Prices */}
      <div className="bg-white rounded-2xl border border-mist-dim">
        <div className="p-6 border-b border-mist-dim flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-lantern-deep">Additional Services Catalog</h2>
            <p className="text-sm text-steel mt-1">
              All fields editable. Stripe fee: 2.9% + $0.30. Toggle the switch to disable without deleting.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={exportCsv}
              className="border border-border text-steel px-4 py-2 rounded-lg text-sm font-semibold hover:bg-canvas transition-colors flex items-center gap-2"
            >
              ↓ Export CSV
            </button>
            <label className={`border border-border text-steel px-4 py-2 rounded-lg text-sm font-semibold hover:bg-canvas transition-colors cursor-pointer flex items-center gap-2 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
              {importing ? '⏳ Importing…' : '↑ Import CSV'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) importCsv(e.target.files[0]); }}
              />
            </label>
            <button
              onClick={() => setAddingRow(true)}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white transition-colors"
            >
              + Add Service
            </button>
          </div>
        </div>

        {/* Import result */}
        {importResult && (
          <div className="mx-6 mt-4 bg-canvas border border-border rounded-xl p-4">
            <div className="flex justify-between items-start">
              <pre className="text-xs text-ink whitespace-pre-wrap font-mono">{importResult}</pre>
              <button onClick={() => setImportResult(null)} className="text-steel hover:text-ink ml-4 text-lg leading-none">×</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist-dim bg-canvas/70">
                <th className="px-3 py-3 text-left font-semibold text-steel w-16">Active</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[160px]">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[200px]">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[130px]">Price Note</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Quote Only</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Customer Requestable</th>
                <th className="px-4 py-3 text-left font-semibold text-steel w-40">Required Capability</th>
                <th className="px-4 py-3 text-left font-semibold text-steel w-28">Qty Label</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">Min. Qty</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Base Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">Markup %</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Customer Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Global Markup</th>
                <th className="w-16 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {prices.map((price) => {
                const state = editStates[price.id];
                if (!state) return null;
                const providerCost = parseFloat(state.basePrice) || 0;
                const effectivePct = state.markupPercent !== ''
                  ? (parseFloat(state.markupPercent) || 0)
                  : (parseFloat(globalMarkup) || 0);
                const { customerPrice } = calcPricing(providerCost, effectivePct);
                const isSaving = saving.has(price.id);
                const isDeleting = deletingId === price.id;
                const inactive = !price.isActive;

                return (
                  <tr key={price.id} className={`hover:bg-canvas/50 transition-colors ${inactive ? 'opacity-50' : ''}`}>
                    {/* Active toggle */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleActive(price.id, price.isActive)}
                        title={price.isActive ? 'Disable service' : 'Enable service'}
                        className={`w-10 h-6 rounded-full transition-colors ${price.isActive ? 'bg-lantern' : 'bg-steel'} relative`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${price.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => updateField(price.id, 'name', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm font-semibold text-ink focus:border-lantern outline-none"
                      />
                    </td>
                    {/* Description */}
                    <td className="px-4 py-3">
                      <textarea
                        value={state.description}
                        onChange={(e) => updateField(price.id, 'description', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        rows={2}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs text-steel focus:border-lantern outline-none resize-none"
                      />
                    </td>
                    {/* Price Note */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={state.priceNote}
                        onChange={(e) => updateField(price.id, 'priceNote', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="e.g. $75/hr"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      />
                    </td>
                    {/* Requires Quote */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={state.requiresQuote}
                        onChange={(e) => {
                          updateField(price.id, 'requiresQuote', e.target.checked);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Customer Requestable */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={state.customerRequestable}
                        onChange={(e) => {
                          updateField(price.id, 'customerRequestable', e.target.checked);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        title="Uncheck for services only Attenteve triggers (e.g. Home Monitoring Setup) — hidden from the customer's own request list"
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Required Capability */}
                    <td className="px-4 py-3">
                      <select
                        value={state.requiredCapabilityId}
                        onChange={(e) => {
                          updateField(price.id, 'requiredCapabilityId', e.target.value);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      >
                        <option value="">Any vendor</option>
                        {capabilities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    {/* Quantity Label */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={state.quantityLabel}
                        onChange={(e) => updateField(price.id, 'quantityLabel', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="e.g. sq ft"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      />
                    </td>
                    {/* Minimum Quantity */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={state.minimumQuantity}
                        onChange={(e) => updateField(price.id, 'minimumQuantity', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="0"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                        min="0"
                      />
                    </td>
                    {/* Base Price */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-steel text-xs">$</span>
                        <input
                          type="number"
                          value={state.basePrice}
                          onChange={(e) => updateField(price.id, 'basePrice', e.target.value)}
                          onBlur={() => savePrice(price.id)}
                          className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                          min="0" step="0.01"
                        />
                      </div>
                    </td>
                    {/* Markup % */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={state.markupPercent}
                          onChange={(e) => updateField(price.id, 'markupPercent', e.target.value)}
                          onBlur={() => savePrice(price.id)}
                          placeholder={globalMarkup}
                          className="w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none placeholder-steel"
                          min="0" max="200" step="0.1"
                        />
                        <span className="text-steel text-xs">%</span>
                      </div>
                    </td>
                    {/* Customer Price */}
                    <td className="px-4 py-3 text-right">
                      {state.requiresQuote ? (
                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded-full px-2 py-1">Request a Quote</span>
                      ) : (
                        <span className="font-bold text-lantern-deep tabular-nums">${Math.ceil(customerPrice)}</span>
                      )}
                    </td>
                    {/* Global markup field */}
                    <td className="px-4 py-3 text-right">
                      {state.markupPercent === '' && !state.requiresQuote && (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={globalMarkup}
                            onChange={(e) => setGlobalMarkup(e.target.value)}
                            className="w-14 border border-border rounded-lg px-2 py-1 text-xs text-right focus:border-lantern outline-none"
                          />
                          <span className="text-xs text-steel">%</span>
                        </div>
                      )}
                    </td>
                    {/* Delete */}
                    <td className="pr-4 text-center">
                      {isSaving || isDeleting ? (
                        <div className="w-4 h-4 border-2 border-lantern border-t-transparent rounded-full animate-spin inline-block" />
                      ) : (
                        <button
                          onClick={() => deletePrice(price.id, state.name)}
                          className="text-steel hover:text-red-500 transition-colors px-1"
                          title="Delete service"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Add new row */}
              {addingRow && (
                <tr className="bg-mist-dim/30 border-t-2 border-lantern">
                  <td className="px-3 py-3" />
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newRow.name}
                      onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Service name"
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm font-semibold focus:border-lantern outline-none"
                      autoFocus
                    />
                  </td>
                  <td className="px-4 py-3">
                    <textarea
                      value={newRow.description}
                      onChange={(e) => setNewRow((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Description"
                      rows={2}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-xs focus:border-lantern outline-none resize-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newRow.priceNote}
                      onChange={(e) => setNewRow((p) => ({ ...p, priceNote: e.target.value }))}
                      placeholder="e.g. $75/hr"
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={newRow.requiresQuote}
                      onChange={(e) => setNewRow((p) => ({ ...p, requiresQuote: e.target.checked }))}
                      className="w-4 h-4 rounded cursor-pointer accent-lantern"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={newRow.customerRequestable}
                      onChange={(e) => setNewRow((p) => ({ ...p, customerRequestable: e.target.checked }))}
                      className="w-4 h-4 rounded cursor-pointer accent-lantern"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={newRow.requiredCapabilityId}
                      onChange={(e) => setNewRow((p) => ({ ...p, requiredCapabilityId: e.target.value }))}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    >
                      <option value="">Any vendor</option>
                      {capabilities.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newRow.quantityLabel}
                      onChange={(e) => setNewRow((p) => ({ ...p, quantityLabel: e.target.value }))}
                      placeholder="e.g. sq ft"
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newRow.minimumQuantity}
                      onChange={(e) => setNewRow((p) => ({ ...p, minimumQuantity: e.target.value }))}
                      placeholder="0"
                      className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                      min="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-steel text-xs">$</span>
                      <input
                        type="number"
                        value={newRow.basePrice}
                        onChange={(e) => setNewRow((p) => ({ ...p, basePrice: e.target.value }))}
                        className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                        min="0" step="0.01"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={newRow.markupPercent}
                        onChange={(e) => setNewRow((p) => ({ ...p, markupPercent: e.target.value }))}
                        placeholder={globalMarkup}
                        className="w-16 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none placeholder-steel"
                        min="0" max="200" step="0.1"
                      />
                      <span className="text-steel text-xs">%</span>
                    </div>
                  </td>
                  <td colSpan={2} />
                  <td className="pr-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setAddingRow(false); setNewRow({ name: '', description: '', priceNote: '', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: '', minimumQuantity: '', requiredCapabilityId: '', customerRequestable: true }); }}
                        className="text-steel hover:text-ink text-sm px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addRow}
                        disabled={!newRow.name.trim() || saving.has('new')}
                        className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-40 transition-colors"
                      >
                        {saving.has('new') ? 'Saving…' : 'Add'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {prices.length === 0 && !addingRow && (
            <div className="p-12 text-center text-steel">
              No services yet. Click <strong>+ Add Service</strong> to add one.
            </div>
          )}
        </div>

        {/* CSV format hint */}
        <div className="p-4 border-t border-mist-dim">
          <p className="text-xs text-steel">
            <strong>CSV format:</strong> name, description, priceNote, requiresQuote (true/false), basePrice, markupPercent, quantityLabel, minimumQuantity, isActive (true/false), customerRequestable (true/false) — existing rows matched by name, new names are created. Required Capability isn&apos;t part of CSV — set it per-row in the table above.
          </p>
        </div>
      </div>
    </div>
  );
}
