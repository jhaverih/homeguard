import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { LicenseReadingService } from './license-reading.service';

// These modules pull in ESM-only packages Jest can't load; the test mocks them anyway.
jest.mock('../../uploads/uploads.service', () => ({ UploadsService: class {} }));
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: class {},
  NotificationType: { VENDOR_LICENSE_NEEDS_REVIEW: 'VENDOR_LICENSE_NEEDS_REVIEW' },
}));

// The background read, with the database, file store and AI laptop mocked:
// what gets saved when the reader answers, fails, or reads an expired license.
function setup(readerResult: any, cert: any = {}) {
  const row: any = {
    id: 'c1', userId: 'u1', certificationType: CertificationType.HVAC, documentKey: 'vendor-licenses/x-license.pdf',
    status: CertificationReviewStatus.READING, licenseNumber: null, expirationDate: null, ...cert,
  };
  const certificationRepo: any = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (x) => x) };
  const usersRepo: any = { findOne: jest.fn().mockResolvedValue({ firstName: 'Maria', lastName: 'Lopez' }) };
  const profileRepo: any = { findOne: jest.fn().mockResolvedValue({ companyId: 'co1' }) };
  const company: any = { id: 'co1', name: 'Lopez Cooling LLC', coiDocumentKey: 'vendor-applications/coi.pdf', coiStatus: CertificationReviewStatus.READING, coiExpirationDate: null };
  const companyRepo: any = { findOne: jest.fn().mockResolvedValue(company), save: jest.fn(async (x) => x) };
  const registration: any = { id: 'r1', companyId: 'co1', state: 'TN', documentKey: 'vendor-applications/reg.pdf', status: CertificationReviewStatus.READING };
  const registrationRepo: any = { findOne: jest.fn().mockResolvedValue(registration), save: jest.fn(async (x) => x) };
  const uploads: any = { getObject: jest.fn().mockResolvedValue({ data: Buffer.from('%PDF'), contentType: 'application/pdf' }) };
  const notifications: any = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
  const reader: any = { read: jest.fn().mockResolvedValue(readerResult) };
  const service = new LicenseReadingService(certificationRepo, usersRepo, profileRepo, companyRepo, registrationRepo, uploads, notifications, reader);
  return { service, row, notifications, reader, company, registration };
}

const future = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const extraction = (x: any = {}) => ({
  ok: true,
  extraction: {
    licenseNumber: 'TACLA1', licenseType: 'HVAC Contractor', issuingState: 'TX', holderName: 'Maria Lopez',
    businessName: null, issueDate: '2025-01-01', expirationDate: future, confidence: 'high', method: 'pdf-text', ...x,
  },
});

describe('LicenseReadingService.read', () => {
  it('saves the read fields and marks a clean license pending verification', async () => {
    const t = setup(extraction());
    await t.service.read('c1');
    expect(t.row.status).toBe(CertificationReviewStatus.PENDING_REVIEW);
    expect(t.row.licenseNumber).toBe('TACLA1');
    expect(t.row.issuingState).toBe('TX');
    expect(t.row.expirationDate.toISOString().slice(0, 10)).toBe(future);
    expect(t.row.extractionConfidence).toBe('high');
    expect(t.notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it('rejects an expired license with a reason the vendor can read', async () => {
    const t = setup(extraction({ expirationDate: past }));
    await t.service.read('c1');
    expect(t.row.status).toBe(CertificationReviewStatus.REJECTED);
    expect(t.row.reviewNotes).toContain(past);
  });

  it('falls back to needs review and alerts admins when the reader is unavailable', async () => {
    const t = setup({ ok: false, reason: 'Automatic reading was unavailable.' });
    await t.service.read('c1');
    expect(t.row.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(t.row.reviewReasons[0]).toContain('unavailable');
    expect(t.notifications.notifyAdmins).toHaveBeenCalled();
  });

  it('does nothing for a license that is no longer being read', async () => {
    const t = setup(extraction(), { status: CertificationReviewStatus.APPROVED });
    await t.service.read('c1');
    expect(t.reader.read).not.toHaveBeenCalled();
  });
});

describe('LicenseReadingService registration and insurance', () => {
  it('reads a state registration for the state it was uploaded for', async () => {
    const t = setup({
      ok: true,
      extraction: { businessName: 'Lopez Cooling, LLC', entityNumber: '001', state: 'TN', status: 'active', formationDate: '2019-04-12', documentDate: null, confidence: 'high' },
    });
    await t.service.readRegistration('r1');
    expect(t.reader.read).toHaveBeenCalledWith(expect.anything(), 'TN', 'registration');
    expect(t.registration.status).toBe(CertificationReviewStatus.PENDING_REVIEW);
    expect(t.registration.entityNumber).toBe('001');
  });

  it('rejects a dissolved registration', async () => {
    const t = setup({
      ok: true,
      extraction: { businessName: 'Lopez Cooling, LLC', entityNumber: '001', state: 'TN', status: 'dissolved', formationDate: null, documentDate: null, confidence: 'high' },
    });
    await t.service.readRegistration('r1');
    expect(t.registration.status).toBe(CertificationReviewStatus.REJECTED);
    expect(t.registration.reviewNotes).toMatch(/dissolved/);
  });

  it('takes the insurance expiry from the certificate and flags a missing additional insured', async () => {
    const t = setup({
      ok: true,
      extraction: {
        insuredName: 'Lopez Cooling, LLC', insurerName: 'X', policyNumber: 'GL', effectiveDate: '2026-03-01', expirationDate: future,
        generalLiabilityPerOccurrence: 1000000, certificateHolder: 'Attenteve LLC', additionalInsured: false, additionalInsuredName: null, confidence: 'high',
      },
    });
    await t.service.readCoi('co1');
    expect(t.company.coiStatus).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(t.company.coiExpirationDate.toISOString().slice(0, 10)).toBe(future);
    expect(t.company.coiReviewReasons[0]).toMatch(/Attenteve LLC/);
    expect(t.notifications.notifyAdmins).toHaveBeenCalled();
  });
});
