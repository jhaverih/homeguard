import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany, VendorApplicationStatus } from './entities/vendor-company.entity';

// Whether a vendor user's company has been approved, and whether its Stripe
// payout account is ready. Every vendor-side capability (job lists, accepting
// work, the vendor portal) checks this — a vendor whose company is still
// INCOMPLETE / PENDING_REVIEW / NEEDS_INFO / REJECTED only reaches the
// onboarding endpoints. Technicians inherit their company's status.
//
// Takes a DataSource rather than injected repositories so the same check
// works from any module (service requests, payments, guards) without each
// one importing VendorModule.
export interface VendorAccess {
  companyId: string | null;
  applicationStatus: VendorApplicationStatus | null;
  approved: boolean;
  stripeReady: boolean;
  isCompanyAdmin: boolean;
}

export async function getVendorAccess(dataSource: DataSource, userId: string): Promise<VendorAccess> {
  const profile = await dataSource.getRepository(VendorProfile).findOne({ where: { userId } });
  const company = profile?.companyId
    ? await dataSource.getRepository(VendorCompany).findOne({ where: { id: profile.companyId } })
    : null;
  const applicationStatus = company?.applicationStatus ?? null;
  return {
    companyId: company?.id ?? null,
    applicationStatus,
    approved: applicationStatus === VendorApplicationStatus.APPROVED,
    stripeReady: !!company?.stripeOnboardingComplete,
    isCompanyAdmin: !!profile?.isCompanyAdmin,
  };
}

export const NOT_APPROVED_MESSAGE =
  'Your company application has not been approved yet. Finish your application in the Attenteve app.';
export const STRIPE_REQUIRED_MESSAGE =
  'Set up Stripe payouts before accepting jobs. Open Profile → Set Up Stripe Payouts in the Attenteve app.';

export async function assertApprovedVendor(dataSource: DataSource, userId: string): Promise<VendorAccess> {
  const access = await getVendorAccess(dataSource, userId);
  if (!access.approved) throw new ForbiddenException(NOT_APPROVED_MESSAGE);
  return access;
}

// Accepting work additionally needs a finished Stripe Connect account, so the
// company can actually be paid for the job.
export async function assertCanAcceptJobs(dataSource: DataSource, userId: string): Promise<void> {
  const access = await assertApprovedVendor(dataSource, userId);
  if (!access.stripeReady) throw new ForbiddenException(STRIPE_REQUIRED_MESSAGE);
}
