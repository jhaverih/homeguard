import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';

// Decides what happens to an uploaded license once the AI engine has read it.
// Pure functions only (no database, no network), so every rule is unit-tested
// in license-validation.spec.ts.
//
// The rules, in plain English:
//   - Already expired              → REJECTED (the vendor must upload a current one)
//   - Low confidence, a missing issue/expiry date, a name that doesn't match
//     the contractor or their company, or a different trade than they chose
//                                  → NEEDS_REVIEW (an admin takes a closer look)
//   - Everything checks out        → PENDING_REVIEW ("pending verification")

/** What the license reader returns (services/license-reader/extract.py). */
export type LicenseExtraction = {
  licenseNumber: string | null;
  licenseType: string | null;
  issuingState: string | null;
  holderName: string | null;
  businessName: string | null;
  issueDate: string | null;      // YYYY-MM-DD
  expirationDate: string | null; // YYYY-MM-DD
  confidence: 'high' | 'medium' | 'low';
};

export type LicenseDecision = {
  status: CertificationReviewStatus.REJECTED | CertificationReviewStatus.NEEDS_REVIEW | CertificationReviewStatus.PENDING_REVIEW;
  reasons: string[];
};

// Words that identify each trade in a license's printed type.
const TRADE_KEYWORDS: [CertificationType, RegExp][] = [
  [CertificationType.HVAC, /\b(hvac|air condition|heating|refrigeration|mechanical|acr)\b/i],
  [CertificationType.ELECTRICAL, /\belectric/i],
  [CertificationType.PLUMBING, /\bplumb/i],
  [CertificationType.ROOFING, /\broof/i],
  [CertificationType.GENERAL_CONTRACTOR, /\b(general contractor|general building|building contractor|residential contractor)\b/i],
  [CertificationType.NABCEP, /\b(nabcep|photovoltaic|solar)\b/i],
  [CertificationType.PEST_CONTROL, /\b(pest|termite|structural pest|fumigat)/i],
  [CertificationType.LANDSCAPING, /\b(landscap|irrigat|arborist|tree)/i],
  [CertificationType.PAINTING, /\bpaint/i],
  [CertificationType.POOL, /\b(pool|spa)\b/i],
];

/** Which trade a printed license type describes, or null if it can't tell. */
export function tradeFromText(text: string | null): CertificationType | null {
  if (!text) return null;
  const hits = TRADE_KEYWORDS.filter(([, re]) => re.test(text)).map(([t]) => t);
  return hits.length === 1 ? hits[0] : null; // ambiguous → don't guess
}

// Company suffixes and filler words ignored when comparing names.
const NAME_NOISE = new Set(['llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'lp', 'llp', 'pllc', 'pc', 'dba', 'the', 'and']);

/** Lower-case words of a name, without punctuation or company suffixes. */
export function nameWords(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_NOISE.has(w));
}

/** True when the license holder is this person: both first and last name appear (any order, middle names ok). */
export function personMatches(holderName: string | null, firstName: string, lastName: string): boolean {
  const words = new Set(nameWords(holderName));
  const first = nameWords(firstName);
  const last = nameWords(lastName);
  if (!words.size || !first.length || !last.length) return false;
  return [...first, ...last].every((w) => words.has(w));
}

/** True when the printed business name is the vendor's company (ignoring LLC/Inc, punctuation, word order). */
export function businessMatches(printed: string | null, companyName: string | null): boolean {
  const a = nameWords(printed);
  const b = nameWords(companyName);
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  // Every word of the shorter name appears in the longer one.
  const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  return [...small].every((w) => big.has(w));
}

/** Today's date as YYYY-MM-DD (UTC), for comparing with printed dates. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Applies the rules above to one extraction. */
export function evaluateLicense(input: {
  extraction: LicenseExtraction;
  chosenType: CertificationType;
  firstName: string;
  lastName: string;
  companyName: string | null;
  now: Date;
}): LicenseDecision {
  const { extraction: x, now } = input;

  // 1. Expired → rejected outright.
  if (x.expirationDate && x.expirationDate < isoDay(now)) {
    return { status: CertificationReviewStatus.REJECTED, reasons: [`This license expired on ${x.expirationDate}. Upload your current license.`] };
  }

  // 2. Anything doubtful → needs review.
  const reasons: string[] = [];
  if (x.confidence === 'low') reasons.push('The license was hard to read (low confidence).');
  if (!x.expirationDate) reasons.push('No expiration date was found on the license.');
  if (!x.issueDate) reasons.push('No issue date was found on the license.');
  if (!x.licenseNumber) reasons.push('No license number was found on the license.');

  const nameOk = personMatches(x.holderName, input.firstName, input.lastName)
    || businessMatches(x.businessName, input.companyName)
    || businessMatches(x.holderName, input.companyName);
  if (!x.holderName && !x.businessName) reasons.push('No holder or business name was found on the license.');
  else if (!nameOk) reasons.push(`The name on the license (${x.holderName ?? x.businessName}) doesn't match the contractor or company on file.`);

  const printedTrade = tradeFromText(x.licenseType);
  if (printedTrade && printedTrade !== input.chosenType) {
    reasons.push(`The license looks like a ${printedTrade.replace('_', ' ').toLowerCase()} license, not ${input.chosenType.replace('_', ' ').toLowerCase()}.`);
  }

  return reasons.length
    ? { status: CertificationReviewStatus.NEEDS_REVIEW, reasons }
    : { status: CertificationReviewStatus.PENDING_REVIEW, reasons: [] };
}
