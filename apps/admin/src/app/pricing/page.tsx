'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { pricingApi, subscriptionsApi, adminApi, templateApi, unitLabelApi } from '@/lib/api';

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

function calcPricing(providerCost: number, gmPct: number) {
  const subtotal = providerCost / (1 - gmPct / 100);
  const stripeFee = subtotal * STRIPE_RATE + STRIPE_FIXED;
  const customerPrice = subtotal + stripeFee;
  return { stripeFee, customerPrice };
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

// Mirrors the entity's syncBaseRateUnit() hook (Per Unit + Hour-labeled rows
// always store basePrice/includeQty as their rate) — previewed live here so
// what an admin sees while editing basePrice/includeQty is what will
// actually get saved, rather than a value that goes stale mid-edit.
function computeHourlyBaseRate(basePrice: string, includeQty: string): string {
  const bp = parseFloat(basePrice) || 0;
  const incl = includeQty !== '' ? parseFloat(includeQty) || 1 : 1;
  return incl !== 0 ? (bp / incl).toFixed(2) : '';
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

// Unit Labels are admin-manageable now (service_unit_labels table) rather
// than a hardcoded list — fetched into the `unitLabels` component state on
// load. `code` is what's actually stored in a row's quantityLabel; `label`
// is the display text shown in dropdowns and this formula narration.
type UnitLabelRow = { id: string; code: string; label: string; isSystem: boolean };
const ADD_NEW_UNIT_LABEL = '__add_new_label__';

// Plain-language description of the pricing rule for this row — mirrors the
// exact same calcTieredCost/calcPricing math as the live Customer Price
// preview elsewhere on this page (including the Stripe pass-through fee, so
// the dollar figure quoted here agrees with that column instead of a raw
// backend-only number), just narrated instead of only computed.
function formatFormulaReference(state: EditState, globalGM: string, unitLabels: UnitLabelRow[]): string {
  if (state.pricingMethod === 'REQUEST_QUOTE') {
    return 'Priced case-by-case by an admin — no fixed formula.';
  }
  const effectivePct = state.gmPercent !== ''
    ? (parseFloat(state.gmPercent) || 0)
    : (parseFloat(globalGM) || 0);
  const unitLabel = unitLabels.find((u) => u.code === state.quantityLabel)?.label || 'unit';
  const base = parseFloat(state.basePrice) || 0;

  if (state.pricingMethod !== 'PER_UNIT') {
    const { customerPrice } = calcPricing(base, effectivePct);
    return `Flat $${base.toFixed(2)}, at ${effectivePct}% GM (+ payment processing) → customer pays $${customerPrice.toFixed(2)}.`;
  }

  const include = state.includeQty !== '' ? parseFloat(state.includeQty) || 0 : 1;
  let text = `$${base.toFixed(2)} covers the first ${include} ${unitLabel}(s)`;
  if (state.baseRateUnit !== '') {
    const rate = parseFloat(state.baseRateUnit) || 0;
    text += `, then +$${rate.toFixed(2)}/unit`;
    if (state.volumeDiscountThreshold !== '') {
      const threshold = parseFloat(state.volumeDiscountThreshold) || 0;
      const volRate = parseFloat(state.volumeDiscountRate) || 0;
      text += ` up to ${threshold} ${unitLabel}(s) total, then +$${volRate.toFixed(2)}/unit beyond`;
    }
  }
  text += `. At ${effectivePct}% GM (+ payment processing) for the customer price.`;
  return text;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'INSPECTIONS', label: 'Inspections' },
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
const categoryKey = (v: string | null) => v ?? '__uncategorized__';

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
  gmPercent: number | null;
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
  formulaDescription: string | null;
};

type EditState = {
  name: string;
  description: string;
  pricingMethod: string;
  requiresQuote: boolean;
  basePrice: string;
  gmPercent: string;
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
  formulaDescription: string;
};

// Everything on a price row now requires an explicit Save press — this
// compares the live draft against the last-saved server row to decide
// whether that row's Save button should show.
function statesEqual(a: EditState, b: EditState): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.pricingMethod === b.pricingMethod &&
    a.requiresQuote === b.requiresQuote &&
    a.basePrice === b.basePrice &&
    a.gmPercent === b.gmPercent &&
    a.quantityLabel === b.quantityLabel &&
    a.minimumQuantity === b.minimumQuantity &&
    a.includeQty === b.includeQty &&
    a.baseRateUnit === b.baseRateUnit &&
    a.volumeDiscountThreshold === b.volumeDiscountThreshold &&
    a.volumeDiscountRate === b.volumeDiscountRate &&
    a.requiredCapabilityId === b.requiredCapabilityId &&
    a.category === b.category &&
    a.customerRequestable === b.customerRequestable &&
    a.isQuotaInspection === b.isQuotaInspection &&
    a.formulaDescription === b.formulaDescription &&
    a.serviceGroups.length === b.serviceGroups.length &&
    a.serviceGroups.every((v, i) => v === b.serviceGroups[i])
  );
}

type PlanDraft = { price: string; description: string; features: string[] };

function planToDraft(plan: any): PlanDraft {
  return {
    price: String(plan.price),
    description: plan.description ?? '',
    features: Array.isArray(plan.features) ? [...plan.features] : [],
  };
}

