import { ConfidenceLabel, ConfidenceResult } from './confidence';

// LLM explanation support (spec §6): the evidence package sent to the model,
// the JSON schema it must follow, the validator every response passes
// before it is stored or shown, and the deterministic fallback used when
// the model is unavailable or its answer is rejected. Pure.

export const PROMPT_VERSION = 'hvac-explain-1.0.0';

export interface EvidenceItem {
  ref: string;                 // e.g. "finding:<id>", "anomaly:<id>", "reading:<sensor>@<iso>"
  kind: 'rule_finding' | 'anomaly' | 'reading' | 'context' | 'health';
  description: string;
  values?: Record<string, number | string | null>;
  unit?: string;
  observedAt?: string;
}

export interface EvidencePackage {
  event: { id: string; component: string; components: string[]; category: string; startedAt: string; lastOccurrenceAt: string; status: string; severity: string };
  items: EvidenceItem[];
  dataAvailability: { input: string; state: string }[];
  operatingContext: Record<string, string | number | null>;
  confidence: ConfidenceResult;
  allowedActions: { code: string; title: string }[];
}

export interface Explanation {
  summary: string;
  observations: string[];
  possible_causes: { cause: string; supporting_evidence: string[]; contradicting_evidence: string[] }[];
  confidence_label: ConfidenceLabel;
  confidence_rationale: string;
  recommended_actions: string[];
  customer_message: string;
  technician_message: string;
  additional_data_needed: string[];
  safety_note: string | null;
  evidence_references: string[];
}

// JSON schema handed to Ollama's `format` — the model is constrained to this
// shape; validateExplanation still checks everything independently.
export const EXPLANATION_JSON_SCHEMA = {
  type: 'object',
  required: ['summary', 'observations', 'possible_causes', 'confidence_label', 'confidence_rationale', 'recommended_actions',
    'customer_message', 'technician_message', 'additional_data_needed', 'safety_note', 'evidence_references'],
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    possible_causes: {
      type: 'array',
      items: {
        type: 'object', required: ['cause', 'supporting_evidence', 'contradicting_evidence'],
        properties: { cause: { type: 'string' }, supporting_evidence: { type: 'array', items: { type: 'string' } }, contradicting_evidence: { type: 'array', items: { type: 'string' } } },
      },
    },
    confidence_label: { type: 'string', enum: ['high', 'medium', 'low', 'insufficient_evidence'] },
    confidence_rationale: { type: 'string' },
    recommended_actions: { type: 'array', items: { type: 'string' } },
    customer_message: { type: 'string' },
    technician_message: { type: 'string' },
    additional_data_needed: { type: 'array', items: { type: 'string' } },
    safety_note: { type: ['string', 'null'] },
    evidence_references: { type: 'array', items: { type: 'string' } },
  },
};

export function systemPrompt(): string {
  return [
    'You explain HVAC monitoring findings for Attenteve, a home-maintenance service. You receive a JSON evidence package.',
    'Rules you must follow:',
    '- Use ONLY facts in the evidence package. Never invent readings, timestamps, thresholds, equipment states or service history.',
    '- Every number you write must appear in the evidence package.',
    '- Possible causes are hypotheses: phrase them as "may", "could", "possible". Never state a confirmed diagnosis.',
    '- Never say a component has failed because a temperature is abnormal. Never recommend adding refrigerant. Never claim energy savings.',
    '- Never suggest changing thermostat settings automatically, bypassing safety devices, opening refrigerant circuits or doing electrical work.',
    '- confidence_label MUST equal evidence.confidence.confidence exactly; explain it in confidence_rationale using evidence.confidence.rationale.',
    '- recommended_actions must be chosen from evidence.allowedActions titles.',
    '- evidence_references must list the "ref" values of the evidence items you relied on, and nothing else.',
    '- If evidence is insufficient, say the cause cannot yet be determined and list what to measure next in additional_data_needed.',
    '- customer_message: plain language for a homeowner, 2-4 sentences, no jargon, no diagnosis. technician_message: technical, may cite scores and baselines.',
    'Respond with JSON only.',
  ].join('\n');
}

export interface ValidationResult { ok: boolean; reasons: string[]; explanation?: Explanation }

const MAX = { summary: 400, item: 400, message: 1200 };
// Wording that would present a hypothesis as fact or give unsafe/unsupported advice.
const BANNED: { re: RegExp; reason: string }[] = [
  { re: /\b(add|top[- ]?off|recharge)\w*\s+(the\s+)?(refrigerant|freon)/i, reason: 'recommends adding refrigerant' },
  { re: /\b(compressor|blower|fan motor|capacitor|component|unit|coil|valve)\s+(has\s+|is\s+)?(failed|failing|broken|dead)\b/i, reason: 'asserts a failed component' },
  // Assertions only — "cannot be confirmed" is a correct, cautious statement.
  { re: /\b(confirmed\s+(diagnosis|cause|failure|fault|leak|low|high|that)|(is|are|was|were)\s+(definitely|certainly|confirmed)|diagnosed\s+(as|with))\b/i, reason: 'presents a cause as confirmed' },
  { re: /\bsav(e|ed|ing|ings)\b.{0,40}(\$|percent|%|kwh|energy)/i, reason: 'claims energy savings' },
  { re: /\b\d{1,3}\s?% (chance|probability|likely|confidence)\b/i, reason: 'states an uncalibrated probability' },
];

