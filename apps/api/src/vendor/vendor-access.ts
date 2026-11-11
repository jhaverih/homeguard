import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany, VendorApplicationStatus } from './entities/vendor-company.entity';
import { VendorCertification } from './entities/vendor-certification.entity';
import { expiredLicenses, isExpired } from './credentials/credential-expiry';

// Whether a vendor user's company has been approved, whether its credentials
// are still current, and whether its Stripe payout account is ready. Every
// vendor-side capability (job lists, accepting work, the vendor portal)
// checks this — a vendor whose company is still INCOMPLETE / PENDING_REVIEW /
// NEEDS_INFO / REJECTED only reaches the onboarding endpoints, and one whose
// insurance or own trade license has expired only reaches the renewal
// endpoints (vendor/onboarding/credentials). Technicians inherit their
// company's status and insurance.
//
// Takes a DataSource rather than injected repositories so the same check
// works from any module (service requests, payments, guards) without each
// one importing VendorModule.
export interface VendorAccess {
  companyId: string | null;
  applicationStatus: VendorApplicationStatus | null;
  approved: boolean;
  insuranceExpired: boolean;
  expiredLicenseIds: string[];
  credentialsExpired: boolean;
  stripeReady: boolean;
  isCompanyAdmin: boolean;
}

export async function getVendorAccess(dataSource: DataSource, userId: string): Promise<VendorAccess> {
  const profile = await dataSource.getRepository(VendorProfile).findOne({ where: { userId } });
  const company = profile?.companyId
    ? await dataSource.getRepository(VendorCompany).findOne({ where: { id: profile.companyId } })
    : null;
  const applicationStatus = company?.applicationStatus ?? null;
  const approved = applicationStatus === VendorApplicationStatus.APPROVED;
  const now = new Date();

  // Expiry only locks an approved company; before approval the checklist
  // already refuses an expired document.
  const insuranceExpired = approved && isExpired(company?.coiExpirationDate, now);
  const expiredLicenseIds = approved
    ? expiredLicenses(await dataSource.getRepository(VendorCertification).find({ where: { userId } }), now).map((l) => l.id)
    : [];

  return {
    companyId: company?.id ?? null,
    applicationStatus,
    approved,
    insuranceExpired,
    expiredLicenseIds,
    credentialsExpired: insuranceExpired || expiredLicenseIds.length > 0,
    stripeReady: !!company?.stripeOnboardingComplete,
    isCompanyAdmin: !!profile?.isCompanyAdmin,
  };
}

export const NOT_APPROVED_MESSAGE =
  'Your company application has not been approved yet. Finish your application in the Attenteve app.';
export const STRIPE_REQUIRED_MESSAGE =
  'Set up Stripe payouts before accepting jobs. Open Profile → Set Up Stripe Payouts in the Attenteve app.';
export const CREDENTIALS_EXPIRED_MESSAGE =
  'Your insurance or a trade license has expired. Upload the renewed credential in the Attenteve app to get access back.';
// Lets the app and portal tell this 403 apart and open the renewal screen.
export const CREDENTIALS_EXPIRED_CODE = 'CREDENTIALS_EXPIRED';

export async function assertApprovedVendor(dataSource: DataSource, userId: string): Promise<VendorAccess> {
  const access = await getVendorAccess(dataSource, userId);
  if (!access.approved) throw new ForbiddenException(NOT_APPROVED_MESSAGE);
  if (access.credentialsExpired) {
    throw new ForbiddenException({ statusCode: 403, code: CREDENTIALS_EXPIRED_CODE, message: CREDENTIALS_EXPIRED_MESSAGE });
  }
  return access;
}

// Accepting work additionally needs a finished Stripe Connect account, so the
// company can actually be paid for the job.
export async function assertCanAcceptJobs(dataSource: DataSource, userId: string): Promise<void> {
  const access = await assertApprovedVendor(dataSource, userId);
  if (!access.stripeReady) throw new ForbiddenException(STRIPE_REQUIRED_MESSAGE);
}
