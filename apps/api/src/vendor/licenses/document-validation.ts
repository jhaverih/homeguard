import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { businessMatches, isoDay, LicenseDecision } from './license-validation';

// Decides what happens to a state business registration or a certificate of
// insurance (COI) once the AI laptop has read it. Pure functions only, so every
// rule is unit-tested in document-validation.spec.ts.

/** The party every COI must name as additional insured. */
export const ADDITIONAL_INSURED_NAME = 'Attenteve LLC';
/** Minimum general liability limit per occurrence, in dollars. */
export const MIN_GENERAL_LIABILITY = 1_000_000;

/** What the reader returns for a state registration (extract.py, kind=registration). */
export type RegistrationExtraction = {
  businessName: string | null;
  entityNumber: string | null;
  state: string | null;
  status: 'active' | 'inactive' | 'dissolved' | 'revoked' | null;
  formationDate: string | null;
  documentDate: string | null;
  confidence: 'high' | 'medium' | 'low';
};

/** What the reader returns for a certificate of insurance (extract.py, kind=coi). */
export type CoiExtraction = {
  insuredName: string | null;
  insurerName: string | null;
  policyNumber: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  generalLiabilityPerOccurrence: number | null;
  certificateHolder: string | null;
  additionalInsured: boolean | null;
  additionalInsuredName: string | null;
  confidence: 'high' | 'medium' | 'low';
};

const needsReview = (reasons: string[]): LicenseDecision => (reasons.length
  ? { status: CertificationReviewStatus.NEEDS_REVIEW, reasons }
  : { status: CertificationReviewStatus.PENDING_REVIEW, reasons: [] });

/**
 * State registration rules:
 *   - Status inactive / dissolved / revoked  → REJECTED
 *   - Low confidence, no status shown, a different state than the one it was
 *     uploaded for, or a business name that isn't the company → NEEDS_REVIEW
 *   - Otherwise                               → PENDING_REVIEW
 */
export function evaluateRegistration(input: {
  extraction: RegistrationExtraction;
  expectedState: string;
  companyName: string | null;
}): LicenseDecision {
  const { extraction: x, expectedState } = input;

  if (x.status && x.status !== 'active') {
    return {
      status: CertificationReviewStatus.REJECTED,
      reasons: [`The registration shows the business as ${x.status} in ${x.state ?? expectedState}. Upload a registration showing it is active.`],
    };
  }

  const reasons: string[] = [];
  if (x.confidence === 'low') reasons.push('The registration was hard to read (low confidence).');
  if (!x.status) reasons.push('No active / good-standing status was found on the registration.');
  if (!x.state) reasons.push('No state was found on the registration.');
  else if (x.state !== expectedState) reasons.push(`This looks like a ${x.state} registration, but it was uploaded for ${expectedState}.`);
  if (!x.businessName) reasons.push('No business name was found on the registration.');
  else if (!businessMatches(x.businessName, input.companyName)) {
    reasons.push(`The business name on the registration (${x.businessName}) doesn't match the company on file.`);
  }
  return needsReview(reasons);
}

/** True when a printed name refers to Attenteve LLC (any capitalization / punctuation). */
export function namesAttenteve(text: string | null): boolean {
  return !!text && /attenteve/i.test(text);
}

/**
 * Certificate of insurance rules:
 *   - General liability already expired       → REJECTED
 *   - Attenteve LLC not shown as additional insured, general liability under
 *     $1M per occurrence (or not shown), insured name not the company, a
 *     missing date, or low confidence         → NEEDS_REVIEW
 *   - Otherwise                               → PENDING_REVIEW
 */
export function evaluateCoi(input: {
  extraction: CoiExtraction;
  companyName: string | null;
  now: Date;
}): LicenseDecision {
  const { extraction: x, now } = input;

  if (x.expirationDate && x.expirationDate < isoDay(now)) {
    return {
      status: CertificationReviewStatus.REJECTED,
      reasons: [`This insurance expired on ${x.expirationDate}. Upload your current certificate of insurance.`],
    };
  }

  const reasons: string[] = [];
  if (x.confidence === 'low') reasons.push('The certificate was hard to read (low confidence).');
  if (!x.expirationDate) reasons.push('No policy expiration date was found on the certificate.');
  if (!x.effectiveDate) reasons.push('No policy effective date was found on the certificate.');

  // Additional insured: the box must be marked, and the named party must be
  // Attenteve (often written as "the certificate holder", so check that too).
  const aiNamed = namesAttenteve(x.additionalInsuredName)
    || (!x.additionalInsuredName && namesAttenteve(x.certificateHolder));
  if (x.additionalInsured !== true || !aiNamed) {
    reasons.push(`${ADDITIONAL_INSURED_NAME} is not listed as additional insured. Ask your insurance agent to add ${ADDITIONAL_INSURED_NAME} as additional insured and upload the new certificate.`);
  }

  if (x.generalLiabilityPerOccurrence == null) {
    reasons.push('No general liability "each occurrence" limit was found on the certificate.');
  } else if (x.generalLiabilityPerOccurrence < MIN_GENERAL_LIABILITY) {
    reasons.push(`General liability is $${x.generalLiabilityPerOccurrence.toLocaleString('en-US')} per occurrence; at least $${MIN_GENERAL_LIABILITY.toLocaleString('en-US')} is required.`);
  }

  if (!x.insuredName) reasons.push('No insured name was found on the certificate.');
  else if (!businessMatches(x.insuredName, input.companyName)) {
    reasons.push(`The insured on the certificate (${x.insuredName}) doesn't match the company on file.`);
  }
  return needsReview(reasons);
}
