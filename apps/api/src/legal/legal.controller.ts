import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CURRENT_CUSTOMER_TOS_VERSION,
  CURRENT_VENDOR_TOS_VERSION,
  CURRENT_FACILITATOR_DISCLOSURE_VERSION,
} from '../common/constants/tos';

// The actual terms documents are static HTML served by the admin Next.js
// app (apps/admin/public/legal/*.html) — nginx's LAN catch-all routes
// anything not matching /api/, /socket.io/, etc. straight to admin, so
// this API never sees those requests at all. This controller only exposes
// the version numbers, which the client needs but a static HTML file can't
// provide — see apps/api/legal/*.md for the (separately maintained) source
// content those static files are rendered from.
@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  @Get('versions')
  getVersions() {
    return {
      customerTosVersion: CURRENT_CUSTOMER_TOS_VERSION,
      vendorTosVersion: CURRENT_VENDOR_TOS_VERSION,
      facilitatorDisclosureVersion: CURRENT_FACILITATOR_DISCLOSURE_VERSION,
    };
  }
}
