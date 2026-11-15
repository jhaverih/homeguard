import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VendorProfile } from '../../users/entities/vendor-profile.entity';
import { VendorCompany } from '../entities/vendor-company.entity';
import { VendorCertification, CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { VendorStateRegistration } from '../entities/vendor-state-registration.entity';
import { UploadsService } from '../../uploads/uploads.service';
import { NotificationsService, NotificationType } from '../../notifications/notifications.service';
import { LicenseReaderClient } from './license-reader.client';
import { evaluateLicense, LicenseExtraction } from './license-validation';
import { CoiExtraction, evaluateCoi, evaluateRegistration, RegistrationExtraction } from './document-validation';

// Runs the automatic check for an uploaded license, state business
// registration or certificate of insurance, in the background:
//   1. fetch the file the vendor uploaded (MinIO),
//   2. send it to the license reader on the AI laptop,
//   3. apply the rules in license-validation.ts / document-validation.ts,
//   4. save what was read plus the resulting status.
//
// The document sits in READING status until this finishes; the app re-checks
// and shows the result. Only one document is read at a time, because the
// laptop's CPU handles one image at a time well and several at once badly.
@Injectable()
export class LicenseReadingService {
  private readonly logger = new Logger(LicenseReadingService.name);
  // Chain of pending reads; each new one waits for the previous to finish.
  private queue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(VendorCertification) private certificationRepo: Repository<VendorCertification>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile) private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorStateRegistration) private registrationRepo: Repository<VendorStateRegistration>,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private reader: LicenseReaderClient,
  ) {}

  /** Puts a license in READING status and queues it to be read. Returns at once. */
  async start(cert: VendorCertification): Promise<VendorCertification> {
    cert.status = CertificationReviewStatus.READING;
    cert.reviewReasons = null;
    cert.reviewNotes = null as any;
    cert.reviewedAt = null;
    const saved = await this.certificationRepo.save(cert);
    this.enqueue(`License ${saved.id}`, () => this.read(saved.id));
    return saved;
  }

  // Adds one read to the shared queue; a failure is logged and the queue moves on.
  private enqueue(label: string, job: () => Promise<void>) {
    this.queue = this.queue.then(job).catch((err) => {
      this.logger.error(`${label} reading failed: ${(err as Error).message}`);
    });
  }

  /** Reads one license and saves the outcome. Public so tests and the daily job can call it. */
  async read(certId: string): Promise<void> {
    const cert = await this.certificationRepo.findOne({ where: { id: certId } });
    if (!cert || cert.status !== CertificationReviewStatus.READING) return; // removed or already handled

    const user = await this.usersRepo.findOne({ where: { id: cert.userId } });
    const profile = await this.profileRepo.findOne({ where: { userId: cert.userId } });
    const company = profile?.companyId ? await this.companyRepo.findOne({ where: { id: profile.companyId } }) : null;

    const file = await this.uploadsService.getObject(cert.documentKey).catch(() => null);
    const filename = cert.documentKey.split('/').pop() || 'license';
    const result = file
      ? await this.reader.read({ ...file, filename }, cert.certificationType)
      : { ok: false as const, reason: 'The uploaded file could not be found.' };

    cert.extractedAt = new Date();
    if (!result.ok) {
      // Couldn't read it automatically: an admin checks the document by hand.
      cert.status = CertificationReviewStatus.NEEDS_REVIEW;
      cert.reviewReasons = [`${(result as { reason: string }).reason} An admin will check the document.`];
    } else {
      const x = (result as { extraction: LicenseExtraction & { method?: string } }).extraction;
      cert.extraction = x as any;
      cert.extractionConfidence = x.confidence;
      cert.extractedLicenseType = x.licenseType;
      cert.holderName = x.holderName;
      cert.businessName = x.businessName;
      cert.issueDate = x.issueDate;
      if (x.licenseNumber) cert.licenseNumber = x.licenseNumber;
      if (x.issuingState) cert.issuingState = x.issuingState;
      // Noon UTC so the date shows as the same calendar day in U.S. time zones.
      if (x.expirationDate) cert.expirationDate = new Date(`${x.expirationDate}T12:00:00Z`);

      const decision = evaluateLicense({
        extraction: x,
        chosenType: cert.certificationType,
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        companyName: company?.name ?? null,
        now: new Date(),
      });
      cert.status = decision.status;
      cert.reviewReasons = decision.reasons.length ? decision.reasons : null;
      if (decision.status === CertificationReviewStatus.REJECTED) cert.reviewNotes = decision.reasons[0];
    }
    cert.reminderSentDays = null;
    await this.certificationRepo.save(cert);
    this.logger.log(`License ${cert.id} read: ${cert.status}${cert.extractionConfidence ? ` (${cert.extractionConfidence})` : ''}`);

    if (cert.status === CertificationReviewStatus.NEEDS_REVIEW) {
      await this.notificationsService.notifyAdmins(
        NotificationType.VENDOR_LICENSE_NEEDS_REVIEW,
        'License Needs Review',
        `${company?.name ?? 'A vendor'}'s ${cert.certificationType} license needs a closer look: ${cert.reviewReasons?.[0] ?? ''}`,
        { vendorCompanyId: company?.id, certificationId: cert.id },
      ).catch(() => {});
    }
  }

  // ── State business registrations ──────────────────────────────────────────

  /** Puts a state registration in READING status and queues it. Returns at once. */
  async startRegistration(reg: VendorStateRegistration): Promise<VendorStateRegistration> {
    reg.status = CertificationReviewStatus.READING;
    reg.reviewReasons = null;
    reg.reviewNotes = null;
    reg.reviewedAt = null;
    reg.reviewedByUserId = null;
    reg.graceUntil = null;
    const saved = await this.registrationRepo.save(reg);
    this.enqueue(`Registration ${saved.id}`, () => this.readRegistration(saved.id));
    return saved;
  }

  async readRegistration(regId: string): Promise<void> {
    const reg = await this.registrationRepo.findOne({ where: { id: regId } });
    if (!reg || reg.status !== CertificationReviewStatus.READING || !reg.documentKey) return;
    const company = await this.companyRepo.findOne({ where: { id: reg.companyId } });

    const result = await this.readFile(reg.documentKey, reg.state, 'registration');
    reg.extractedAt = new Date();
    if (!result.ok) {
      reg.status = CertificationReviewStatus.NEEDS_REVIEW;
      reg.reviewReasons = [`${(result as { reason: string }).reason} An admin will check the document.`];
    } else {
      const x = (result as { extraction: Record<string, any> }).extraction as RegistrationExtraction;
      reg.extraction = x as any;
      reg.extractionConfidence = x.confidence;
      reg.businessName = x.businessName;
      reg.entityNumber = x.entityNumber;
      reg.registeredState = x.state;
      reg.registrationStatus = x.status;
      reg.formationDate = x.formationDate;
      const decision = evaluateRegistration({ extraction: x, expectedState: reg.state, companyName: company?.name ?? null });
      reg.status = decision.status;
      reg.reviewReasons = decision.reasons.length ? decision.reasons : null;
      if (decision.status === CertificationReviewStatus.REJECTED) reg.reviewNotes = decision.reasons[0];
    }
    await this.registrationRepo.save(reg);
    this.logger.log(`Registration ${reg.id} (${reg.state}) read: ${reg.status}`);
    if (reg.status === CertificationReviewStatus.NEEDS_REVIEW) {
      await this.notifyNeedsReview(company, `${reg.state} business registration`, reg.reviewReasons?.[0], { registrationId: reg.id });
    }
  }

  // ── Certificate of insurance ──────────────────────────────────────────────

  /** Puts the company's certificate of insurance in READING status and queues it. */
  async startCoi(company: VendorCompany): Promise<VendorCompany> {
    company.coiStatus = CertificationReviewStatus.READING;
    company.coiReviewReasons = null;
    company.coiReviewNotes = null;
    company.coiReviewedAt = null;
    const saved = await this.companyRepo.save(company);
    this.enqueue(`Insurance for ${saved.id}`, () => this.readCoi(saved.id));
    return saved;
  }

  async readCoi(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company || company.coiStatus !== CertificationReviewStatus.READING || !company.coiDocumentKey) return;

    const result = await this.readFile(company.coiDocumentKey, null, 'coi');
    company.coiExtractedAt = new Date();
    if (!result.ok) {
      company.coiStatus = CertificationReviewStatus.NEEDS_REVIEW;
      company.coiReviewReasons = [`${(result as { reason: string }).reason} An admin will check the document.`];
    } else {
      const x = (result as { extraction: Record<string, any> }).extraction as CoiExtraction;
      company.coiExtraction = x as any;
      const decision = evaluateCoi({ extraction: x, companyName: company.name, now: new Date() });
      company.coiStatus = decision.status;
      company.coiReviewReasons = decision.reasons.length ? decision.reasons : null;
      if (decision.status === CertificationReviewStatus.REJECTED) company.coiReviewNotes = decision.reasons[0];
      // The expiry date now comes from the certificate itself (vendors no
      // longer type it). Noon UTC keeps the same calendar day in U.S. zones.
      if (x.expirationDate && decision.status !== CertificationReviewStatus.REJECTED) {
        company.coiExpirationDate = new Date(`${x.expirationDate}T12:00:00Z`);
        company.coiReminderSentDays = null;
      }
    }
    await this.companyRepo.save(company);
    this.logger.log(`Insurance for ${company.id} read: ${company.coiStatus}`);
    if (company.coiStatus === CertificationReviewStatus.NEEDS_REVIEW) {
      await this.notifyNeedsReview(company, 'certificate of insurance', company.coiReviewReasons?.[0], {});
    }
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  private async readFile(key: string, hint: string | null, kind: 'registration' | 'coi') {
    const file = await this.uploadsService.getObject(key).catch(() => null);
    if (!file) return { ok: false as const, reason: 'The uploaded file could not be found.' };
    return this.reader.read({ ...file, filename: key.split('/').pop() || kind }, hint, kind);
  }

  private notifyNeedsReview(company: VendorCompany | null, what: string, reason: string | undefined, data: Record<string, unknown>) {
    return this.notificationsService.notifyAdmins(
      NotificationType.VENDOR_LICENSE_NEEDS_REVIEW,
      'Vendor Document Needs Review',
      `${company?.name ?? 'A vendor'}'s ${what} needs a closer look: ${reason ?? ''}`,
      { vendorCompanyId: company?.id, ...data },
    ).catch(() => {});
  }
}
