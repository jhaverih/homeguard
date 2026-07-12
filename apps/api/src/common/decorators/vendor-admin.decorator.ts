import { SetMetadata } from '@nestjs/common';

export const VENDOR_ADMIN_ONLY_KEY = 'vendorAdminOnly';
export const VendorAdminOnly = () => SetMetadata(VENDOR_ADMIN_ONLY_KEY, true);
