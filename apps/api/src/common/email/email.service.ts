import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP_USER / SMTP_PASS not set — emails will be logged to console only');
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const subject = 'Your Houmi verification code';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0B4A45">Verify your email</h2>
        <p>Your Houmi verification code is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0B4A45;
                    background:#EBF1EF;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          ${code}
        </div>
        <p style="color:#64748b;font-size:14px">This code expires in 15 minutes.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  async sendPasswordReset(to: string, token: string, frontendUrl: string): Promise<void> {
    const subject = 'Reset your Houmi password';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0B4A45">Reset your password</h2>
        <p>Use this code in the Houmi app to reset your password:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#0B4A45;
                    background:#EBF1EF;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          ${token}
        </div>
        <p style="color:#64748b;font-size:14px">This code expires in 1 hour. If you didn't request a reset, ignore this email.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const from = this.config.get<string>('SMTP_USER') || 'noreply@houmi.app';

    if (!this.transporter) {
      this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
      this.logger.log(`[EMAIL HTML] ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: `Houmi <${from}>`, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
    }
  }
}
