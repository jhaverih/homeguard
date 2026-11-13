import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VendorProfile } from '../../users/entities/vendor-profile.entity';
import { VendorCompany } from '../entities/vendor-company.entity';
import { VendorCertification, CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { UploadsService } from '../../uploads/uploads.service';
import { NotificationsService, NotificationType } from '../../notifications/notifications.service';
import { LicenseReaderClient } from './license-reader.client';
import { evaluateLicense, LicenseExtraction } from './license-validation';

// Runs the automatic license check for one uploaded license, in the background:
//   1. fetch the file the vendor uploaded (MinIO),
//   2. send it to the license reader on the AI laptop,
//   3. apply the rules in license-validation.ts,
//   4. save what was read plus the resulting status on the license.
//
// The license sits in READING status until this finishes; the app re-checks
// and shows the result. Only one license is read at a time, because the
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
    this.queue = this.queue.then(() => this.read(saved.id)).catch((err) => {
      this.logger.error(`License ${saved.id} reading failed: ${(err as Error).message}`);
    });
    return saved;
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
}
