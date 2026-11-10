import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../enums/role.enum';
import { assertApprovedVendor } from '../../vendor/vendor-access';

// Blocks every route it guards until the caller's vendor company is APPROVED
// (see vendor/vendor-access.ts). Admins pass through, for routes shared with
// the admin portal.
@Injectable()
export class ApprovedVendorGuard implements CanActivate {
  constructor(private dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (user.roles?.includes(UserRole.ADMIN)) return true;
    await assertApprovedVendor(this.dataSource, user.id);
    return true;
  }
}