function planDirty(plan: any, draft: PlanDraft | undefined): boolean {
  if (!draft) return false;
  if (draft.price !== String(plan.price)) return true;
  if (draft.description !== (plan.description ?? '')) return true;
  const serverFeatures: string[] = Array.isArray(plan.features) ? plan.features : [];
  if (draft.features.length !== serverFeatures.length) return true;
  return draft.features.some((f, i) => f !== serverFeatures[i]);
}

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
  // Unit Labels: "Manage Unit Labels" modal, opened either from the column
  // header icon (manageLabelsTarget stays null — pure management, no
  // auto-select) or from a row's "+ Add New Label…" option (target is that
  // row's id, or 'new' for the add-row form, so a freshly-created label
  // auto-selects there and the modal closes).
  const [unitLabels, setUnitLabels] = useState<UnitLabelRow[]>([]);
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  const [manageLabelsTarget, setManageLabelsTarget] = useState<string | null>(null);
  const [newLabelText, setNewLabelText] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState('');
  const [editingLabelError, setEditingLabelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalGM, setGlobalGM] = useState('15');
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [savingPlan, setSavingPlan] = useState<Set<string>>(new Set());
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<EditState>({
    name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', gmPercent: '', quantityLabel: 'NONE', minimumQuantity: '',
    includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '',
    requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false,
    formulaDescription: '',
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  // "+ Add a Service" router modal — a single admin-wide starting point for
  // creating any kind of service, so the admin never has to already know
  // whether it belongs on this page or the Marketplace page before they can
  // start. Pure navigation/routing, no new creation logic of its own — each
  // destination triggers the same create action that page already has.
  const [addServiceModalOpen, setAddServiceModalOpen] = useState(false);
  const [routerTemplates, setRouterTemplates] = useState<any[]>([]);
  const [routerTemplateId, setRouterTemplateId] = useState('');
  useEffect(() => {
    if (addServiceModalOpen) templateApi.getTemplates().then(setRouterTemplates);
  }, [addServiceModalOpen]);
  const routeToGeneralCatalog = () => {
    setAddServiceModalOpen(false);
    setAddingRow(true);
    document.getElementById('additional-services-catalog')?.scrollIntoView({ behavior: 'smooth' });
  };
  const routeToMarketplaceOffer = () => {
    window.location.href = '/marketplace?openGroup=OTHER_MARKETPLACE&action=addOffer';
  };
  const routeToTemplateService = () => {
    if (!routerTemplateId) return;
    window.location.href = `/marketplace?openGroup=OFFER_TEMPLATES&templateId=${routerTemplateId}&action=addService`;
  };

  useEffect(() => {
    Promise.all([pricingApi.getAll(), subscriptionsApi.getPlans(), adminApi.getCapabilities(), unitLabelApi.getAll()])
      .then(([p, s, caps, labels]) => {
        setPrices(p);
        setPlans(s);
        setCapabilities(caps);
        setUnitLabels(labels);
        const states: Record<string, EditState> = {};
        for (const price of p) states[price.id] = rowToEdit(price);
        setEditStates(states);
        const drafts: Record<string, PlanDraft> = {};
        for (const plan of s) drafts[plan.id] = planToDraft(plan);
        setPlanDrafts(drafts);
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
      gmPercent: price.gmPercent != null ? String(price.gmPercent) : '',
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
      formulaDescription: price.formulaDescription ?? '',
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
        gmPercent: state.gmPercent !== '' ? parseFloat(state.gmPercent) : null,
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
        formulaDescription: state.formulaDescription || null,
      });
      setPrices((prev) => prev.map((p) => p.id === id ? { ...p, ...updated } : p));
      // Resync the draft to the server's canonical values (e.g. a decimal
      // column round-tripping "15" -> "15.00") — otherwise a merely
      // cosmetic formatting difference leaves the row looking permanently
      // dirty even though the save succeeded, and repeated Save presses
      // appear to do nothing.
      setEditStates((prev) => ({ ...prev, [id]: rowToEdit(updated) }));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const saveAllPrices = async (ids: string[]) => {
    setSavingAll(true);
    try {
      await Promise.all(ids.map((id) => savePrice(id)));
    } finally {
      setSavingAll(false);
    }
  };

  const updatePlanDraft = (id: string, patch: Partial<PlanDraft>) =>
    setPlanDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const addPlanFeature = (id: string) =>
    setPlanDrafts((prev) => ({ ...prev, [id]: { ...prev[id], features: [...prev[id].features, ''] } }));

  const updatePlanFeature = (id: string, idx: number, value: string) =>
    setPlanDrafts((prev) => {
      const features = [...prev[id].features];
      features[idx] = value;
      return { ...prev, [id]: { ...prev[id], features } };
    });

  const removePlanFeature = (id: string, idx: number) =>
    setPlanDrafts((prev) => ({ ...prev, [id]: { ...prev[id], features: prev[id].features.filter((_, i) => i !== idx) } }));

  const moveFeature = (id: string, idx: number, direction: -1 | 1) =>
    setPlanDrafts((prev) => {
      const features = [...prev[id].features];
      const target = idx + direction;
      if (target < 0 || target >= features.length) return prev;
      [features[idx], features[target]] = [features[target], features[idx]];
      return { ...prev, [id]: { ...prev[id], features } };
    });

  const savePlan = async (id: string) => {
    const draft = planDrafts[id];
    if (!draft) return;
    setSavingPlan((s) => new Set(s).add(id));
    try {
      // features is a TypeORM simple-array (comma-joined in the DB) — a
      // literal comma in admin-entered text would silently split into two
      // bullets on next load, so swap it for a safe separator on save.
      const cleanedFeatures = draft.features.map((f) => f.trim().replace(/,/g, ';')).filter((f) => f.length > 0);
      const updated = await subscriptionsApi.updatePlan(id, {
        price: parseFloat(draft.price) || 0,
        description: draft.description,
        features: cleanedFeatures,
      });
      setPlans((prev) => prev.map((p) => p.id === id ? { ...p, ...updated } : p));
      setPlanDrafts((prev) => ({ ...prev, [id]: planToDraft(updated) }));
    } finally {
      setSavingPlan((s) => { const n = new Set(s); n.delete(id); return n; });
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

  const toggleCategoryCollapsed = (key: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

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
        gmPercent: newRow.gmPercent !== '' ? parseFloat(newRow.gmPercent) : null,
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
        formulaDescription: newRow.formulaDescription || null,
      });
      setPrices((prev) => [...prev, created]);
      setEditStates((prev) => ({ ...prev, [created.id]: rowToEdit(created) }));
      setNewRow({
        name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', gmPercent: '', quantityLabel: 'NONE', minimumQuantity: '',
        includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '',
        requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false,
        formulaDescription: '',
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

  // Shared by both quantityLabel <select>s, same pattern as selectCapability
  // above — opens the Manage Unit Labels modal instead of assigning the
  // sentinel value when "+ Add New Label…" is picked.
  const selectUnitLabel = (target: string, value: string) => {
    if (value === ADD_NEW_UNIT_LABEL) {
      openManageLabels(target);
      return;
    }
    if (target === 'new') {
      setNewRow((p) => ({ ...p, quantityLabel: value }));
    } else {
      updateField(target, 'quantityLabel', value);
    }
  };

  const openManageLabels = (target: string | null) => {
    setManageLabelsTarget(target);
    setManageLabelsOpen(true);
    setNewLabelText('');
    setEditingLabelId(null);
    setEditingLabelError(null);
  };

  const submitNewLabel = async () => {
    if (!newLabelText.trim()) return;
    setSavingLabel(true);
    try {
      const created = await unitLabelApi.create(newLabelText.trim());
      setUnitLabels((prev) => [...prev, created].sort((a, b) => a.label.localeCompare(b.label)));
      if (manageLabelsTarget !== null) {
        selectUnitLabel(manageLabelsTarget, created.code);
        setManageLabelsOpen(false);
      }
      setNewLabelText('');
    } finally {
      setSavingLabel(false);
    }
  };

  const startEditLabel = (label: UnitLabelRow) => {
    setEditingLabelId(label.id);
    setEditingLabelText(label.label);
    setEditingLabelError(null);
  };

  const cancelEditLabel = () => {
    setEditingLabelId(null);
    setEditingLabelText('');
    setEditingLabelError(null);
  };

  // Save with empty text is a delete — the user's own framing for this
  // feature ("if the label text is deleted and then saved, that is a
  // delete action"). isSystem labels (Hour/None) block delete but not
  // rename, both here and re-enforced server-side.
  const saveEditLabel = async (label: UnitLabelRow) => {
    const trimmed = editingLabelText.trim();
    setEditingLabelError(null);
    try {
      if (trimmed === '') {
        if (label.isSystem) {
          setEditingLabelError("Hour and None are required by the pricing engine and can't be deleted.");
          return;
        }
        if (!window.confirm(`Delete the "${label.label}" unit label? Any service still using it will show its raw code instead.`)) return;
        await unitLabelApi.remove(label.id);
        setUnitLabels((prev) => prev.filter((u) => u.id !== label.id));
        cancelEditLabel();
        return;
      }
      if (trimmed === label.label) { cancelEditLabel(); return; }
      const updated = await unitLabelApi.update(label.id, trimmed);
      setUnitLabels((prev) => prev.map((u) => (u.id === label.id ? updated : u)).sort((a, b) => a.label.localeCompare(b.label)));
      cancelEditLabel();
    } catch (e: any) {
      setEditingLabelError(e.message || 'Something went wrong — try again.');
    }
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const headers = ['id', 'name', 'description', 'pricingMethod', 'requiresQuote', 'basePrice', 'gmPercent', 'quantityLabel', 'minimumQuantity', 'includeQty', 'baseRateUnit', 'volumeDiscountThreshold', 'volumeDiscountRate', 'isActive', 'customerRequestable', 'category', 'Type of Service', 'isQuotaInspection', 'formulaDescription'];
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
        s?.gmPercent || (p.gmPercent != null ? String(p.gmPercent) : ''),
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
        esc(s?.formulaDescription || p.formulaDescription || ''),
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
          gmPercent: row.gmPercent !== '' && row.gmPercent != null ? parseFloat(row.gmPercent) : null,
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
          formulaDescription: row.formulaDescription || null,
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

  // Services whose name partially matches the toolbar filter (case-insensitive).
  // Empty filter = everything, same as no filter applied at all.
  const trimmedFilter = nameFilter.trim().toLowerCase();
  const filteredPrices = trimmedFilter
    ? sortedPrices.filter((p) => p.name.toLowerCase().includes(trimmedFilter))
    : sortedPrices;

  // Every defined category gets its own always-visible section — including
  // ones with zero services in them right now (e.g. a brand-new category
  // like Inspections) — plus a trailing Uncategorized bucket, so there's
  // always somewhere to see/target a category before anything's assigned to
  // it. Recomputed from live `prices` every render, so re-categorizing a
  // service (after Save) moves it into its new group automatically.
  const categoryGroups = [
    ...CATEGORIES.map((c) => ({ key: c.value as string | null, label: c.label })),
    { key: null as string | null, label: 'Uncategorized' },
  ].map((g) => ({ ...g, items: filteredPrices.filter((p) => (p.category ?? null) === g.key) }));

  // One button saves every unsaved row in the catalog at once, rather than
  // hunting down a per-row Save on each edited service.
  const dirtyPriceIds = prices
    .filter((p) => editStates[p.id] && !statesEqual(editStates[p.id], rowToEdit(p)))
    .map((p) => p.id);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep mb-2">Services Management</h1>
          <p className="text-steel">Edit service names, descriptions, pricing notes, and rates. Press Save on a row to apply your changes.</p>
        </div>
        <button
          onClick={() => setAddServiceModalOpen(true)}
          className="bg-lantern-deep text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep/90 transition-colors flex-shrink-0"
        >
          + Add a Service
        </button>
      </div>

      {addServiceModalOpen && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={() => setAddServiceModalOpen(false)}>
          <div className="bg-white rounded-2xl border border-mist-dim p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-lantern-deep mb-1">Where does this service belong?</h2>
            <p className="text-sm text-steel mb-4">Pick a destination — you'll land on the right screen with the right create action already started.</p>
            <div className="flex flex-col gap-2">
              <button onClick={routeToGeneralCatalog} className="text-left border border-border rounded-lg px-4 py-3 hover:bg-canvas transition-colors">
                <div className="font-semibold text-ink text-sm">General Service Catalog</div>
                <div className="text-xs text-steel mt-0.5">A regular flat/tiered-price service, shown in the app's general "+Request Service" browse screen.</div>
              </button>
              <button onClick={routeToMarketplaceOffer} className="text-left border border-border rounded-lg px-4 py-3 hover:bg-canvas transition-colors">
                <div className="font-semibold text-ink text-sm">Marketplace — flat offer</div>
                <div className="text-xs text-steel mt-0.5">A simple Marketplace-only offer with a flat price or Request Quote (e.g. Flooring Services).</div>
              </button>
              <div className="border border-border rounded-lg px-4 py-3">
                <div className="font-semibold text-ink text-sm mb-2">Marketplace — Offer Template add-on</div>
                <div className="text-xs text-steel mb-2">An add-on service under an existing rich Marketplace Offer Template (packages, property inputs, factors).</div>
                <div className="flex items-center gap-2">
                  <select value={routerTemplateId} onChange={(e) => setRouterTemplateId(e.target.value)} className="flex-1 border border-border rounded px-2 py-1.5 text-sm">
                    <option value="">Select a template…</option>
                    {routerTemplates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button
                    onClick={routeToTemplateService}
                    disabled={!routerTemplateId}
                    className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
            <button onClick={() => setAddServiceModalOpen(false)} className="mt-4 text-xs text-steel hover:text-ink font-semibold">Cancel</button>
          </div>
        </div>
      )}

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
          <p className="text-sm text-steel mt-1">Price, description, and feature bullets shown on the homeowner app's "My Plan" screen. Press Save to apply changes.</p>
        </div>
        <div className="divide-y divide-canvas">
          {plans.map((plan: any) => {
            const draft = planDrafts[plan.id];
            if (!draft) return null;
            const dirty = planDirty(plan, draft);
            const isPlanSaving = savingPlan.has(plan.id);
            return (
              <div key={plan.id} className="p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold text-ink">{plan.name}</div>
                    <div className="text-sm text-steel">{plan.tier} tier</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-steel">$</span>
                    <input
                      type="number"
                      value={draft.price}
                      onChange={(e) => updatePlanDraft(plan.id, { price: e.target.value })}
                      className="w-24 border border-border rounded-lg px-3 py-2 text-right focus:border-lantern outline-none"
                    />
                    <span className="text-sm text-steel">/year</span>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-steel uppercase tracking-wide">Description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => updatePlanDraft(plan.id, { description: e.target.value })}
                    rows={2}
                    className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none resize-none"
                  />
                </div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-steel uppercase tracking-wide">Features shown to homeowners</label>
                  <div className="mt-1.5 space-y-2">
                    {draft.features.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex flex-col -my-1">
                          <button
                            type="button"
                            onClick={() => moveFeature(plan.id, idx, -1)}
                            disabled={idx === 0}
                            className="text-steel hover:text-ink disabled:opacity-25 disabled:cursor-not-allowed leading-none px-1"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFeature(plan.id, idx, 1)}
                            disabled={idx === draft.features.length - 1}
                            className="text-steel hover:text-ink disabled:opacity-25 disabled:cursor-not-allowed leading-none px-1"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <input
                          type="text"
                          value={f}
                          onChange={(e) => updatePlanFeature(plan.id, idx, e.target.value)}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removePlanFeature(plan.id, idx)}
                          className="text-steel hover:text-red-500 transition-colors px-1"
                          title="Remove feature"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addPlanFeature(plan.id)}
                      className="text-sm font-semibold text-lantern-deep hover:underline"
                    >
                      + Add feature
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3 h-9">
                  {isPlanSaving ? (
                    <div className="w-4 h-4 border-2 border-lantern border-t-transparent rounded-full animate-spin" />
                  ) : dirty ? (
                    <button
                      type="button"
                      onClick={() => savePlan(plan.id)}
                      className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white transition-colors"
                    >
                      Save Changes
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Service Prices */}
      <div id="additional-services-catalog" className="bg-white rounded-2xl border border-mist-dim">
        <div className="p-6 border-b border-mist-dim flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-lantern-deep">Additional Services Catalog</h2>
            <p className="text-sm text-steel mt-1">
              All fields editable — edited rows show a dot; press "Save Changes" to apply all edits at once. Stripe fee: 2.9% + $0.30. Toggle the switch to disable without deleting (applies immediately).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => saveAllPrices(dirtyPriceIds)}
              disabled={dirtyPriceIds.length === 0 || savingAll}
              className="bg-lantern-deep text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lantern-deep"
            >
              {savingAll ? 'Saving…' : dirtyPriceIds.length > 0 ? `Save Changes (${dirtyPriceIds.length})` : 'Save Changes'}
            </button>
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
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Filter by name…"
              className="border border-border rounded-lg px-3 py-2 text-sm w-48 focus:border-lantern outline-none"
            />
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

        {/* A bounded height + overflow-auto here (rather than relying on the
            page's own <main> scroll) makes this div the actual scrolling
            box, so the sticky-thead header genuinely freezes at its top
            instead of scrolling away with an intervening overflow-x-auto
            ancestor that never itself gets clipped. */}
        <div className="overflow-auto mt-2 max-h-[70vh]">
          <table className="w-full text-sm sticky-thead">
            <thead>
              <tr className="border-b border-mist-dim bg-canvas/70">
                <th className="sticky-col px-3 py-3 text-center font-semibold text-steel w-10 left-0 bg-canvas/70">
                  <input
                    type="checkbox"
                    checked={filteredPrices.length > 0 && selectedIds.size === filteredPrices.length}
                    onChange={() => toggleSelectAll(filteredPrices.map((p) => p.id))}
                    className="w-4 h-4 rounded cursor-pointer accent-lantern"
                    title="Select all"
                  />
                </th>
                <th className="sticky-col px-3 py-3 text-left font-semibold text-steel w-16 left-10 bg-canvas/70">Active</th>
                <th className="sticky-col px-4 py-3 text-left font-semibold text-steel min-w-[160px] left-[6.5rem] bg-canvas/70 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[200px]">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[150px]">Pricing Method</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Quote Only</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24">Customer Requestable</th>
                <th className="px-4 py-3 text-center font-semibold text-steel w-24" title="Draws from the plan's included inspections (subscription.inspectionsPerYear) instead of always charging its listed price — expected on exactly one row">Quota Inspection</th>
                <th className="px-4 py-3 text-left font-semibold text-steel w-40">Required Capability</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[190px]">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[220px]">Type of Service</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[190px]">
                  <div className="flex items-center gap-1.5">
                    <span>Unit Label</span>
                    <button
                      type="button"
                      onClick={() => openManageLabels(null)}
                      className="text-steel hover:text-lantern-deep"
                      title="Manage Unit Labels — rename or delete"
                    >
                      ✎
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">Min. Qty</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Provider Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — units covered by Provider Price before per-unit tiering starts">Includes Up To</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — per-unit rate for quantity between Includes Up To and Discount Threshold">Base Rate/Unit</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — quantity at which the discounted rate kicks in; leave blank for no volume discount tier">Discount Threshold</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="Per Unit only — per-unit rate beyond Discount Threshold">Discount Rate</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24">GM%</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[200px]" title="Free-text admin notes on why this item is priced the way it is">Formula Description</th>
                <th className="px-4 py-3 text-left font-semibold text-steel min-w-[260px]" title="Auto-generated from this row's own fields — not stored, always reflects the current (even unsaved) values">Formula Reference</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-24" title="2.9% + $0.30, passed through to the customer — already folded into Customer Price, shown separately so it isn't mistaken for missing">Stripe Fee</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Customer Price</th>
                <th className="px-4 py-3 text-right font-semibold text-steel w-28">Global GM%</th>
                <th className="w-16 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {categoryGroups.map((group) => {
                const catKey = categoryKey(group.key);
                const collapsed = collapsedCategories.has(catKey);
                return (
                  <Fragment key={catKey}>
                  <tr className="bg-canvas/70">
                    <td colSpan={21} className="text-xs font-bold uppercase tracking-wide text-steel">
                      {/* Sticky on the inner content (not the <td> itself) — the
                          <td>'s colSpan makes it as wide as the whole table, so
                          sticking the cell itself would pin the entire row in
                          place instead of just the label. This inline-flex box
                          is only as wide as its content, so it can float at the
                          left edge of the scroll area while the wide <td> (and
                          its background) scrolls normally underneath. */}
                      <div className="sticky left-0 z-[2] inline-flex items-center gap-3 bg-canvas/70 px-4 py-2">
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapsed(catKey)}
                          className="flex items-center gap-2 normal-case text-steel hover:text-ink transition-colors"
                          title={collapsed ? 'Expand category' : 'Collapse category'}
                        >
                          <span className={`inline-block text-[10px] transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
                          {group.label}
                          <span className="normal-case font-normal text-steel/70">({group.items.length})</span>
                        </button>
                        {group.items.length > 0 && (
                          <button
                            onClick={() => selectGroup(group.items.map((p) => p.id))}
                            className="normal-case font-semibold text-lantern-deep hover:underline"
                          >
                            Select all
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {!collapsed && group.items.length === 0 && (
                    <tr>
                      <td colSpan={21} className="px-4 py-4 text-xs text-steel italic">{trimmedFilter ? 'No services match your filter.' : 'No services in this category yet.'}</td>
                    </tr>
                  )}
                  {!collapsed && group.items.map((price) => {
                    const state = editStates[price.id];
                    if (!state) return null;
                    const effectivePct = state.gmPercent !== ''
                      ? (parseFloat(state.gmPercent) || 0)
                      : (parseFloat(globalGM) || 0);
                    // Preview at the effective minimum quantity for Per Unit services, so
                    // editing Min. Qty actually moves the displayed Customer Price. Cost
                    // itself runs through the same tiered formula the server uses.
                    const previewQty = state.pricingMethod === 'PER_UNIT'
                      ? Math.max(1, parseFloat(state.minimumQuantity) || 1)
                      : 1;
                    const previewCost = calcTieredCost(state, previewQty);
                    const { stripeFee, customerPrice } = calcPricing(previewCost, effectivePct);
                    const isSaving = saving.has(price.id);
                    const isDirty = !statesEqual(state, rowToEdit(price));
                    const inactive = !price.isActive;

                    return (
                  <tr key={price.id} className={`hover:bg-canvas/50 transition-colors ${inactive ? 'opacity-50' : ''}`}>
                    {/* Row select */}
                    <td className="sticky left-0 z-[1] bg-white px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(price.id)}
                        onChange={() => toggleSelect(price.id)}
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Active toggle */}
                    <td className="sticky left-10 z-[1] bg-white px-3 py-3 text-center">
                      <button
                        onClick={() => toggleActive(price.id, price.isActive)}
                        title={price.isActive ? 'Disable service' : 'Enable service'}
                        className={`w-10 h-6 rounded-full transition-colors ${price.isActive ? 'bg-lantern' : 'bg-steel'} relative`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${price.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </td>
                    {/* Name */}
                    <td className="sticky left-[6.5rem] z-[1] bg-white px-4 py-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => updateField(price.id, 'name', e.target.value)}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm font-semibold text-ink focus:border-lantern outline-none"
                      />
                    </td>
                    {/* Description */}
                    <td className="px-4 py-3">
                      <textarea
                        value={state.description}
                        onChange={(e) => updateField(price.id, 'description', e.target.value)}
                        rows={2}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs text-steel focus:border-lantern outline-none resize-none"
                      />
                    </td>
                    {/* Pricing Method */}
                    <td className="px-4 py-3">
                      <select
                        value={state.pricingMethod}
                        disabled={state.requiresQuote}
                        onChange={(e) => updateField(price.id, 'pricingMethod', e.target.value)}
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
                        onChange={(e) => updateField(price.id, 'requiresQuote', e.target.checked)}
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Customer Requestable */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={state.customerRequestable}
                        onChange={(e) => updateField(price.id, 'customerRequestable', e.target.checked)}
                        title="Uncheck for services only Attenteve triggers (e.g. Home Monitoring Setup) — hidden from the customer's own request list"
                        className="w-4 h-4 rounded cursor-pointer accent-lantern"
                      />
                    </td>
                    {/* Quota Inspection */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={state.isQuotaInspection}
                        onChange={(e) => updateField(price.id, 'isQuotaInspection', e.target.checked)}
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
                        onChange={(e) => updateField(price.id, 'category', e.target.value)}
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
                        onChange={(e) => selectUnitLabel(price.id, e.target.value)}
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-steel focus:border-lantern outline-none"
                      >
                        {unitLabels.map((u) => (
                          <option key={u.id} value={u.code}>{u.label}</option>
                        ))}
                        {state.quantityLabel && !unitLabels.some((u) => u.code === state.quantityLabel) && (
                          <option value={state.quantityLabel}>{state.quantityLabel} (unknown)</option>
                        )}
                        <option value={ADD_NEW_UNIT_LABEL}>+ Add New Label…</option>
                      </select>
                    </td>
                    {/* Minimum Quantity */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={state.minimumQuantity}
                        onChange={(e) => updateField(price.id, 'minimumQuantity', e.target.value)}
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
                          disabled={state.requiresQuote}
                          className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={state.pricingMethod !== 'PER_UNIT'}
                        placeholder="1"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        min="0" step="0.01"
                      />
                    </td>
                    {/* Base Rate/Unit */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-steel text-xs">$</span>
                        <input
                          type="number"
                          value={
                            state.pricingMethod === 'PER_UNIT' && state.quantityLabel === 'HOUR'
                              ? computeHourlyBaseRate(state.basePrice, state.includeQty)
                              : state.baseRateUnit
                          }
                          onChange={(e) => updateField(price.id, 'baseRateUnit', e.target.value)}
                          disabled={state.pricingMethod !== 'PER_UNIT' || state.quantityLabel === 'HOUR'}
                          title={state.quantityLabel === 'HOUR' ? 'Auto-calculated as Provider Price ÷ Includes Up To for Hour-labeled services' : undefined}
                          className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={state.pricingMethod !== 'PER_UNIT'}
                        placeholder="None"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                          disabled={state.pricingMethod !== 'PER_UNIT'}
                          className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          min="0" step="0.01"
                        />
                      </div>
                    </td>
                    {/* GM% */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={state.gmPercent}
                          onChange={(e) => updateField(price.id, 'gmPercent', e.target.value)}
                          placeholder={globalGM}
                          className="w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none placeholder-steel"
                          min="0" max="99.99" step="0.1"
                        />
                        <span className="text-steel text-xs">%</span>
                      </div>
                    </td>
                    {/* Formula Description — free-text admin notes, not derived */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={state.formulaDescription}
                        onChange={(e) => updateField(price.id, 'formulaDescription', e.target.value)}
                        placeholder="Optional notes…"
                        className="w-full min-w-[180px] border border-border rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                      />
                    </td>
                    {/* Formula Reference — auto-generated, read-only, never saved */}
                    <td className="px-4 py-3 text-xs text-steel min-w-[240px]">
                      {formatFormulaReference(state, globalGM, unitLabels)}
                    </td>
                    {/* Stripe Fee — informational only, already included in Customer Price */}
                    <td className="px-4 py-3 text-right">
                      {!state.requiresQuote && (
                        <span className="text-steel tabular-nums">${stripeFee.toFixed(2)}</span>
                      )}
                    </td>
                    {/* Customer Price */}
                    <td className="px-4 py-3 text-right">
                      {state.requiresQuote ? (
                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded-full px-2 py-1">Request a Quote</span>
                      ) : (
                        <span className="font-bold text-lantern-deep tabular-nums">${Math.ceil(customerPrice)}</span>
                      )}
                    </td>
                    {/* Global GM% field */}
                    <td className="px-4 py-3 text-right">
                      {state.gmPercent === '' && !state.requiresQuote && (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={globalGM}
                            onChange={(e) => setGlobalGM(e.target.value)}
                            className="w-14 border border-border rounded-lg px-2 py-1 text-xs text-right focus:border-lantern outline-none"
                          />
                          <span className="text-xs text-steel">%</span>
                        </div>
                      )}
                    </td>
                    {/* Unsaved indicator — saving itself happens via the single
                        "Save Changes" button above the table, not per row. No
                        delete action here: disable via the Enabled toggle is
                        the only way to retire a service. */}
                    <td className="pr-4 text-center">
                      {isSaving ? (
                        <div className="w-4 h-4 border-2 border-lantern border-t-transparent rounded-full animate-spin inline-block" />
                      ) : isDirty ? (
                        <span className="w-2 h-2 rounded-full bg-lantern-deep inline-block" title="Unsaved changes" />
                      ) : null}
                    </td>
                  </tr>
                    );
                  })}
                  </Fragment>
                );
              })}

              {/* Add new row */}
              {addingRow && (
                <tr className="bg-mist-dim/30 border-t-2 border-lantern">
                  <td className="sticky left-0 z-[1] bg-mist-dim/30 px-3 py-3" />
                  <td className="sticky left-10 z-[1] bg-mist-dim/30 px-3 py-3" />
                  <td className="sticky left-[6.5rem] z-[1] bg-mist-dim/30 px-4 py-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
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
                      onChange={(e) => selectUnitLabel('new', e.target.value)}
                      className="w-full border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    >
                      {unitLabels.map((u) => (
                        <option key={u.id} value={u.code}>{u.label}</option>
                      ))}
                      <option value={ADD_NEW_UNIT_LABEL}>+ Add New Label…</option>
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
                        disabled={newRow.requiresQuote}
                        className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        min="0" step="0.01"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newRow.includeQty}
                      onChange={(e) => setNewRow((p) => ({ ...p, includeQty: e.target.value }))}
                      disabled={newRow.pricingMethod !== 'PER_UNIT'}
                      placeholder="1"
                      className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      min="0" step="0.01"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-steel text-xs">$</span>
                      <input
                        type="number"
                        value={
                          newRow.pricingMethod === 'PER_UNIT' && newRow.quantityLabel === 'HOUR'
                            ? computeHourlyBaseRate(newRow.basePrice, newRow.includeQty)
                            : newRow.baseRateUnit
                        }
                        onChange={(e) => setNewRow((p) => ({ ...p, baseRateUnit: e.target.value }))}
                        disabled={newRow.pricingMethod !== 'PER_UNIT' || newRow.quantityLabel === 'HOUR'}
                        title={newRow.quantityLabel === 'HOUR' ? 'Auto-calculated as Provider Price ÷ Includes Up To for Hour-labeled services' : undefined}
                        className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        min="0" step="0.01"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newRow.volumeDiscountThreshold}
                      onChange={(e) => setNewRow((p) => ({ ...p, volumeDiscountThreshold: e.target.value }))}
                      disabled={newRow.pricingMethod !== 'PER_UNIT'}
                      placeholder="None"
                      className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={newRow.pricingMethod !== 'PER_UNIT'}
                        className="w-20 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        min="0" step="0.01"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={newRow.gmPercent}
                        onChange={(e) => setNewRow((p) => ({ ...p, gmPercent: e.target.value }))}
                        placeholder={globalGM}
                        className="w-16 border border-lantern rounded-lg px-2 py-1.5 text-sm text-right focus:border-lantern outline-none placeholder-steel"
                        min="0" max="99.99" step="0.1"
                      />
                      <span className="text-steel text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newRow.formulaDescription}
                      onChange={(e) => setNewRow((p) => ({ ...p, formulaDescription: e.target.value }))}
                      placeholder="Optional notes…"
                      className="w-full min-w-[180px] border border-lantern rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                    />
                  </td>
                  <td colSpan={4} />
                  <td className="pr-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setAddingRow(false); setNewRow({ name: '', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false, basePrice: '0', gmPercent: '', quantityLabel: 'NONE', minimumQuantity: '', includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '', requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true, isQuotaInspection: false, formulaDescription: '' }); }}
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
            <strong>CSV format:</strong> name, description, pricingMethod (FLAT_PRICE/PER_UNIT/ONE_TIME_FEE/REQUEST_QUOTE), requiresQuote (true/false), basePrice, gmPercent, quantityLabel (a Unit Label code — see the Unit Label column's dropdown for current values), minimumQuantity, includeQty, baseRateUnit, volumeDiscountThreshold, volumeDiscountRate, isActive (true/false), customerRequestable (true/false), category (INTERIOR_REPAIRS_MAINTENANCE/MINOR_ELECTRICAL_ADJUSTMENTS/MINOR_PLUMBING_FIXES/MOUNTING_INSTALLATIONS/CARPENTRY_ASSEMBLY/EXTERIOR_OUTDOOR_SERVICES, or blank), Type of Service (one or more of INSPECT/REPAIR/IMPROVE/MAINTAIN/INSTALL, comma- or semicolon-separated in one cell e.g. &quot;INSPECT,REPAIR&quot; — a separate, multi-valued tag from category, or blank) — existing rows matched by name, new names are created. includeQty/baseRateUnit/volumeDiscountThreshold/volumeDiscountRate only apply to Per Unit services (blank = flat qty × basePrice, matching pre-tiered behavior). Required Capability isn&apos;t part of CSV — set it per-row in the table above.
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

      {/* "Manage Unit Labels" modal — opened from the column header's pencil
          icon (manageLabelsTarget null) or a row's "+ Add New Label…" option
          (target is that row's id / 'new', auto-selected on add). Every
          label gets its own pencil to rename inline; clearing the text and
          saving deletes it (blocked for Hour/None, the two codes
          service-price.entity.ts's lifecycle hooks depend on). */}
      {manageLabelsOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setManageLabelsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-lantern-deep">Manage Unit Labels</h2>
            <p className="text-sm text-steel">
              Rename a label to update it everywhere it&apos;s used, or clear its text and save to delete it.
            </p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {unitLabels.map((label) => (
                <div key={label.id} className="flex items-center gap-2">
                  {editingLabelId === label.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingLabelText}
                        onChange={(e) => setEditingLabelText(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
                      />
                      <button
                        onClick={() => saveEditLabel(label)}
                        className="text-xs font-semibold text-lantern-deep hover:underline px-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditLabel}
                        className="text-steel hover:text-ink px-1"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-ink">
                        {label.label}
                        {label.isSystem && <span className="text-xs text-steel ml-1">(required)</span>}
                      </span>
                      <button
                        onClick={() => startEditLabel(label)}
                        className="text-steel hover:text-lantern-deep px-1"
                        title="Rename or delete"
                      >
                        ✎
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {editingLabelError && (
              <p className="text-xs text-red-600">{editingLabelError}</p>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-mist-dim">
              <input
                value={newLabelText}
                onChange={(e) => setNewLabelText(e.target.value)}
                placeholder="e.g. Square Yards"
                className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm focus:border-lantern outline-none"
              />
              <button
                onClick={submitNewLabel}
                disabled={savingLabel || !newLabelText.trim()}
                className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
              >
                {savingLabel ? 'Adding…' : 'Add'}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setManageLabelsOpen(false)}
                className="text-steel hover:text-ink px-4 py-2 text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
