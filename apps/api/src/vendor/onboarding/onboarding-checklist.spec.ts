import { buildChecklist, ChecklistInput, isEditable, missingLicenseTypes, resolveNeedsInfo } from './onboarding-checklist';
import { VendorApplicationStatus } from '../entities/vendor-company.entity';
import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';

const NOW = new Date('2026-11-09T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function complete(overrides: Partial<ChecklistInput> = {}, company: Partial<ChecklistInput['company']> = {}): ChecklistInput {
  return {
    status: VendorApplicationStatus.INCOMPLETE,
    company: {
      name: 'Hill Home Repair',
      ein: '12-3456789',
      address: '100 Holliday St',
      city: 'Baltimore',
      state: 'MD',
      zipCode: '21202',
      stateRegistrationDocKey: 'reg.pdf',
      coiDocumentKey: 'coi.pdf',
      coiExpirationDate: new Date(NOW.getTime() + 200 * DAY),
      serviceCounties: ['24510'],
      backgroundCheckVersion: 'bg-1',
      needsInfoItems: null,
      ...company,
    },
    hasPhoto: true,
    vendorTosVersion: 'tos-1',
    selectedServices: [{ id: 'c1', name: 'Drywall work', requiredCertificationType: CertificationType.NONE }],
    certifications: [],
    currentTosVersion: 'tos-1',
    currentBackgroundCheckVersion: 'bg-1',
    now: NOW,
    ...overrides,
  };
}

const item = (input: ChecklistInput, key: string) => buildChecklist(input).items.find((i) => i.key === key)!;

describe('buildChecklist', () => {
  it('a fully filled-in application can be submitted', () => {
    const c = buildChecklist(complete());
    expect(c.items.every((i) => i.complete)).toBe(true);
    expect(c.completeCount).toBe(c.totalCount);
    expect(c.canSubmit).toBe(true);
  });

  it('lists exactly what is missing for a brand-new registration', () => {
    const c = buildChecklist(complete(
      { hasPhoto: false, selectedServices: [], vendorTosVersion: null },
      { stateRegistrationDocKey: null, coiDocumentKey: null, coiExpirationDate: null, serviceCounties: null, backgroundCheckVersion: null },
    ));
    expect(c.items.filter((i) => !i.complete).map((i) => i.key)).toEqual(
      ['photo', 'services', 'counties', 'stateRegistration', 'insurance', 'backgroundCheck', 'terms'],
    );
    expect(c.canSubmit).toBe(false);
  });

  it('flags a malformed EIN and a missing address on company details', () => {
    const i = item(complete({}, { ein: '123456789', city: '' }), 'company');
    expect(i.complete).toBe(false);
    expect(i.missing).toBe('Add your EIN, business address.');
  });

  it('treats an expired certificate of insurance as missing', () => {
    const i = item(complete({}, { coiExpirationDate: new Date(NOW.getTime() - DAY) }), 'insurance');
    expect(i.complete).toBe(false);
    expect(i.missing).toMatch(/expired/);
  });

  it('warns when insurance expires within 30 days but still counts it', () => {
    const c = buildChecklist(complete({}, { coiExpirationDate: new Date(NOW.getTime() + 10 * DAY) }));
    expect(c.items.find((i) => i.key === 'insurance')!.complete).toBe(true);
    expect(c.coiExpiresSoon).toBe(true);
  });

  it('requires a re-signature when the background check statement version changes', () => {
    expect(item(complete({ currentBackgroundCheckVersion: 'bg-2' }), 'backgroundCheck').complete).toBe(false);
  });

  it('cannot submit while under review even if complete', () => {
    expect(buildChecklist(complete({ status: VendorApplicationStatus.PENDING_REVIEW })).canSubmit).toBe(false);
  });
});

describe('licenses for trade services', () => {
  const hvac = { id: 'h', name: 'HVAC Contractor', requiredCertificationType: CertificationType.HVAC };

  it('requires a license for each trade service chosen', () => {
    const input = complete({ selectedServices: [hvac] });
    expect(missingLicenseTypes(input)).toEqual([CertificationType.HVAC]);
    expect(item(input, 'licenses').complete).toBe(false);
  });

  it('accepts a pending, unexpired license (review happens with the application)', () => {
    const input = complete({
      selectedServices: [hvac],
      certifications: [{ certificationType: CertificationType.HVAC, status: CertificationReviewStatus.PENDING_REVIEW, expirationDate: new Date(NOW.getTime() + DAY) }],
    });
    expect(item(input, 'licenses').complete).toBe(true);
  });

  it('counts a license still being read, or waiting for a closer look', () => {
    for (const status of [CertificationReviewStatus.READING, CertificationReviewStatus.NEEDS_REVIEW]) {
      const input = complete({
        selectedServices: [hvac],
        certifications: [{ certificationType: CertificationType.HVAC, status, expirationDate: null }],
      });
      expect(item(input, 'licenses').complete).toBe(true);
    }
  });

  it('does not count a license marked expired by the daily job', () => {
    const input = complete({
      selectedServices: [hvac],
      certifications: [{ certificationType: CertificationType.HVAC, status: CertificationReviewStatus.EXPIRED, expirationDate: new Date(NOW.getTime() - DAY) }],
    });
    expect(item(input, 'licenses').complete).toBe(false);
  });

  it('does not count rejected or expired licenses', () => {
    const input = complete({
      selectedServices: [hvac],
      certifications: [
        { certificationType: CertificationType.HVAC, status: CertificationReviewStatus.REJECTED, expirationDate: new Date(NOW.getTime() + DAY) },
        { certificationType: CertificationType.HVAC, status: CertificationReviewStatus.APPROVED, expirationDate: new Date(NOW.getTime() - DAY) },
      ],
    });
    expect(item(input, 'licenses').complete).toBe(false);
  });

  it('is complete when no trade service is chosen', () => {
    expect(item(complete(), 'licenses').complete).toBe(true);
  });
});

describe('needs info', () => {
  const flagged = [{ key: 'insurance', note: 'COI is for a different company', resolved: false }];

  it('keeps a flagged item open, with the reviewer note, until the vendor changes it', () => {
    const input = complete({ status: VendorApplicationStatus.NEEDS_INFO }, { needsInfoItems: flagged });
    const i = item(input, 'insurance');
    expect(i.complete).toBe(false);
    expect(i.reviewerNote).toBe('COI is for a different company');
    expect(buildChecklist(input).canSubmit).toBe(false);

    const fixed = complete({ status: VendorApplicationStatus.NEEDS_INFO }, { needsInfoItems: resolveNeedsInfo(flagged, 'insurance') });
    expect(item(fixed, 'insurance').complete).toBe(true);
    expect(buildChecklist(fixed).canSubmit).toBe(true);
  });

  it('reopens only flagged items (services and licenses together)', () => {
    const items = [{ key: 'licenses', note: 'License photo unreadable', resolved: false }];
    expect(isEditable(VendorApplicationStatus.NEEDS_INFO, items, 'licenses')).toBe(true);
    expect(isEditable(VendorApplicationStatus.NEEDS_INFO, items, 'services')).toBe(true);
    expect(isEditable(VendorApplicationStatus.NEEDS_INFO, items, 'company')).toBe(false);
  });

  it('locks everything under review and after a decision', () => {
    for (const status of [VendorApplicationStatus.PENDING_REVIEW, VendorApplicationStatus.APPROVED, VendorApplicationStatus.REJECTED]) {
      expect(isEditable(status, null, 'company')).toBe(false);
    }
    expect(isEditable(VendorApplicationStatus.INCOMPLETE, null, 'company')).toBe(true);
  });
});
