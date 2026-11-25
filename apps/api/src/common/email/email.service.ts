import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 465);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP_HOST / SMTP_USER / SMTP_PASS not set — emails will be logged to console only');
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const subject = 'Your Attenteve verification code';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0B4A45">Verify your email</h2>
        <p>Your Attenteve verification code is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0B4A45;
                    background:#EBF1EF;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          ${code}
        </div>
        <p style="color:#64748b;font-size:14px">This code expires in 15 minutes.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const subject = 'Reset your Attenteve password';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0B4A45">Reset your password</h2>
        <p>Use this code in the Attenteve app to reset your password:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#0B4A45;
                    background:#EBF1EF;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          ${token}
        </div>
        <p style="color:#64748b;font-size:14px">This code expires in 1 hour. If you didn't request a reset, ignore this email.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  async sendTeamInvite(to: string, firstName: string, loginUrl: string): Promise<void> {
    const subject = "You've been added to the Attenteve Admin Portal";
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0B4A45">Welcome to Attenteve, ${firstName}</h2>
        <p>You've been added as an Attenteve Admin Portal user.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="display:inline-block;background:#0B4A45;color:#fff;
                    font-weight:bold;text-decoration:none;border-radius:10px;padding:14px 28px">
            Log in to get started
          </a>
        </div>
        <p style="color:#64748b;font-size:14px">
          Click the button above, then use "Forgot password?" to set your password — your account doesn't have one yet.
        </p>
      </div>`;
    await this.send(to, subject, html);
  }

  // Family invitation (apps/api/src/family). The button goes to a small page
  // on the API that opens the app; the code is the fallback when the app
  // isn't installed yet.
  async sendFamilyInvite(to: string, inviteeFirstName: string | null, inviterName: string, code: string, joinUrl: string): Promise<void> {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const subject = `${inviterName} invited you to join their home on Attenteve`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#12181C">${inviteeFirstName ? `Hi ${esc(inviteeFirstName)},` : 'Hi,'}</h2>
        <p>${esc(inviterName)} invited you to join their home on Attenteve, so you can see and book
           the home's services, visits and reports together.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${joinUrl}" style="display:inline-block;background:#F2A93C;color:#12181C;
                    font-weight:bold;text-decoration:none;border-radius:10px;padding:14px 28px">
            Join ${esc(inviterName)}'s home
          </a>
        </div>
        <p style="color:#64748b;font-size:14px">
          Open this email on your phone. If the app isn't installed yet, install Attenteve,
          then tap the button again or enter this code when you create your account:
        </p>
        <div style="font-size:26px;font-weight:bold;letter-spacing:6px;color:#12181C;
                    background:#EDF1F0;border-radius:12px;padding:16px;text-align:center;margin:16px 0">
          ${code}
        </div>
        <p style="color:#64748b;font-size:13px">The invitation expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM') || 'noreply@attenteve.com';

    if (!this.transporter) {
      this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
      this.logger.log(`[EMAIL HTML] ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: `Attenteve <${from}>`, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
      throw err;
    }
  }
}
