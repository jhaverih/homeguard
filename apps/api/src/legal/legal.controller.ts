import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import {
  CURRENT_CUSTOMER_TOS_VERSION,
  CURRENT_VENDOR_TOS_VERSION,
  CURRENT_FACILITATOR_DISCLOSURE_VERSION,
} from '../common/constants/tos';

// Renders one of apps/api/legal/*.md to a minimally-styled standalone HTML
// page. process.cwd() (not __dirname) because legal/ sits next to dist/ at
// the app's working directory in every environment this runs in — local
// dev (`apps/api`) and the Docker runtime image (`/app`, see Dockerfile) —
// while __dirname would resolve inside dist/ after compilation instead.
function renderLegalDoc(filename: string): string {
  const markdown = readFileSync(join(process.cwd(), 'legal', filename), 'utf8');
  const body = marked.parse(markdown) as string;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Attenteve — Terms &amp; Conditions</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 32px 20px 80px; color: #12181C; line-height: 1.65; }
  h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; line-height: 1.3; }
  a { color: #C97F1F; }
  blockquote { margin: 0; padding: 12px 16px; background: #F5F7F6; border-left: 3px solid #DEE6E4; color: #5B6B70; }
</style>
</head>
<body>${body}</body>
</html>`;
}

// Public, unauthenticated, and deliberately excluded from the global 'api'
// prefix for the two .html routes (see main.ts) so TERMS_URL/VENDOR_TERMS_URL
// (apps/mobile/src/services/api.ts) keep working unchanged. /versions stays
// under the normal /api prefix since it's called through the same
// authenticated axios instance as every other endpoint, not opened directly
// in a browser.
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

  @Get('customer-terms.html')
  getCustomerTerms(@Res() res: Response) {
    res.type('html').send(renderLegalDoc('customer-terms.md'));
  }

  @Get('vendor-terms.html')
  getVendorTerms(@Res() res: Response) {
    res.type('html').send(renderLegalDoc('vendor-terms.md'));
  }
}
