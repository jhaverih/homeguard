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
  const companyRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 'co1', name: 'Lopez Cooling LLC' }) };
  const uploads: any = { getObject: jest.fn().mockResolvedValue({ data: Buffer.from('%PDF'), contentType: 'application/pdf' }) };
  const notifications: any = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
  const reader: any = { read: jest.fn().mockResolvedValue(readerResult) };
  const service = new LicenseReadingService(certificationRepo, usersRepo, profileRepo, companyRepo, uploads, notifications, reader);
  return { service, row, notifications, reader };
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
