import { DocumentBackfillService, REGISTRATION_GRACE_DAYS } from './document-backfill.service';
import { VendorApplicationStatus } from '../entities/vendor-company.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';

// Carrying existing vendors over to per-state registrations and read insurance.
const NOW = new Date('2026-11-14T12:00:00Z');

function setup(companies: any[], existingRegistrations = 0) {
  const saved: any[] = [];
  const companyRepo: any = { find: jest.fn().mockResolvedValue(companies), update: jest.fn().mockResolvedValue({}) };
  const registrationRepo: any = {
    count: jest.fn().mockResolvedValue(existingRegistrations),
    create: (x: any) => x,
    save: jest.fn(async (rows: any[]) => { saved.push(...rows); return rows; }),
  };
  return { service: new DocumentBackfillService(companyRepo, registrationRepo), saved, companyRepo };
}

describe('DocumentBackfillService', () => {
  it('moves an approved company\'s registration to its home state and gives other served states a 60-day pass', async () => {
    // 47187 = Williamson County TN, 21111 = Jefferson County KY.
    const t = setup([{
      id: 'co1', state: 'TN', applicationStatus: VendorApplicationStatus.APPROVED,
      stateRegistrationDocKey: 'vendor-applications/reg.pdf', serviceCounties: ['47187', '21111'],
    }]);
    await t.service.backfill(NOW);
    expect(t.saved).toHaveLength(2);
    const tn = t.saved.find((r) => r.state === 'TN');
    const ky = t.saved.find((r) => r.state === 'KY');
    expect(tn).toMatchObject({ documentKey: 'vendor-applications/reg.pdf', status: CertificationReviewStatus.APPROVED });
    expect(ky).toMatchObject({ documentKey: null, status: CertificationReviewStatus.APPROVED });
    expect(ky.graceUntil.getTime() - NOW.getTime()).toBe(REGISTRATION_GRACE_DAYS * 864e5);
  });

  it('gives a company still applying no pass; its document waits for review', async () => {
    const t = setup([{
      id: 'co2', state: 'TN', applicationStatus: VendorApplicationStatus.INCOMPLETE,
      stateRegistrationDocKey: 'vendor-applications/reg.pdf', serviceCounties: ['47187', '21111'],
    }]);
    await t.service.backfill(NOW);
    expect(t.saved).toEqual([expect.objectContaining({ state: 'TN', status: CertificationReviewStatus.PENDING_REVIEW })]);
  });

  it('runs the registration step only once', async () => {
    const t = setup([{ id: 'co1', state: 'TN', applicationStatus: VendorApplicationStatus.APPROVED, serviceCounties: ['47187'] }], 3);
    await t.service.backfill(NOW);
    expect(t.saved).toHaveLength(0);
  });

  it('gives an existing certificate of insurance a status', async () => {
    const t = setup([
      { id: 'a', applicationStatus: VendorApplicationStatus.APPROVED, coiDocumentKey: 'k', coiStatus: null },
      { id: 'b', applicationStatus: VendorApplicationStatus.INCOMPLETE, coiDocumentKey: 'k', coiStatus: null },
      { id: 'c', applicationStatus: VendorApplicationStatus.APPROVED, coiDocumentKey: 'k', coiStatus: CertificationReviewStatus.NEEDS_REVIEW },
    ], 1);
    await t.service.backfill(NOW);
    expect(t.companyRepo.update).toHaveBeenCalledWith('a', { coiStatus: CertificationReviewStatus.APPROVED });
    expect(t.companyRepo.update).toHaveBeenCalledWith('b', { coiStatus: CertificationReviewStatus.PENDING_REVIEW });
    expect(t.companyRepo.update).toHaveBeenCalledTimes(2);
  });
});
