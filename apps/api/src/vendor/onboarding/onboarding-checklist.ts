import { VendorApplicationStatus } from '../entities/vendor-company.entity';
import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { statesForCounties } from '../../common/utils/county.utils';

// The vendor onboarding checklist, computed from stored data only — the
// mobile pending screen, the vendor portal status page, the admin review
// queue and submit() all read this one function, so "what's missing" can
// never disagree between them.

export const CHECKLIST_KEYS = [
  'company', 'photo', 'services', 'licenses', 'counties',
  'stateRegistration', 'insurance', 'backgroundCheck', 'terms',
] as const;
export type ChecklistKey = typeof CHECKLIST_KEYS[number];

export const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  company: 'Company details',
  photo: 'Your profile photo',
  services: 'Services you offer',
  licenses: 'Licenses for trade services',
  counties: 'Service area',
  stateRegistration: 'State business registration',
  insurance: 'Certificate of insurance',
  backgroundCheck: 'Background check & drug test statement',
  terms: 'Vendor terms',
};

// Services and licenses are edited on the same screen, so reopening one
// reopens the other.
const LINKED: Partial<Record<ChecklistKey, ChecklistKey>> = { services: 'licenses', licenses: 'services' };

export const COI_EXPIRY_WARNING_DAYS = 30;

export interface ChecklistInput {
  status: VendorApplicationStatus;
  company: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    stateRegistrationDocKey: string | null;
    coiDocumentKey: string | null;
    coiExpirationDate: Date | null;
    // How the AI reading of the certificate went (null = uploaded before reading existed).
    coiStatus?: CertificationReviewStatus | null;
    serviceCounties: string[] | null;
    backgroundCheckVersion: string | null;
    needsInfoItems: { key: string; note: string; resolved: boolean }[] | null;
  };
  hasPhoto: boolean;
  vendorTosVersion: string | null;
  selectedServices: { id: string; name: string; requiredCertificationType: CertificationType }[];
  certifications: { certificationType: CertificationType; status: CertificationReviewStatus; expirationDate: Date | null }[];
  // The company's per-state business registrations.
  stateRegistrations: { state: string; status: CertificationReviewStatus; graceUntil: Date | null }[];
  currentTosVersion: string;
  currentBackgroundCheckVersion: string;
  now: Date;
}

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  complete: boolean;
  // What is still missing, in plain words — shown under the item.
  missing: string | null;
  // A reviewer's note when this item was sent back with NEEDS_INFO.
  reviewerNote: string | null;
  editable: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  completeCount: number;
  totalCount: number;
  canSubmit: boolean;
  coiExpiresSoon: boolean;
}

// Certification types each selected service needs that the vendor has not
// yet submitted (a pending or approved, unexpired license counts — review
// happens after submission, alongside the application).
export function missingLicenseTypes(input: Pick<ChecklistInput, 'selectedServices' | 'certifications' | 'now'>): CertificationType[] {
  const required = new Set(
    input.selectedServices
      .map((s) => s.requiredCertificationType)
      .filter((t) => t !== CertificationType.NONE),
  );
  const covered = new Set(
    input.certifications
      // Provided = being read by the AI or waiting for a closer look (an admin
      // finishes those during review), or any other non-rejected, non-expired
      // license with a future expiry date.
      .filter((c) => c.status === CertificationReviewStatus.READING
        || c.status === CertificationReviewStatus.NEEDS_REVIEW
        || (c.status !== CertificationReviewStatus.REJECTED && c.status !== CertificationReviewStatus.EXPIRED
          && !!c.expirationDate && new Date(c.expirationDate) > input.now))
      .map((c) => c.certificationType),
  );
  return [...required].filter((t) => !covered.has(t));
}

// A state registration counts as provided while it is being read, waiting
// for a closer look, passed the checks, or approved. Rejected or expired ones
// don't, and neither does a temporary "already serving here" pass that ran out.
export function registrationCounts(r: { status: CertificationReviewStatus; graceUntil: Date | null }, now: Date): boolean {
  if (r.graceUntil && new Date(r.graceUntil) <= now) return false;
  return r.status === CertificationReviewStatus.READING
    || r.status === CertificationReviewStatus.NEEDS_REVIEW
    || r.status === CertificationReviewStatus.PENDING_REVIEW
    || r.status === CertificationReviewStatus.APPROVED;
}

// States the company serves (from its counties) that have no registration yet.
export function missingRegistrationStates(input: Pick<ChecklistInput, 'stateRegistrations' | 'now'> & { company: Pick<ChecklistInput['company'], 'serviceCounties'> }): string[] {
  const covered = new Set(input.stateRegistrations.filter((r) => registrationCounts(r, input.now)).map((r) => r.state));
  return statesForCounties(input.company.serviceCounties).filter((s) => !covered.has(s));
}

