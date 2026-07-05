'use client';
import { useEffect, useRef, useState } from 'react';
import { pricingApi, subscriptionsApi } from '@/lib/api';

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

function calcPricing(providerCost: number, markupPct: number) {
  const markupDollar = providerCost * markupPct / 100;
  const subtotal = providerCost + markupDollar;
  const stripeFee = subtotal * STRIPE_RATE + STRIPE_FIXED;
  const customerPrice = subtotal + stripeFee;
  return { markupDollar, stripeFee, customerPrice };
}

type PriceRow = {
  id: string;
  name: string;
  description: string;
  unitDescription: string | null;
  basePrice: number;
  markupPercent: number | null;
  isActive: boolean;
};

type EditState = { basePrice: string; markupPercent: string; unitDescription: string };

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalMarkup, setGlobalMarkup] = useState('15');
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkup, setBulkMarkup] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([pricingApi.getAll(), subscriptionsApi.getPlans()])
      .then(([p, s]) => {
        setPrices(p);
        setPlans(s);
        const states: Record<string, EditState> = {};
        for (const price of p) {
          states[price.id] = {
            basePrice: String(price.basePrice),
            markupPercent: price.markupPercent != null ? String(price.markupPercent) : '',
            unitDescription: price.unitDescription ?? '',
          };
        }
        setEditStates(states);
      })
      .finally(() => setLoading(false));
  }, []);

  const allSelected = prices.length > 0 && selectedIds.size === prices.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const savePrice = async (id: string, overrides?: Partial<EditState>) => {
    const state = { ...editStates[id], ...overrides };
    setSaving((s) => new Set(s).add(id));
    try {
      await pricingApi.update(id, {
        basePrice: parseFloat(state.basePrice) || 0,
        markupPercent: state.markupPercent !== '' ? parseFloat(state.markupPercent) : null,
        unitDescription: state.unitDescription || null,
      });
      setPrices((prev) => prev.map((p) => p.id === id ? {
        ...p,
        basePrice: parseFloat(state.basePrice) || 0,
        markupPercent: state.markupPercent !== '' ? parseFloat(state.markupPercent) : null,
        unitDescription: state.unitDescription || null,
      } : p));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const updateField = (id: string, field: keyof EditState, value: string) =>
    setEditStates((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(prices.map((p) => p.id)));

  const applyBulkMarkup = async () => {
    const pct = parseFloat(bulkMarkup);
    if (isNaN(pct) || pct < 0) return;
    const ids = Array.from(selectedIds);
    setEditStates((prev) => {
      const updated = { ...prev };
      for (const id of ids) updated[id] = { ...updated[id], markupPercent: String(pct) };
      return updated;
    });
    setSaving(new Set(ids));
    await Promise.all(ids.map(async (id) => {
      const state = editStates[id];
      await pricingApi.update(id, {
        basePrice: parseFloat(state.basePrice) || 0,
        markupPercent: pct,
        unitDescription: state.unitDescription || null,
      });
    }));
    setPrices((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, markupPercent: pct } : p));
    setSaving(new Set());
    setBulkMarkup('');
  };

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Pricing Management</h1>
      <p className="text-gray-500 mb-8">Configure service pricing, markups, and view customer-facing totals.</p>

      {/* Global Platform Markup */}
      <div className="bg-white rounded-2xl border border-gray-100 mb-8">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand">Global Platform Markup</h2>
          <p className="text-sm text-gray-500 mt-1">Default markup applied to all services. Override per-service in the table below.</p>
        </div>
        <div className="p-6 flex items-center gap-4">
          <input
            type="number"
            value={globalMarkup}
            onChange={(e) => setGlobalMarkup(e.target.value)}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-center text-lg font-bold focus:border-brand outline-none"
            min="0"
            max="100"
          />
          <span className="text-lg text-gray-600">%</span>
          <span className="text-sm text-gray-400">Set PLATFORM_FEE_PERCENT in .env to persist across restarts</span>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="bg-white rounded-2xl border border-gray-100 mb-8">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand">Subscription Plan Prices</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {plans.map((plan: any) => (
            <div key={plan.id} className="p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{plan.name}</div>
                <div className="text-sm text-gray-500">{plan.tier} tier</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="number"
                  defaultValue={plan.price}
                  onBlur={(e) => subscriptionsApi.updatePlan(plan.id, { price: parseFloat(e.target.value) })}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-right focus:border-brand outline-none"
                />
                <span className="text-sm text-gray-400">/year</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service Prices */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-brand">Service Prices</h2>
            <p className="text-sm text-gray-500 mt-1">
              Stripe fee: 2.9% + $0.30 per transaction. Changes save on blur.
            </p>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
              <span className="text-sm font-semibold text-brand">{selectedIds.size} selected</span>
              <span className="text-gray-300">|</span>
              <span className="text-sm text-gray-500">Set markup</span>
              <input
                type="number"
                value={bulkMarkup}
                onChange={(e) => setBulkMarkup(e.target.value)}
                placeholder="e.g. 20"
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:border-brand outline-none"
              />
              <span className="text-sm text-gray-400">%</span>
              <button
                onClick={applyBulkMarkup}
                disabled={bulkMarkup === ''}
                className="bg-brand text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-40 transition-colors"
              >
                Apply to all
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-gray-400 hover:text-gray-600 px-2 py-1 text-sm"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="pl-6 pr-2 py-3 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={selectAll}
                    className="rounded cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[180px]">Service</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[130px]">Unit</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Provider Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Markup %</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Markup $</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Stripe Fee</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 pr-6">Customer Price</th>
                <th className="w-8 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {prices.map((price) => {
                const state = editStates[price.id] ?? {
                  basePrice: String(price.basePrice),
                  markupPercent: '',
                  unitDescription: '',
                };
                const providerCost = parseFloat(state.basePrice) || 0;
                const effectivePct = state.markupPercent !== ''
                  ? (parseFloat(state.markupPercent) || 0)
                  : (parseFloat(globalMarkup) || 0);
                const { markupDollar, stripeFee, customerPrice } = calcPricing(providerCost, effectivePct);
                const isSelected = selectedIds.has(price.id);
                const isSaving = saving.has(price.id);

                return (
                  <tr key={price.id} className={`transition-colors ${isSelected ? 'bg-teal-50/40' : 'hover:bg-gray-50/50'}`}>
                    <td className="pl-6 pr-2 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(price.id)}
                        className="rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-gray-800">{price.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-snug">{price.description}</div>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="text"
                        value={state.unitDescription}
                        onChange={(e) => updateField(price.id, 'unitDescription', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="e.g. per filter"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:border-brand focus:ring-1 focus:ring-brand/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          value={state.basePrice}
                          onChange={(e) => updateField(price.id, 'basePrice', e.target.value)}
                          onBlur={() => savePrice(price.id)}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-brand focus:ring-1 focus:ring-brand/20 outline-none"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={state.markupPercent}
                          onChange={(e) => updateField(price.id, 'markupPercent', e.target.value)}
                          onBlur={() => savePrice(price.id)}
                          placeholder={globalMarkup}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-brand focus:ring-1 focus:ring-brand/20 outline-none placeholder-gray-300"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                      {state.markupPercent === '' && (
                        <div className="text-xs text-gray-300 text-right mt-0.5">global</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600 tabular-nums">
                      ${markupDollar.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-right text-orange-500 tabular-nums">
                      ${stripeFee.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-right pr-6 tabular-nums">
                      <span className="font-bold text-brand text-base">${customerPrice.toFixed(2)}</span>
                    </td>
                    <td className="pr-4 text-center">
                      {isSaving && (
                        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin inline-block" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
