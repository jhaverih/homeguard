import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'path';
import {
  CURRENT_CUSTOMER_TOS_VERSION,
  CURRENT_VENDOR_TOS_VERSION,
  CURRENT_FACILITATOR_DISCLOSURE_VERSION,
} from '../common/constants/tos';
import { CURRENT_VENDOR_BACKGROUND_CHECK_VERSION } from '../common/constants/vendor-background-check';

// The published terms pages live in apps/api/legal/*.html (rendered from the
// .md sources beside them) and are copied into the image by the Dockerfile.
// Serving them from the API keeps them on the public host (api.attenteve.com
// only routes /api/* to this app), so the mobile app's "Read terms" links
// work off the home network. Relative links between the pages (e.g. to
// privacy-policy.html) resolve under the same /api/legal/ path.
const LEGAL_DIR = join(process.cwd(), 'legal');
const DOCUMENTS = new Set(['customer-terms', 'vendor-terms', 'privacy-policy']);

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  @Get('versions')
  getVersions() {
    return {
      customerTosVersion: CURRENT_CUSTOMER_TOS_VERSION,
      vendorTosVersion: CURRENT_VENDOR_TOS_VERSION,
      facilitatorDisclosureVersion: CURRENT_FACILITATOR_DISCLOSURE_VERSION,
      vendorBackgroundCheckVersion: CURRENT_VENDOR_BACKGROUND_CHECK_VERSION,
    };
  }

  @Get(':file')
  getDocument(@Param('file') file: string, @Res() res: Response) {
    const doc = file.replace(/\.html$/, '');
    if (!DOCUMENTS.has(doc)) throw new NotFoundException();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(`${doc}.html`, { root: LEGAL_DIR }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Not Found' });
    });
  }
}
