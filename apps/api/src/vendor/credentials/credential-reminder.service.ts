import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../entities/vendor-company.entity';
import { VendorCertification, CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { VendorProfile } from '../../users/entities/vendor-profile.entity';
import { NotificationsService, NotificationType } from '../../notifications/notifications.service';
import { dueNotice, EXPIRED_NOTICE, noticeText } from './credential-expiry';

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
    private notificationsService: NotificationsService,
  ) {}

  // 9:00 every morning, server time.
  @Cron('0 0 9 * * *')
  async run(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    try {
      sent += await this.remindInsurance(now);
      sent += await this.remindLicenses(now);
    } catch (err) {
      this.logger.error(`Credential reminder run failed: ${(err as Error).message}`);
    }
    if (sent) this.logger.log(`Sent ${sent} credential expiry notice(s)`);
    return { sent };
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
