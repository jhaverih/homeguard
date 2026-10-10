import { Body, Controller, Delete, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { NestService } from './nest.service';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// The page Google's consent screen lands the browser on — plain HTML since
// this tab was opened from the admin portal and is just closed afterward.
function resultPage(title: string, detail: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1f2937">
<h1 style="font-size:1.4rem;color:${ok ? '#166534' : '#991b1b'}">${escapeHtml(title)}</h1>
<p>${escapeHtml(detail)}</p><p style="color:#6b7280">You can close this tab and return to the Attenteve admin portal.</p>
</body></html>`;
}

@ApiTags('Nest')
@Controller('nest')
export class NestController {
  constructor(private readonly service: NestService) {}

  // Public — Google redirects the homeowner's browser here after consent.
  // Authenticity comes from the HMAC-signed `state`, not a session.
  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Google Nest OAuth redirect target (called by the browser after Google consent)' })
  async oauthCallback(@Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    if (error) return resultPage('Nest was not connected', `Google reported: ${error}. Start again from the admin portal if this was unintended.`, false);
    if (!code || !state) return resultPage('Nest was not connected', 'The link was incomplete — start again from the admin portal.', false);
    try {
      const { thermostats } = await this.service.completeAuthorization(code, state);
      return resultPage('Nest connected', `Found ${thermostats} thermostat${thermostats === 1 ? '' : 's'}. Readings will start appearing within a few minutes.`, true);
    } catch (err: any) {
      return resultPage('Nest was not connected', err.response?.message ?? err.message ?? 'Unknown error', false);
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('status')
  @ApiOperation({ summary: 'Whether the Nest integration is configured on this server (admin)' })
  getStatus() {
    return this.service.status();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('accounts')
  @ApiOperation({ summary: 'Connected Nest accounts with their thermostats and live state (admin)' })
  listAccounts() {
    return this.service.listAccounts();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('oauth/start')
  @ApiOperation({ summary: "Start Google consent to connect a customer's Nest thermostats — returns the URL to open (admin)" })
  startAuthorization(@Body() body: { customerId: string }) {
    return this.service.startAuthorization(body.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('accounts/:id/sync')
  @ApiOperation({ summary: 'Re-read thermostats from Google now (admin)' })
  sync(@Param('id') id: string) {
    return this.service.syncAccountById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('accounts/:id')
  @ApiOperation({ summary: "Disconnect a customer's Nest account and revoke Attenteve's Google access (admin)" })
  disconnect(@Param('id') id: string) {
    return this.service.disconnect(id);
  }
}
