'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
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

// Mirrors apps/api/src/pricing/pricing.utils.ts calcTieredCost() — kept in
// sync manually since this is a client-side preview, not a shared package.
function calcTieredCost(state: EditState, qty: number): number {
  const basePrice = parseFloat(state.basePrice) || 0;
  if (state.pricingMethod !== 'PER_UNIT') return basePrice;
  const include = state.includeQty !== '' ? parseFloat(state.includeQty) || 0 : 1;
  const baseRate = state.baseRateUnit !== '' ? parseFloat(state.baseRateUnit) || 0 : basePrice;
  const threshold = state.volumeDiscountThreshold !== '' ? parseFloat(state.volumeDiscountThreshold) || 0 : Infinity;
  const volRate = state.volumeDiscountRate !== '' ? parseFloat(state.volumeDiscountRate) || 0 : 0;
  const tier2Qty = Math.max(0, Math.min(qty, threshold) - include);
  const tier3Qty = Math.max(0, qty - threshold);
  return basePrice + tier2Qty * baseRate + tier3Qty * volRate;
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

const PRICING_METHODS: { value: string; label: string }[] = [
  { value: 'FLAT_PRICE', label: 'Flat Price' },
  { value: 'PER_UNIT', label: 'Per Unit' },
  { value: 'ONE_TIME_FEE', label: 'One-Time Fee' },
  { value: 'REQUEST_QUOTE', label: 'Request Quote' },
];

const UNIT_LABELS: { value: string; label: string }[] = [
  { value: 'HOUR', label: 'Hour' },
  { value: 'SQ_FT', label: 'SqFt' },
  { value: 'BULB', label: 'Bulb' },
  { value: 'SERVICE_TRIP', label: 'Service Trip' },
  { value: 'AC_UNIT', label: 'AC Unit' },
  { value: 'HOLE', label: 'Hole' },
  { value: 'LINEAR_FEET', label: 'Linear Feet' },
  { value: 'UNIT', label: 'Unit' },
  { value: 'NONE', label: 'None' },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'INTERIOR_REPAIRS_MAINTENANCE', label: 'Interior Repairs and Maintenance' },
  { value: 'MINOR_ELECTRICAL_ADJUSTMENTS', label: 'Minor Electrical Adjustments' },
  { value: 'MINOR_PLUMBING_FIXES', label: 'Minor Plumbing Fixes' },
  { value: 'MOUNTING_INSTALLATIONS', label: 'Mounting and Installations' },
  { value: 'CARPENTRY_ASSEMBLY', label: 'Carpentry and Assembly' },
  { value: 'EXTERIOR_OUTDOOR_SERVICES', label: 'Exterior and Outdoor Services' },
  { value: 'HOUSE_CLEANING', label: 'House Cleaning' },
  { value: 'LAWN_LANDSCAPING', label: 'Lawn & Landscaping' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
];
const CATEGORY_RANK = new Map(CATEGORIES.map((c, i) => [c.value, i]));
const categoryLabel = (v: string | null) => CATEGORIES.find((c) => c.value === v)?.label ?? 'Uncategorized';

// Mirrors apps/api/src/vendor/entities/vendor-capability.entity.ts's CertificationType enum.
const CERTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'GENERAL_CONTRACTOR', label: 'General Contractor' },
  { value: 'NABCEP', label: 'NABCEP (Solar)' },
];
const ADD_NEW_CAPABILITY = '__add_new__';

