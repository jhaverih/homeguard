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