const isStr = (v: any, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isStrArray = (v: any, max = MAX.item) => Array.isArray(v) && v.every((x) => isStr(x, max));

// Numbers present anywhere in the evidence (rounded both ways) — anything
// the model writes that isn't among them was invented.
function evidenceNumbers(pkg: EvidencePackage): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => { out.add(String(n)); out.add(String(Math.round(n))); out.add(String(Math.round(n * 10) / 10)); out.add(String(Math.abs(Math.round(n * 10) / 10))); };
  JSON.stringify(pkg).replace(/-?\d+(\.\d+)?/g, (m) => { add(Number(m)); return m; });
  return out;
}

export function validateExplanation(raw: any, pkg: EvidencePackage): ValidationResult {
  const reasons: string[] = [];
  if (raw == null || typeof raw !== 'object') return { ok: false, reasons: ['not a JSON object'] };
  if (!isStr(raw.summary, MAX.summary)) reasons.push('summary missing or too long');
  if (!isStrArray(raw.observations) || raw.observations.length === 0) reasons.push('observations missing');
  if (!Array.isArray(raw.possible_causes) || raw.possible_causes.some((c: any) => !isStr(c?.cause, MAX.item) || !isStrArray(c?.supporting_evidence) || !isStrArray(c?.contradicting_evidence))) {
    reasons.push('possible_causes malformed');
  }
  if (raw.confidence_label !== pkg.confidence.confidence) reasons.push(`confidence_label must be "${pkg.confidence.confidence}" (computed), got "${raw.confidence_label}"`);
  if (!isStr(raw.confidence_rationale, MAX.message)) reasons.push('confidence_rationale missing');
  const allowedTitles = new Set(pkg.allowedActions.map((a) => a.title.toLowerCase()));
  if (!isStrArray(raw.recommended_actions)) reasons.push('recommended_actions malformed');
  else if (raw.recommended_actions.some((a: string) => !allowedTitles.has(a.toLowerCase()))) reasons.push('recommended_actions outside the allowed catalog');
  if (!isStr(raw.customer_message, MAX.message)) reasons.push('customer_message missing');
  if (!isStr(raw.technician_message, MAX.message)) reasons.push('technician_message missing');
  if (!isStrArray(raw.additional_data_needed)) reasons.push('additional_data_needed malformed');
  if (!(raw.safety_note === null || isStr(raw.safety_note, MAX.item))) reasons.push('safety_note malformed');
  const refs = new Set(pkg.items.map((i) => i.ref));
  if (!isStrArray(raw.evidence_references) || raw.evidence_references.length === 0) reasons.push('evidence_references missing');
  else {
    const unknown = raw.evidence_references.filter((r: string) => !refs.has(r));
    if (unknown.length) reasons.push(`evidence_references not in the supplied evidence: ${unknown.slice(0, 3).join(', ')}`);
  }
  if (reasons.length) return { ok: false, reasons };

  const text = [raw.summary, ...raw.observations, ...raw.possible_causes.flatMap((c: any) => [c.cause, ...c.supporting_evidence, ...c.contradicting_evidence]),
    raw.customer_message, raw.technician_message, raw.safety_note ?? ''].join('\n');
  for (const b of BANNED) if (b.re.test(text)) reasons.push(`unsupported statement: ${b.reason}`);
  // Observations must be facts from the evidence: every number in them must exist there.
  const known = evidenceNumbers(pkg);
  for (const obs of raw.observations as string[]) {
    const nums = obs.match(/-?\d+(\.\d+)?/g) ?? [];
    const invented = nums.filter((n) => !known.has(String(Number(n))) && !known.has(String(Math.abs(Number(n)))));
    if (invented.length) reasons.push(`observation contains values not in the evidence (${invented.slice(0, 3).join(', ')}): "${obs.slice(0, 80)}"`);
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, reasons: [], explanation: raw as Explanation };
}

// Deterministic explanation — always available, used when the LLM is off,
// unreachable, slow, or its answer fails validation.
export function fallbackExplanation(pkg: EvidencePackage): Explanation {
  const observations = pkg.items.filter((i) => i.kind === 'rule_finding' || i.kind === 'anomaly').map((i) => i.description).slice(0, 6);
  const missing = pkg.dataAvailability.filter((d) => d.state !== 'OK').map((d) => `${d.input} (${d.state.toLowerCase().replace('_', ' ')})`);
  return {
    summary: `${pkg.event.components.join(' / ')}: ${observations.length} related observation(s) since ${new Date(pkg.event.startedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC.`,
    observations: observations.length ? observations : ['No rule findings or confirmed anomalies are attached to this event.'],
    possible_causes: [],
    confidence_label: pkg.confidence.confidence,
    confidence_rationale: pkg.confidence.rationale.join('. '),
    recommended_actions: pkg.allowedActions.map((a) => a.title).slice(0, 3),
    customer_message: pkg.event.severity === 'INFO'
      ? 'Our monitoring noticed readings that differ from your system\'s usual pattern. Nothing requires action right now; we\'re keeping an eye on it.'
      : 'Our monitoring found a condition worth checking. See the recommended steps below; an HVAC professional can take a closer look if it continues.',
    technician_message: pkg.items.filter((i) => i.kind === 'anomaly' || i.kind === 'rule_finding').map((i) => `${i.ref}: ${i.description}`).join('\n') || 'No contributing findings.',
    additional_data_needed: missing,
    safety_note: null,
    evidence_references: pkg.items.filter((i) => i.kind === 'rule_finding' || i.kind === 'anomaly').map((i) => i.ref),
  };
}
