import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';

// Test accounts let the owner try the platform in production. A customer is
// a test account when User.isTestAccount is set; a vendor is one when their
// company has VendorCompany.isTestAccount (so a whole team is test or real).
// The two worlds never meet:
//   - a test customer's jobs are shown and announced only to test vendors;
//   - a real customer's jobs never reach a test vendor;
//   - a real customer is never offered a service only test vendors cover.
// Both flags are set in the admin portal.

/** Whether a job from this customer may go to this vendor. */
export function sameTestWorld(customerIsTest: boolean | null | undefined, vendorIsTest: boolean | null | undefined): boolean {
  return !!customerIsTest === !!vendorIsTest;
}

/** Whether this vendor user's company is a test account. */
export async function isTestVendor(dataSource: DataSource, userId: string): Promise<boolean> {
  const profile = await dataSource.getRepository(VendorProfile).findOne({ where: { userId } });
  if (!profile?.companyId) return false;
  const company = await dataSource.getRepository(VendorCompany).findOne({
    where: { id: profile.companyId },
    select: ['id', 'isTestAccount'],
  });
  return !!company?.isTestAccount;
}

/** Whether this customer is a test account. */
export async function isTestCustomer(dataSource: DataSource, userId: string): Promise<boolean> {
  const user = await dataSource.getRepository(User).findOne({ where: { id: userId }, select: ['id', 'isTestAccount'] });
  return !!user?.isTestAccount;
}
