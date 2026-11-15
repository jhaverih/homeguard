import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../entities/vendor-company.entity';
import { VendorCertification, CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { VendorProfile } from '../../users/entities/vendor-profile.entity';
import { VendorStateRegistration } from '../entities/vendor-state-registration.entity';
import { NotificationsService, NotificationType } from '../../notifications/notifications.service';
import { dueNotice, EXPIRED_NOTICE, noticeText } from './credential-expiry';
import { LicenseReadingService } from '../licenses/license-reading.service';

const LICENSE_LABEL: Record<string, string> = {
  HVAC: 'HVAC license', ELECTRICAL: 'Electrical license', PLUMBING: 'Plumbing license', ROOFING: 'Roofing license',
  GENERAL_CONTRACTOR: 'General contractor license', NABCEP: 'NABCEP certification', PEST_CONTROL: 'Pest control license',
  LANDSCAPING: 'Landscaping license', PAINTING: 'Painting license', POOL: 'Pool & spa license',
};

// Emails (plus in-app/push) approved vendors 60, 30 and 7 days before their
// insurance or a trade license expires, and once more when it has expired and
// access is locked (vendor-access.ts). Each credential remembers the last
// notice sent, so a missed or repeated run never double-sends.
@Injectable()
export class CredentialReminderService {
  private readonly logger = new Logger(CredentialReminderService.name);

  constructor(
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCertification) private certificationRepo: Repository<VendorCertification>,
    @InjectRepository(VendorProfile) private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorStateRegistration) private registrationRepo: Repository<VendorStateRegistration>,
    private notificationsService: NotificationsService,
    private licenseReading: LicenseReadingService,
  ) {}

  // 9:00 every morning, server time.
  @Cron('0 0 9 * * *')
  async run(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    try {
      sent += await this.remindInsurance(now);
      sent += await this.remindLicenses(now);
      await this.markExpiredLicenses(now);
      await this.markExpiredInsurance(now);
      await this.endRegistrationPasses(now);
    } catch (err) {
      this.logger.error(`Credential reminder run failed: ${(err as Error).message}`);
    }
    if (sent) this.logger.log(`Sent ${sent} credential expiry notice(s)`);
    return { sent };
  }

  // Licenses whose expiry date has passed become EXPIRED. Customers already
  // stop seeing the vendor for that trade (only APPROVED, unexpired licenses
  // match jobs), and vendor-access.ts locks the vendor when it was their last
  // valid license of that trade. The status makes it plain in the app and admin.
  async markExpiredLicenses(now = new Date()): Promise<number> {
    const res = await this.certificationRepo.update(
      {
        status: In([CertificationReviewStatus.APPROVED, CertificationReviewStatus.PENDING_REVIEW, CertificationReviewStatus.NEEDS_REVIEW]),
        expirationDate: LessThan(now),
      },
      { status: CertificationReviewStatus.EXPIRED },
    );
    if (res.affected) this.logger.log(`Marked ${res.affected} license(s) expired`);
    return res.affected ?? 0;
  }

  // A certificate of insurance past its expiry date becomes EXPIRED (access is
  // already locked by vendor-access.ts; the status makes it plain everywhere).
  async markExpiredInsurance(now = new Date()): Promise<number> {
    const res = await this.companyRepo.update(
      {
        coiStatus: In([CertificationReviewStatus.APPROVED, CertificationReviewStatus.PENDING_REVIEW, CertificationReviewStatus.NEEDS_REVIEW]),
        coiExpirationDate: LessThan(now),
      },
      { coiStatus: CertificationReviewStatus.EXPIRED },
    );
    if (res.affected) this.logger.log(`Marked ${res.affected} certificate(s) of insurance expired`);
    return res.affected ?? 0;
  }

  // A temporary "already serving this state" pass (document-backfill.service.ts)
  // that ran out without a registration being uploaded becomes EXPIRED: that
  // state's counties stop showing to customers, and the company admin is told
  // which registration to upload.
  async endRegistrationPasses(now = new Date()): Promise<number> {
    const ended = await this.registrationRepo.find({
      where: { documentKey: IsNull(), graceUntil: LessThan(now), status: Not(CertificationReviewStatus.EXPIRED) },
    });
    if (!ended.length) return 0;
    const admins = await this.companyAdminIds([...new Set(ended.map((r) => r.companyId))]);
    for (const r of ended) {
      await this.registrationRepo.update(r.id, { status: CertificationReviewStatus.EXPIRED });
      for (const id of admins.get(r.companyId) ?? []) {
        await this.notificationsService.notifyUserWithEmail(
          id, NotificationType.VENDOR_CREDENTIAL_EXPIRING,
          `Upload your ${r.state} business registration`,
          `Customers in ${r.state} no longer see your company. Upload your ${r.state} state business registration in the Attenteve app to serve ${r.state} again.`,
          { vendorCompanyId: r.companyId, credential: 'stateRegistration', state: r.state, screen: 'vendor-states' },
        ).catch(() => {});
      }
    }
    this.logger.log(`Ended ${ended.length} temporary state registration pass(es)`);
    return ended.length;
  }

  // Every 10 minutes: a license still READING 20+ minutes after its last
  // update was probably dropped by an API restart. Read it again; the reader
  // always finishes with a status (falling back to "needs review").
  @Cron('0 */10 * * * *')
  async retryStuckReads(now = new Date()): Promise<number> {
    const stuck = await this.certificationRepo.find({
      where: { status: CertificationReviewStatus.READING, updatedAt: LessThan(new Date(now.getTime() - 20 * 60 * 1000)) },
    });
    for (const c of stuck) await this.licenseReading.read(c.id).catch((err) => this.logger.warn(`Retry read ${c.id}: ${(err as Error).message}`));

    // The same for state registrations and certificates of insurance.
    const cutoff = LessThan(new Date(now.getTime() - 20 * 60 * 1000));
    const regs = await this.registrationRepo.find({ where: { status: CertificationReviewStatus.READING, updatedAt: cutoff } });
    for (const r of regs) await this.licenseReading.readRegistration(r.id).catch((err) => this.logger.warn(`Retry registration ${r.id}: ${(err as Error).message}`));
    const cois = await this.companyRepo.find({ where: { coiStatus: CertificationReviewStatus.READING, updatedAt: cutoff } });
    for (const c of cois) await this.licenseReading.readCoi(c.id).catch((err) => this.logger.warn(`Retry insurance ${c.id}: ${(err as Error).message}`));
    return stuck.length + regs.length + cois.length;
  }

  private async companyAdminIds(companyIds: string[]): Promise<Map<string, string[]>> {
    const admins = companyIds.length
      ? await this.profileRepo.find({ where: { companyId: In(companyIds), isCompanyAdmin: true } })
      : [];
    const map = new Map<string, string[]>();
    for (const a of admins) map.set(a.companyId!, [...(map.get(a.companyId!) ?? []), a.userId]);
    return map;
  }

  private async send(userIds: string[], notice: number, credential: string, expiry: Date, data: Record<string, unknown>) {
    const { title, body } = noticeText(credential, notice, expiry);
    for (const id of new Set(userIds)) {
      await this.notificationsService.notifyUserWithEmail(id, NotificationType.VENDOR_CREDENTIAL_EXPIRING, title, body, {
        ...data, daysLeft: notice, expired: notice === EXPIRED_NOTICE, screen: 'vendor-credentials',
      });
    }
  }

  private async remindInsurance(now: Date): Promise<number> {
    const companies = await this.companyRepo.find({
      where: { applicationStatus: VendorApplicationStatus.APPROVED, coiExpirationDate: Not(IsNull()) },
    });
    const due = companies
      .map((c) => ({ c, notice: dueNotice(c.coiExpirationDate!, c.coiReminderSentDays, now) }))
      .filter((d): d is { c: VendorCompany; notice: number } => d.notice !== null);
    if (!due.length) return 0;

    const admins = await this.companyAdminIds(due.map((d) => d.c.id));
    for (const { c, notice } of due) {
      await this.send(admins.get(c.id) ?? [], notice, 'Certificate of insurance', c.coiExpirationDate!, { vendorCompanyId: c.id, credential: 'insurance' });
      await this.companyRepo.update(c.id, { coiReminderSentDays: notice });
    }
    return due.length;
  }

  // The license holder gets the notice; so does their company admin when the
  // holder is a technician, since the admin manages the team.
  private async remindLicenses(now: Date): Promise<number> {
    const certs = await this.certificationRepo.find({ where: { status: Not(CertificationReviewStatus.REJECTED) } });
    const due = certs
      .map((c) => ({ c, notice: dueNotice(c.expirationDate, c.reminderSentDays, now) }))
      .filter((d): d is { c: VendorCertification; notice: number } => d.notice !== null);
    if (!due.length) return 0;

    const profiles = await this.profileRepo.find({ where: { userId: In([...new Set(due.map((d) => d.c.userId))]) } });
    const companyOf = new Map(profiles.map((p) => [p.userId, p.companyId]));
    const companyIds = [...new Set(profiles.map((p) => p.companyId).filter((id): id is string => !!id))];
    const approved = new Set(
      (companyIds.length ? await this.companyRepo.find({ where: { id: In(companyIds), applicationStatus: VendorApplicationStatus.APPROVED } }) : [])
        .map((c) => c.id),
    );
    const admins = await this.companyAdminIds([...approved]);

    let sent = 0;
    for (const { c, notice } of due) {
      const companyId = companyOf.get(c.userId);
      // Not approved yet → the application checklist handles expired licenses.
      if (!companyId || !approved.has(companyId)) continue;
      await this.send([c.userId, ...(admins.get(companyId) ?? [])], notice, LICENSE_LABEL[c.certificationType] ?? 'Trade license', c.expirationDate, {
        vendorCompanyId: companyId, certificationId: c.id, credential: 'license',
      });
      await this.certificationRepo.update(c.id, { reminderSentDays: notice });
      sent++;
    }
    return sent;
  }
}
