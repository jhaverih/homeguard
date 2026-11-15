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
    stateRegistrations: [{ state: 'MD', status: CertificationReviewStatus.APPROVED, graceUntil: null }],
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
      { hasPhoto: false, selectedServices: [], vendorTosVersion: null, stateRegistrations: [] },
      { coiDocumentKey: null, coiExpirationDate: null, serviceCounties: null, backgroundCheckVersion: null },
    ));
    expect(c.items.filter((i) => !i.complete).map((i) => i.key)).toEqual(
      ['photo', 'services', 'licenses', 'counties', 'stateRegistration', 'insurance', 'backgroundCheck', 'terms'],
    );
    expect(c.canSubmit).toBe(false);
  });

  it('flags a missing address on company details (EIN is no longer asked for)', () => {
    const i = item(complete({}, { city: '' }), 'company');
    expect(i.complete).toBe(false);
    expect(i.missing).toBe('Add your business address.');
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

  it('is complete when only services that need no license are chosen', () => {
    expect(item(complete(), 'licenses').complete).toBe(true);
  });

  it('stays open until at least one service is chosen', () => {
    const i = item(complete({ selectedServices: [] }), 'licenses');
    expect(i.complete).toBe(false);
    expect(i.missing).toBe('Choose your services first.');
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

describe('state business registrations', () => {
  const reg = (state: string, status: CertificationReviewStatus, graceUntil: Date | null = null) => ({ state, status, graceUntil });
  // 24510 = Baltimore city, MD; 47187 = Williamson County, TN.
  const twoStates = { serviceCounties: ['24510', '47187'] };

  it('asks for the service area first when no counties are chosen', () => {
    const i = item(complete({ stateRegistrations: [] }, { serviceCounties: null }), 'stateRegistration');
    expect(i.complete).toBe(false);
    expect(i.missing).toBe('Choose your service area first.');
  });

  it('needs a registration for every state the company serves', () => {
    const i = item(complete({}, twoStates), 'stateRegistration');
    expect(i.complete).toBe(false);
    expect(i.missing).toBe('Add a state business registration for: TN.');
    expect(item(complete({ stateRegistrations: [reg('MD', CertificationReviewStatus.APPROVED), reg('TN', CertificationReviewStatus.READING)] }, twoStates), 'stateRegistration').complete).toBe(true);
  });

  it('counts registrations being read, needing review or passed; not rejected ones', () => {
    for (const status of [CertificationReviewStatus.READING, CertificationReviewStatus.NEEDS_REVIEW, CertificationReviewStatus.PENDING_REVIEW]) {
      expect(item(complete({ stateRegistrations: [reg('MD', status)] }), 'stateRegistration').complete).toBe(true);
    }
    for (const status of [CertificationReviewStatus.REJECTED, CertificationReviewStatus.EXPIRED]) {
      expect(item(complete({ stateRegistrations: [reg('MD', status)] }), 'stateRegistration').complete).toBe(false);
    }
  });

  it('stops counting a temporary pass once it runs out', () => {
    const ok = reg('MD', CertificationReviewStatus.APPROVED, new Date(NOW.getTime() + DAY));
    const over = reg('MD', CertificationReviewStatus.APPROVED, new Date(NOW.getTime() - DAY));
    expect(item(complete({ stateRegistrations: [ok] }), 'stateRegistration').complete).toBe(true);
    expect(item(complete({ stateRegistrations: [over] }), 'stateRegistration').complete).toBe(false);
  });
});

describe('certificate of insurance reading', () => {
  it('counts a certificate being read or waiting for a closer look, even before an expiry is known', () => {
    for (const coiStatus of [CertificationReviewStatus.READING, CertificationReviewStatus.NEEDS_REVIEW]) {
      expect(item(complete({}, { coiStatus, coiExpirationDate: null }), 'insurance').complete).toBe(true);
    }
  });

  it('does not count a certificate that was not accepted', () => {
    const i = item(complete({}, { coiStatus: CertificationReviewStatus.REJECTED }), 'insurance');
    expect(i.complete).toBe(false);
    expect(i.missing).toMatch(/not accepted/);
  });
});