export function isEditable(status: VendorApplicationStatus, needsInfoItems: { key: string }[] | null, key: ChecklistKey): boolean {
  if (status === VendorApplicationStatus.INCOMPLETE) return true;
  if (status !== VendorApplicationStatus.NEEDS_INFO) return false;
  const flagged = new Set((needsInfoItems ?? []).map((i) => i.key));
  return flagged.has(key) || (!!LINKED[key] && flagged.has(LINKED[key]!));
}

export function buildChecklist(input: ChecklistInput): Checklist {
  const { company, now } = input;
  const missing: Record<ChecklistKey, string | null> = {
    company: null, photo: null, services: null, licenses: null, counties: null,
    stateRegistration: null, insurance: null, backgroundCheck: null, terms: null,
  };

  const companyGaps: string[] = [];
  if (!company.name?.trim()) companyGaps.push('company name');
  if (!company.address?.trim() || !company.city?.trim() || !company.state?.trim() || !company.zipCode?.trim()) {
    companyGaps.push('business address');
  }
  if (companyGaps.length) missing.company = `Add your ${companyGaps.join(', ')}.`;

  if (!input.hasPhoto) missing.photo = 'Add a clear photo of your face. Customers see it before you arrive.';

  if (!input.selectedServices.length) missing.services = 'Choose at least one service.';

  // With no services chosen yet there is nothing to license, but showing the
  // step as done looks like something was already uploaded, so keep it open.
  const licenseGaps = missingLicenseTypes(input);
  if (!input.selectedServices.length) missing.licenses = 'Choose your services first.';
  else if (licenseGaps.length) missing.licenses = `Add a license for: ${licenseGaps.join(', ')}.`;

  if (!company.serviceCounties?.length) missing.counties = 'Choose at least one county you serve.';

  // A registration is needed for every state the company serves.
  const registrationGaps = missingRegistrationStates(input);
  if (!company.serviceCounties?.length) missing.stateRegistration = 'Choose your service area first.';
  else if (registrationGaps.length) missing.stateRegistration = `Add a state business registration for: ${registrationGaps.join(', ')}.`;

  // Insurance: being read or waiting for a closer look counts as provided (an
  // admin finishes those); not accepted or expired doesn't; otherwise the
  // certificate needs a future expiry date.
  const coiInProgress = company.coiStatus === CertificationReviewStatus.READING || company.coiStatus === CertificationReviewStatus.NEEDS_REVIEW;
  const coiValid = !!company.coiDocumentKey && !!company.coiExpirationDate && new Date(company.coiExpirationDate) > now
    && company.coiStatus !== CertificationReviewStatus.REJECTED && company.coiStatus !== CertificationReviewStatus.EXPIRED;
  if (!company.coiDocumentKey) missing.insurance = 'Upload your certificate of insurance.';
  else if (company.coiStatus === CertificationReviewStatus.REJECTED) missing.insurance = 'Your certificate of insurance was not accepted. Upload a current one.';
  else if (!coiInProgress && !coiValid) missing.insurance = 'Your certificate of insurance has expired. Upload a current one.';

  if (company.backgroundCheckVersion !== input.currentBackgroundCheckVersion) {
    missing.backgroundCheck = 'Read and sign the background check and drug test statement.';
  }

  if (input.vendorTosVersion !== input.currentTosVersion) missing.terms = 'Accept the vendor terms.';

  const flagged = new Map((company.needsInfoItems ?? []).map((i) => [i.key, i]));
  const items: ChecklistItem[] = CHECKLIST_KEYS.map((key) => {
    const flag = flagged.get(key);
    const unresolved = !!flag && !flag.resolved;
    return {
      key,
      label: CHECKLIST_LABELS[key],
      complete: !missing[key] && !unresolved,
      missing: missing[key] ?? (unresolved ? 'Update this item to answer the reviewer\'s note.' : null),
      reviewerNote: flag?.note ?? null,
      editable: isEditable(input.status, company.needsInfoItems, key),
    };
  });

  const completeCount = items.filter((i) => i.complete).length;
  const coiExpiresSoon = coiValid
    && new Date(company.coiExpirationDate!).getTime() - now.getTime() < COI_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

  return {
    items,
    completeCount,
    totalCount: items.length,
    canSubmit: completeCount === items.length
      && (input.status === VendorApplicationStatus.INCOMPLETE || input.status === VendorApplicationStatus.NEEDS_INFO),
    coiExpiresSoon,
  };
}

// The entry for `key` in a NEEDS_INFO list, marked resolved — called whenever
// the vendor changes that item (and its linked item).
export function resolveNeedsInfo(
  items: { key: string; note: string; resolved: boolean }[] | null,
  key: ChecklistKey,
): { key: string; note: string; resolved: boolean }[] | null {
  if (!items) return items;
  const touched = new Set<string>([key, ...(LINKED[key] ? [LINKED[key]!] : [])]);
  return items.map((i) => (touched.has(i.key) ? { ...i, resolved: true } : i));
}
