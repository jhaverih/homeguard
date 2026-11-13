import { VendorApplicationStatus } from '../entities/vendor-company.entity';
import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';

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

export const EIN_PATTERN = /^\d{2}-\d{7}$/;
export const COI_EXPIRY_WARNING_DAYS = 30;

export interface ChecklistInput {
  status: VendorApplicationStatus;
  company: {
    name: string | null;
    ein: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    stateRegistrationDocKey: string | null;
    coiDocumentKey: string | null;
    coiExpirationDate: Date | null;
    serviceCounties: string[] | null;
    backgroundCheckVersion: string | null;
    needsInfoItems: { key: string; note: string; resolved: boolean }[] | null;
  };
  hasPhoto: boolean;
  vendorTosVersion: string | null;
  selectedServices: { id: string; name: string; requiredCertificationType: CertificationType }[];
  certifications: { certificationType: CertificationType; status: CertificationReviewStatus; expirationDate: Date | null }[];
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
  if (!company.ein || !EIN_PATTERN.test(company.ein)) companyGaps.push('EIN');
  if (!company.address?.trim() || !company.city?.trim() || !company.state?.trim() || !company.zipCode?.trim()) {
    companyGaps.push('business address');
  }
  if (companyGaps.length) missing.company = `Add your ${companyGaps.join(', ')}.`;

  if (!input.hasPhoto) missing.photo = 'Add a clear photo of your face. Customers see it before you arrive.';

  if (!input.selectedServices.length) missing.services = 'Choose at least one service.';

  const licenseGaps = missingLicenseTypes(input);
  if (licenseGaps.length) missing.licenses = `Add a license for: ${licenseGaps.join(', ')}.`;

  if (!company.serviceCounties?.length) missing.counties = 'Choose at least one county you serve.';

  if (!company.stateRegistrationDocKey) missing.stateRegistration = 'Upload your state business registration.';

  const coiValid = !!company.coiDocumentKey && !!company.coiExpirationDate && new Date(company.coiExpirationDate) > now;
  if (!company.coiDocumentKey) missing.insurance = 'Upload your certificate of insurance.';
  else if (!coiValid) missing.insurance = 'Your certificate of insurance has expired. Upload a current one.';

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
