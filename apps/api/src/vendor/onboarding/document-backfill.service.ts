import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../entities/vendor-company.entity';
import { VendorStateRegistration } from '../entities/vendor-state-registration.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { statesForCounties } from '../../common/utils/county.utils';

/** How long vendors already serving a state may keep serving it without uploading its registration. */
export const REGISTRATION_GRACE_DAYS = 60;

// Runs once at startup to carry existing vendors over to the per-state
// registration and read-insurance rules, without locking anyone out:
//
//   1. Per-state registrations (only the first time, while the table is empty):
//      - a company's existing single registration document becomes its
//        registration for its business-address state (approved if the company
//        is approved, otherwise waiting for review with the application);
//      - an approved company gets a temporary pass for every other state it
//        already serves, valid REGISTRATION_GRACE_DAYS days. After that the
//        daily job marks it EXPIRED and those counties stop showing to
//        customers until the state's registration is uploaded and approved.
//   2. Insurance (every startup, harmless to repeat): a certificate uploaded
//      before automatic reading existed gets a status — approved for approved
//      companies, otherwise waiting for review with the application.
@Injectable()
export class DocumentBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentBackfillService.name);

  constructor(
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorStateRegistration) private registrationRepo: Repository<VendorStateRegistration>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.backfill(new Date());
    } catch (err) {
      this.logger.error(`Document backfill failed: ${(err as Error).message}`);
    }
  }

  async backfill(now: Date) {
    const companies = await this.companyRepo.find();

    if ((await this.registrationRepo.count()) === 0) {
      const graceUntil = new Date(now.getTime() + REGISTRATION_GRACE_DAYS * 24 * 60 * 60 * 1000);
      const rows: Partial<VendorStateRegistration>[] = [];
      for (const c of companies) {
        const approved = c.applicationStatus === VendorApplicationStatus.APPROVED;
        const done = new Set<string>();
        const homeState = c.state?.toUpperCase() || statesForCounties(c.serviceCounties)[0] || null;
        if (c.stateRegistrationDocKey && homeState) {
          rows.push({
            companyId: c.id, state: homeState, documentKey: c.stateRegistrationDocKey,
            status: approved ? CertificationReviewStatus.APPROVED : CertificationReviewStatus.PENDING_REVIEW,
            reviewedAt: approved ? now : null,
          });
          done.add(homeState);
        }
        if (approved) {
          for (const state of statesForCounties(c.serviceCounties)) {
            if (done.has(state)) continue;
            rows.push({ companyId: c.id, state, documentKey: null, status: CertificationReviewStatus.APPROVED, graceUntil });
            done.add(state);
          }
        }
      }
      if (rows.length) {
        await this.registrationRepo.save(rows.map((r) => this.registrationRepo.create(r)));
        this.logger.log(`Created ${rows.length} state registration record(s) from existing vendor data.`);
      }
    }

    const oldCoi = companies.filter((c) => c.coiDocumentKey && !c.coiStatus);
    for (const c of oldCoi) {
      await this.companyRepo.update(c.id, {
        coiStatus: c.applicationStatus === VendorApplicationStatus.APPROVED
          ? CertificationReviewStatus.APPROVED
          : CertificationReviewStatus.PENDING_REVIEW,
      });
    }
    if (oldCoi.length) this.logger.log(`Set a status on ${oldCoi.length} existing certificate(s) of insurance.`);
  }
}
