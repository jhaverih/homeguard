import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VENDOR_ADMIN_ONLY_KEY } from '../decorators/vendor-admin.decorator';

@Injectable()
export class VendorAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresVendorAdmin = this.reflector.getAllAndOverride<boolean>(VENDOR_ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresVendorAdmin) return true;

    const { user } = context.switchToHttp().getRequest();
    return !!user?.vendorProfile?.isCompanyAdmin;
  }
}