// Additive, multi-valued lifecycle-stage tagging — orthogonal to CATEGORIES
// above (trade/domain). A service can carry one or more of these.
const SERVICE_GROUPS: { value: string; label: string }[] = [
  { value: 'INSPECT', label: 'Inspect' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'IMPROVE', label: 'Improve' },
  { value: 'MAINTAIN', label: 'Maintain' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
];
const SERVICE_GROUP_VALUES = new Set(SERVICE_GROUPS.map((g) => g.value));
// Accepts comma- or semicolon-separated values in one CSV cell (e.g.
// "INSPECT,REPAIR") — the exact delimiter a hand-built CSV uses isn't
// guaranteed to match our own exportCsv's format, so accept both and
// silently ignore anything that isn't a recognized group.
const parseServiceGroups = (raw: string): string[] =>
  (raw || '')
    .split(/[,;]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SERVICE_GROUP_VALUES.has(s));

type PriceRow = {
  id: string;
  name: string;
  description: string;
  priceDisplay: string;
  pricingMethod: string;
  requiresQuote: boolean;
  basePrice: number;
  markupPercent: number | null;
  quantityLabel: string | null;
  minimumQuantity: number | null;
  includeQty: number | null;
  baseRateUnit: number | null;
  volumeDiscountThreshold: number | null;
  volumeDiscountRate: number | null;
  isActive: boolean;
  requiredCapabilityId: string | null;
  category: string | null;
  serviceGroups: string[] | null;
  customerRequestable: boolean;
  isQuotaInspection: boolean;
};

type EditState = {
  name: string;
  description: string;
  pricingMethod: string;
  requiresQuote: boolean;
  basePrice: string;
  markupPercent: string;
  quantityLabel: string;
  minimumQuantity: string;
  includeQty: string;
  baseRateUnit: string;
  volumeDiscountThreshold: string;
  volumeDiscountRate: string;
  requiredCapabilityId: string;
  category: string;
  serviceGroups: string[];
  customerRequestable: boolean;
  isQuotaInspection: boolean;
};

// Keeps the "Quote Only" checkbox and the Pricing method dropdown from ever
// disagreeing, matching the same sync rule enforced server-side.
function syncQuoteFields(base: EditState, field: 'requiresQuote' | 'pricingMethod', value: any): Partial<EditState> {
  if (field === 'requiresQuote') {
    return value
      ? { requiresQuote: true, pricingMethod: 'REQUEST_QUOTE' }
      : { requiresQuote: false, pricingMethod: base.pricingMethod === 'REQUEST_QUOTE' ? 'FLAT_PRICE' : base.pricingMethod };
  }
  return {
    pricingMethod: value,
    requiresQuote: value === 'REQUEST_QUOTE',
    // Mirrors the entity's syncUnitLabel hook: a single fixed fee never has
    // a meaningful unit count. Per Unit / Request Quote keep whatever Unit
    // Label is already set (independently chosen, not auto-suggested).
    quantityLabel: (value === 'FLAT_PRICE' || value === 'ONE_TIME_FEE') ? 'NONE' : base.quantityLabel,
  };
}

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  // Inline "add a new capability" flow, triggered from either
  // requiredCapabilityId <select> (a price row's id, or 'new' for the
  // add-row form) — null means the modal is closed.
  const [newCapabilityTarget, setNewCapabilityTarget] = useState<string | null>(null);
  const [newCapabilityName, setNewCapabilityName] = useState('');
  const [newCapabilityCertType, setNewCapabilityCertType] = useState('NONE');
  const [savingCapability, setSavingCapability] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalMarkup, setGlobalMarkup] = useState('15');
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<EditState>({
    name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: 'NONE', minimumQuantity: '',
    includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '',
    requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false,
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backupsLoading, setBackupsLoading] = useState(false);

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
      pricingMethod: price.pricingMethod ?? 'FLAT_PRICE',
      requiresQuote: price.requiresQuote ?? false,
      basePrice: String(price.basePrice),
      markupPercent: price.markupPercent != null ? String(price.markupPercent) : '',
      quantityLabel: price.quantityLabel ?? 'NONE',
      minimumQuantity: price.minimumQuantity != null ? String(price.minimumQuantity) : '',
      includeQty: price.includeQty != null ? String(price.includeQty) : '',
      baseRateUnit: price.baseRateUnit != null ? String(price.baseRateUnit) : '',
      volumeDiscountThreshold: price.volumeDiscountThreshold != null ? String(price.volumeDiscountThreshold) : '',
      volumeDiscountRate: price.volumeDiscountRate != null ? String(price.volumeDiscountRate) : '',
      requiredCapabilityId: price.requiredCapabilityId ?? '',
      category: price.category ?? '',
      serviceGroups: price.serviceGroups ?? [],
      customerRequestable: price.customerRequestable ?? true,
      isQuotaInspection: price.isQuotaInspection ?? false,
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
        pricingMethod: state.pricingMethod,
        requiresQuote: state.requiresQuote,
        basePrice: parseFloat(state.basePrice) || 0,
        markupPercent: state.markupPercent !== '' ? parseFloat(state.markupPercent) : null,
        quantityLabel: state.quantityLabel || 'NONE',
        minimumQuantity: state.minimumQuantity !== '' ? parseFloat(state.minimumQuantity) : null,
        includeQty: state.includeQty !== '' ? parseFloat(state.includeQty) : null,
        baseRateUnit: state.baseRateUnit !== '' ? parseFloat(state.baseRateUnit) : null,
        volumeDiscountThreshold: state.volumeDiscountThreshold !== '' ? parseFloat(state.volumeDiscountThreshold) : null,
        volumeDiscountRate: state.volumeDiscountRate !== '' ? parseFloat(state.volumeDiscountRate) : null,
        requiredCapabilityId: state.requiredCapabilityId || null,
        category: state.category || null,
        serviceGroups: state.serviceGroups.length ? state.serviceGroups : null,
        customerRequestable: state.customerRequestable,
        isQuotaInspection: state.isQuotaInspection,
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  };

  const selectGroup = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkCategory('');
  };

  const applyBulkCategory = async () => {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    try {
      await pricingApi.bulkUpdateCategory([...selectedIds], bulkCategory || null);
      await reload();
      clearSelection();
    } finally {
      setBulkApplying(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      setBackups(await pricingApi.listBackups());
    } finally {
      setBackupsLoading(false);
    }
  };

  const toggleBackups = () => {
    setBackupsOpen((open) => {
      const next = !open;
      if (next && backups.length === 0) loadBackups();
      return next;
    });
  };

  const downloadBackup = async (id: string, createdAt: string) => {
    const res = await pricingApi.downloadBackupCsv(id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricing-backup-${new Date(createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        pricingMethod: newRow.pricingMethod,
        requiresQuote: newRow.requiresQuote,
        basePrice: parseFloat(newRow.basePrice) || 0,
        markupPercent: newRow.markupPercent !== '' ? parseFloat(newRow.markupPercent) : null,
        quantityLabel: newRow.quantityLabel || 'NONE',
        minimumQuantity: newRow.minimumQuantity !== '' ? parseFloat(newRow.minimumQuantity) : null,
        includeQty: newRow.includeQty !== '' ? parseFloat(newRow.includeQty) : null,
        baseRateUnit: newRow.baseRateUnit !== '' ? parseFloat(newRow.baseRateUnit) : null,
        volumeDiscountThreshold: newRow.volumeDiscountThreshold !== '' ? parseFloat(newRow.volumeDiscountThreshold) : null,
        volumeDiscountRate: newRow.volumeDiscountRate !== '' ? parseFloat(newRow.volumeDiscountRate) : null,
        requiredCapabilityId: newRow.requiredCapabilityId || null,
        category: newRow.category || null,
        serviceGroups: newRow.serviceGroups.length ? newRow.serviceGroups : null,
        customerRequestable: newRow.customerRequestable,
        isQuotaInspection: newRow.isQuotaInspection,
      });
      setPrices((prev) => [...prev, created]);
      setEditStates((prev) => ({ ...prev, [created.id]: rowToEdit(created) }));
      setNewRow({
        name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: 'NONE', minimumQuantity: '',
        includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '',
        requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false,
      });
      setAddingRow(false);
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete('new'); return n; });
    }
  };

  const updateField = (id: string, field: keyof EditState, value: any) =>
    setEditStates((prev) => {
      const base = prev[id];
      const patch = (field === 'requiresQuote' || field === 'pricingMethod')
        ? syncQuoteFields(base, field, value)
        : { [field]: value };
      return { ...prev, [id]: { ...base, ...patch } };
    });

  // Shared by both requiredCapabilityId <select>s (a price row's id, or
  // 'new' for the add-row form) — opens the inline "add a new capability"
  // form instead of assigning the sentinel value when that option is picked.
  const selectCapability = (target: string, value: string) => {
    if (value === ADD_NEW_CAPABILITY) {
      setNewCapabilityTarget(target);
      setNewCapabilityName('');
      setNewCapabilityCertType('NONE');
      return;
    }
    if (target === 'new') {
      setNewRow((p) => ({ ...p, requiredCapabilityId: value }));
    } else {
      updateField(target, 'requiredCapabilityId', value);
      setTimeout(() => savePrice(target), 0);
    }
  };

  const submitNewCapability = async () => {
    if (!newCapabilityName.trim() || !newCapabilityTarget) return;
    setSavingCapability(true);
    try {
      const created = await adminApi.createCapability({
        name: newCapabilityName.trim(),
        requiredCertificationType: newCapabilityCertType,
      });
      setCapabilities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      selectCapability(newCapabilityTarget, created.id);
      setNewCapabilityTarget(null);
    } finally {
      setSavingCapability(false);
    }
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const headers = ['id', 'name', 'description', 'pricingMethod', 'requiresQuote', 'basePrice', 'markupPercent', 'quantityLabel', 'minimumQuantity', 'includeQty', 'baseRateUnit', 'volumeDiscountThreshold', 'volumeDiscountRate', 'isActive', 'customerRequestable', 'category', 'Type of Service', 'isQuotaInspection'];
    const rows = prices.map((p) => {
      const s = editStates[p.id];
      const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
      return [
        esc(p.id),
        esc(s?.name || p.name),
        esc(s?.description || p.description || ''),
        esc(s?.pricingMethod || p.pricingMethod || 'FLAT_PRICE'),
        s?.requiresQuote ? 'true' : 'false',
        s?.basePrice || String(p.basePrice),
        s?.markupPercent || (p.markupPercent != null ? String(p.markupPercent) : ''),
        esc(s?.quantityLabel || p.quantityLabel || ''),
        s?.minimumQuantity || (p.minimumQuantity != null ? String(p.minimumQuantity) : ''),
        s?.includeQty || (p.includeQty != null ? String(p.includeQty) : ''),
        s?.baseRateUnit || (p.baseRateUnit != null ? String(p.baseRateUnit) : ''),
        s?.volumeDiscountThreshold || (p.volumeDiscountThreshold != null ? String(p.volumeDiscountThreshold) : ''),
        s?.volumeDiscountRate || (p.volumeDiscountRate != null ? String(p.volumeDiscountRate) : ''),
        p.isActive ? 'true' : 'false',
        (s?.customerRequestable ?? p.customerRequestable) ? 'true' : 'false',
        esc(s?.category || p.category || ''),
        esc((s?.serviceGroups || p.serviceGroups || []).join(',')),
        (s?.isQuotaInspection ?? p.isQuotaInspection) ? 'true' : 'false',
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
          pricingMethod: row.pricingMethod || 'FLAT_PRICE',
          requiresQuote: row.requiresQuote === 'true',
          basePrice: parseFloat(row.basePrice) || 0,
          markupPercent: row.markupPercent !== '' && row.markupPercent != null ? parseFloat(row.markupPercent) : null,
          quantityLabel: row.quantityLabel || null,
          minimumQuantity: row.minimumQuantity !== '' && row.minimumQuantity != null ? parseFloat(row.minimumQuantity) : null,
          includeQty: row.includeQty !== '' && row.includeQty != null ? parseFloat(row.includeQty) : null,
          baseRateUnit: row.baseRateUnit !== '' && row.baseRateUnit != null ? parseFloat(row.baseRateUnit) : null,
          volumeDiscountThreshold: row.volumeDiscountThreshold !== '' && row.volumeDiscountThreshold != null ? parseFloat(row.volumeDiscountThreshold) : null,
          volumeDiscountRate: row.volumeDiscountRate !== '' && row.volumeDiscountRate != null ? parseFloat(row.volumeDiscountRate) : null,
          isActive: row.isActive !== 'false',
          customerRequestable: row.customerRequestable !== 'false',
          category: row.category || null,
          serviceGroups: (() => {
            const groups = parseServiceGroups(row['Type of Service'] || '');
            return groups.length ? groups : null;
          })(),
          isQuotaInspection: row.isQuotaInspection === 'true',
        };

        // Match by id when the CSV carries one AND it still exists (a
        // re-imported export) so a renamed row updates in place; fall back to
        // name-matching whenever there's no id, or the id is stale (e.g. the
        // catalog was rebuilt since the CSV was exported) — matching by name
        // alone meant renaming a service via CSV silently created a
        // duplicate row instead of updating the original.
        const existing = (row.id && prices.find((p) => p.id === row.id))
          || prices.find((p) => p.name.toLowerCase() === row.name.toLowerCase());
        try {
          if (existing) {
            await pricingApi.update(existing.id, { name: row.name, ...payload });
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

  // Sorted purely for display — doesn't touch `prices` state or any
  // edit/save logic, so a newly-added row lands at the bottom until reload.
  const sortedPrices = [...prices].sort((a, b) => {
    const ai = CATEGORY_RANK.get(a.category ?? '') ?? CATEGORIES.length;
    const bi = CATEGORY_RANK.get(b.category ?? '') ?? CATEGORIES.length;
    return ai - bi;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Services Management</h1>
      <p className="text-steel mb-8">Edit service names, descriptions, pricing notes, and rates. Changes save on blur.</p>

      {/* Automatic Backups */}
      <div className="bg-white rounded-2xl border border-mist-dim mb-8">
        <button type="button" onClick={toggleBackups} className="w-full p-6 flex items-center justify-between text-left">
          <div>
            <h2 className="text-lg font-bold text-lantern-deep">Automatic Backups</h2>
            <p className="text-sm text-steel mt-1">A full snapshot saves every time the catalog changes — download one to recover from a mistake.</p>
          </div>
          <span className="text-steel text-sm font-semibold flex-shrink-0 ml-4">{backupsOpen ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {backupsOpen && (
          <div className="border-t border-mist-dim divide-y divide-canvas max-h-96 overflow-y-auto">
            {backupsLoading ? (
              <div className="p-6 text-steel text-sm">Loading…</div>
            ) : backups.length === 0 ? (
              <div className="p-6 text-steel text-sm">No backups yet — one is saved the next time you edit, add, delete, or import a service.</div>
            ) : (
              backups.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {new Date(b.createdAt).toLocaleString()} <span className="text-steel font-normal">— {b.reason.replace('-', ' ')}</span>
                    </div>
                    <div className="text-xs text-steel mt-0.5 truncate">
                      {b.detail ? `${b.detail} · ` : ''}{b.itemCount} service{b.itemCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadBackup(b.id, b.createdAt)}
                    className="text-sm font-semibold text-lantern-deep hover:underline flex-shrink-0"
                  >
                    Download CSV
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

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

        {/* Bulk category action bar */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mt-4 bg-mist border border-lantern rounded-xl p-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-ink">{selectedIds.size} selected</span>
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
            >
              <option value="">Uncategorized</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button
              onClick={applyBulkCategory}
              disabled={bulkApplying}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white transition-colors disabled:opacity-50"
            >
              {bulkApplying ? 'Applying…' : 'Apply Category'}
            </button>
            <button
              onClick={clearSelection}
              className="text-steel text-sm font-semibold px-3 py-2 hover:text-ink transition-colors"
            >
              Clear
            </button>
          </div>
        )}

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
          <table className="w-full text-sm sticky-thead">
            <thead>
              <tr className="border-b border-mist-dim bg-canvas/70">
                <th className="px-3 py-3 text-center font-semibold text-steel w-10">
                  <input
                    type="checkbox"
                    checked={sortedPrices.length > 0 && selectedIds.size === sortedPrices.length}
                    onChange={() => toggleSelectAll(sortedPrices.map((p) => p.id))}
                    className="w-4 h-4 rounded cursor-pointer accent-lantern"
                    title="Select all"
                  />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-steel w-16">Active</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[160px]">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[200px]">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[150px]">Pricing Method</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Quote Only</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Customer Requestable</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24" title="Draws from the plan's included inspections (subscription.inspectionsPerYear) instead of always charging its listed price — expected on exactly one row">Quota Inspection</th>
                <th className="px-4 py-3 text-left font-semibold text-steel w-40">Required Capability</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[190px]">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[220px]">Type of Service</th>
                <th className="px-4 py-3 text-left font-semibold text-steel w-32">Unit Label</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">Min. Qty</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Provider Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — units covered by Provider Price before per-unit tiering starts">Includes Up To</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — per-unit rate for quantity between Includes Up To and Discount Threshold">Base Rate/Unit</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — quantity at which the discounted rate kicks in; leave blank for no volume discount tier">Discount Threshold</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — per-unit rate beyond Discount Threshold">Discount Rate</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">Markup %</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Customer Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Global Markup</th>
                <th className="w-16 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {sortedPrices.map((price, idx) => {
                const state = editStates[price.id];
                if (!state) return null;
                const effectivePct = state.markupPercent !== ''
                  ? (parseFloat(state.markupPercent) || 0)
                  : (parseFloat(globalMarkup) || 0);
                // Preview at the effective minimum quantity for Per Unit services, so
                // editing Min. Qty actually moves the displayed Customer Price. Cost
                // itself runs through the same tiered formula the server uses.
                const previewQty = state.pricingMethod === 'PER_UNIT'
                  ? Math.max(1, parseFloat(state.minimumQuantity) || 1)
                  : 1;
                const previewCost = calcTieredCost(state, previewQty);
                const { customerPrice } = calcPricing(previewCost, effectivePct);
                const isSaving = saving.has(price.id);
                const isDeleting = deletingId === price.id;
                const inactive = !price.isActive;
                const showDivider = idx === 0 || sortedPrices[idx - 1].category !== price.category;

                return (
                  <Fragment key={price.id}>
                  {showDivider && (
                    <tr className="bg-canvas/70">
                      <td colSpan={20} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-steel">
                        <div className="flex items-center gap-3">
                          <span>{categoryLabel(price.category)}</span>
                          <button
                            onClick={() => selectGroup(
                              sortedPrices.filter((p) => p.category === price.category).map((p) => p.id)
                            )}
                            className="normal-case font-semibold text-lantern-deep hover:underline"
                          >
                            Select all
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className={`hover:bg-canvas/50 transition-colors ${inactive ? 'opacity-50' : ''}`}>
                    {/* Row select */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(price.id)}
                        onChange={() => toggleSelect(price.id)}
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
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
                    {/* Pricing Method */}
                    <td className="px-4 py-3">
                      <select
                        value={state.pricingMethod}
                        disabled={state.requiresQuote}
                        onChange={(e) => {
                          updateField(price.id, 'pricingMethod', e.target.value);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {PRICING_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
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
                    {/* Quota Inspection */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={state.isQuotaInspection}
                        onChange={(e) => {
                          updateField(price.id, 'isQuotaInspection', e.target.checked);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        title="Draws from the plan's included inspections instead of always charging its listed price — expected on exactly one row"
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Required Capability */}
                    <td className="px-4 py-3">
                      <select
                        value={state.requiredCapabilityId}
                        onChange={(e) => selectCapability(price.id, e.target.value)}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      >
                        <option value="">Any vendor</option>
                        {capabilities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                        <option value={ADD_NEW_CAPABILITY}>+ Add New Capability…</option>
                      </select>
                    </td>
                    {/* Category */}
                    <td className="px-4 py-3">
                      <select
                        value={state.category}
                        onChange={(e) => {
                          updateField(price.id, 'category', e.target.value);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      >
                        <option value="">Uncategorized</option>
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    {/* Type of Service — multi-valued, so checkboxes not a single select */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {SERVICE_GROUPS.map((g) => {
                          const checked = state.serviceGroups.includes(g.value);
                          return (
                            <label key={g.value} className="flex items-center gap-1 text-xs text-steel cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...state.serviceGroups, g.value]
                                    : state.serviceGroups.filter((v) => v !== g.value);
                                  updateField(price.id, 'serviceGroups', next);
                                  setTimeout(() => savePrice(price.id), 0);
                                }}
                                className="accent-lantern"
                              />
                              {g.label}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    {/* Unit Label */}
                    <td className="px-4 py-3">
                      <select
                        value={state.quantityLabel || 'NONE'}
                        onChange={(e) => {
                          updateField(price.id, 'quantityLabel', e.target.value);
                          setTimeout(() => savePrice(price.id), 0);
                        }}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      >
                        {UNIT_LABELS.map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
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
                    {/* Provider Price */}
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
                    {/* Includes Up To */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={state.includeQty}
                        onChange={(e) => updateField(price.id, 'includeQty', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="1"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                        min="0" step="0.01"
                      />
                    </td>
                    {/* Base Rate/Unit */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-steel text-xs">$</span>
                        <input
                          type="number"
                          value={state.baseRateUnit}
                          onChange={(e) => updateField(price.id, 'baseRateUnit', e.target.value)}
                          onBlur={() => savePrice(price.id)}
                          className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                          min="0" step="0.01"
                        />
                      </div>
                    </td>
                    {/* Discount Threshold */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={state.volumeDiscountThreshold}
                        onChange={(e) => updateField(price.id, 'volumeDiscountThreshold', e.target.value)}
                        onBlur={() => savePrice(price.id)}
                        placeholder="None"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                        min="0" step="0.01"
                      />
                    </td>
                    {/* Discount Rate */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-steel text-xs">$</span>
                        <input
                          type="number"
                          value={state.volumeDiscountRate}
                          onChange={(e) => updateField(price.id, 'volumeDiscountRate', e.target.value)}
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
                  </Fragment>
                );
              })}

              {/* Add new row */}
              {addingRow && (
                <tr className="bg-mist-dim/30 border-t-2 border-lantern">
                  <td className="px-3 py-3" />
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
                    <select
                      value={newRow.pricingMethod}
                      disabled={newRow.requiresQuote}
                      onChange={(e) => setNewRow((p) => ({ ...p, ...syncQuoteFields(p, 'pricingMethod', e.target.value) }))}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {PRICING_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={newRow.requiresQuote}
                      onChange={(e) => setNewRow((p) => ({ ...p, ...syncQuoteFields(p, 'requiresQuote', e.target.checked) }))}
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
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={newRow.isQuotaInspection}
                      onChange={(e) => setNewRow((p) => ({ ...p, isQuotaInspection: e.target.checked }))}
                      className="w-4 h-4 rounded cursor-pointer accent-lantern"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={newRow.requiredCapabilityId}
                      onChange={(e) => selectCapability('new', e.target.value)}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    >
                      <option value="">Any vendor</option>
                      {capabilities.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value={ADD_NEW_CAPABILITY}>+ Add New Capability…</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={newRow.category}
                      onChange={(e) => setNewRow((p) => ({ ...p, category: e.target.value }))}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    >
                      <option value="">Uncategorized</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_GROUPS.map((g) => {
                        const checked = newRow.serviceGroups.includes(g.value);
                        return (
                          <label key={g.value} className="flex items-center gap-1 text-xs text-steel cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...newRow.serviceGroups, g.value]
                                  : newRow.serviceGroups.filter((v) => v !== g.value);
                                setNewRow((p) => ({ ...p, serviceGroups: next }));
                              }}
                              className="accent-lantern"
                            />
                            {g.label}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={newRow.quantityLabel || 'NONE'}
                      onChange={(e) => setNewRow((p) => ({ ...p, quantityLabel: e.target.value }))}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    >
                      {UNIT_LABELS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
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
                    <input
                      type="number"
                      value={newRow.includeQty}
                      onChange={(e) => setNewRow((p) => ({ ...p, includeQty: e.target.value }))}
                      placeholder="1"
                      className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                      min="0" step="0.01"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-steel text-xs">$</span>
                      <input
                        type="number"
                        value={newRow.baseRateUnit}
                        onChange={(e) => setNewRow((p) => ({ ...p, baseRateUnit: e.target.value }))}
                        className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                        min="0" step="0.01"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newRow.volumeDiscountThreshold}
                      onChange={(e) => setNewRow((p) => ({ ...p, volumeDiscountThreshold: e.target.value }))}
                      placeholder="None"
                      className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none"
                      min="0" step="0.01"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-steel text-xs">$</span>
                      <input
                        type="number"
                        value={newRow.volumeDiscountRate}
                        onChange={(e) => setNewRow((p) => ({ ...p, volumeDiscountRate: e.target.value }))}
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
                        onClick={() => { setAddingRow(false); setNewRow({ name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', markupPercent: '', quantityLabel: 'NONE', minimumQuantity: '', includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '', requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false }); }}
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
            <strong>CSV format:</strong> name, description, pricingMethod (FLAT_PRICE/PER_UNIT/ONE_TIME_FEE/REQUEST_QUOTE), requiresQuote (true/false), basePrice, markupPercent, quantityLabel (HOUR/SQ_FT/BULB/SERVICE_TRIP/AC_UNIT/HOLE/LINEAR_FEET/UNIT/NONE — the Unit Label), minimumQuantity, includeQty, baseRateUnit, volumeDiscountThreshold, volumeDiscountRate, isActive (true/false), customerRequestable (true/false), category (INTERIOR_REPAIRS_MAINTENANCE/MINOR_ELECTRICAL_ADJUSTMENTS/MINOR_PLUMBING_FIXES/MOUNTING_INSTALLATIONS/CARPENTRY_ASSEMBLY/EXTERIOR_OUTDOOR_SERVICES, or blank), Type of Service (one or more of INSPECT/REPAIR/IMPROVE/MAINTAIN/INSTALL, comma- or semicolon-separated in one cell e.g. &quot;INSPECT,REPAIR&quot; — a separate, multi-valued tag from category, or blank) — existing rows matched by name, new names are created. includeQty/baseRateUnit/volumeDiscountThreshold/volumeDiscountRate only apply to Per Unit services (blank = flat qty × basePrice, matching pre-tiered behavior). Required Capability isn&apos;t part of CSV — set it per-row in the table above.
          </p>
        </div>
      </div>

      {/* Inline "add a new capability" modal — triggered from either
          requiredCapabilityId <select>. Every active vendor gets notified
          once this saves (apps/api AdminService.createCapability). */}
      {newCapabilityTarget !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setNewCapabilityTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-lantern-deep">Add New Capability</h2>
            <p className="text-sm text-steel">
              Every active vendor will be notified so they can add it to their profile if they offer it.
            </p>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Name</label>
              <input
                autoFocus
                value={newCapabilityName}
                onChange={(e) => setNewCapabilityName(e.target.value)}
                placeholder="e.g. Fence Installation"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Required Certification</label>
              <select
                value={newCapabilityCertType}
                onChange={(e) => setNewCapabilityCertType(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
              >
                {CERTIFICATION_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-steel mt-1">Leave as None unless this trade requires an approved license on file.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={submitNewCapability}
                disabled={savingCapability || !newCapabilityName.trim()}
                className="flex-1 bg-lantern text-ink px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
              >
                {savingCapability ? 'Adding…' : 'Add Capability'}
              </button>
              <button
                onClick={() => setNewCapabilityTarget(null)}
                className="text-steel hover:text-ink px-4 py-2.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
