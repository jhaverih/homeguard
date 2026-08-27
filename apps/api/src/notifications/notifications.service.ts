import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import * as nodemailer from 'nodemailer';
import { AppNotification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { NotificationType } from './notification-type.enum';
import { FcmService } from './fcm.service';

export { NotificationType };

@Injectable()
export class NotificationsService {
  private expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);
  private mailer: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(AppNotification)
    private notificationsRepo: Repository<AppNotification>,
    private usersService: UsersService,
    private fcmService: FcmService,
    private configService: ConfigService,
  ) {
    this.initMailer();
  }

  private initMailer() {
    const host = this.configService.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not configured — email notifications disabled');
      return;
    }
    this.mailer = nodemailer.createTransport({
      host,
      port: parseInt(this.configService.get<string>('SMTP_PORT') ?? '587', 10),
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async notifyUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    // Maps to the iOS UNNotificationCategory / Android notification category
    // the mobile app registered via setNotificationCategoryAsync — lets a
    // push show inline action buttons (e.g. Snooze) instead of a plain tap.
    // Omit for anything that shouldn't carry action buttons.
    categoryId?: string,
  ): Promise<void> {
    const notification = this.notificationsRepo.create({ userId, type, title, body, data });
    await this.notificationsRepo.save(notification);

    try {
      const user = await this.usersService.findById(userId);

      // Category-tagged (Snoozable) alerts go through direct FCM when the
      // device has registered a native token — Expo's push relay silently
      // drops categoryId before it reaches FCM (confirmed via on-device
      // diagnostic), so action buttons never work through that path. Falls
      // through to Expo below if there's no FCM token yet (iOS, or an
      // Android device that hasn't re-registered since this shipped) or the
      // direct send fails for any reason — never silently drops the alert.
      if (categoryId && user.fcmDeviceToken) {
        const sent = await this.fcmService.sendDataMessage(user.fcmDeviceToken, {
          title,
          message: body,
          categoryId,
          body: JSON.stringify(data ?? {}),
        });
        if (sent) return;
        this.logger.warn(`Direct FCM send failed for user ${userId}, falling back to Expo push.`);
      }

      if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
        await this.sendPush([user.expoPushToken], title, body, data, categoryId);
      }
    } catch (err) {
      this.logger.warn(`Could not send push notification to user ${userId}: ${err.message}`);
    }
  }

  async notifyUserWithEmail(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    categoryId?: string,
  ): Promise<void> {
    await this.notifyUser(userId, type, title, body, data, categoryId);

    try {
      const user = await this.usersService.findById(userId);
      if (user?.email) {
        await this.sendEmail(user.email, user.firstName, title, body);
      }
    } catch (err) {
      this.logger.warn(`Could not send email to user ${userId}: ${err.message}`);
    }
  }

  async notifyVendors(
    vendors: User[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.notifyUsers(vendors, type, title, body, data);
  }

  // Fans a notification out to every active ADMIN-role user — there was
  // previously no admin-broadcast mechanism at all (company applications
  // and certifications rely on an admin manually visiting the review page).
  async notifyAdmins(
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const admins = await this.usersService.findAdminTeamUsers();
    await this.notifyUsers(admins, type, title, body, data);
  }

  private async notifyUsers(
    users: User[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const tokens: string[] = [];

    for (const user of users) {
      const notification = this.notificationsRepo.create({ userId: user.id, type, title, body, data });
      await this.notificationsRepo.save(notification);
      if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
        tokens.push(user.expoPushToken);
      }
    }

    if (tokens.length > 0) {
      await this.sendPush(tokens, title, body, data);
    }
  }

  private async sendPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
    categoryId?: string,
  ): Promise<void> {
    // priority: 'high' so Android still delivers/wakes the device under
    // Doze/App Standby when the app is fully closed, not just backgrounded —
    // otherwise delivery timing falls back to Expo/FCM's normal-priority
    // default, which can be delayed or dropped for a killed app.
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to, title, body, data: data || {}, sound: 'default', priority: 'high',
      ...(categoryId ? { categoryId } : {}),
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        this.logger.error('Push notification error', err);
      }
    }
  }

  async sendEmail(to: string, firstName: string, subject: string, text: string): Promise<void> {
    if (!this.mailer) return;

    const fromName = this.configService.get<string>('SMTP_FROM_NAME') ?? 'Attenteve';
    const fromAddr = this.configService.get<string>('SMTP_USER') ?? '';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <div style="background:#12181C;border-radius:12px 12px 0 0;padding:20px 24px">
          <h1 style="color:#EDF1F0;margin:0;font-size:22px">Attenteve</h1>
        </div>
        <div style="background:#fff;border:1px solid #DEE6E4;border-top:none;border-radius:0 0 12px 12px;padding:24px">
          <p style="margin-top:0">Hi ${firstName},</p>
          <p style="font-size:16px;font-weight:600;color:#12181C">${subject}</p>
          <p style="color:#5B6B70">${text}</p>
          <p style="color:#5B6B70;font-size:12px;margin-top:32px">
            You received this because you're an Attenteve subscriber. Open the Attenteve app to view and manage your alerts.
          </p>
        </div>
      </div>`;

    try {
      await this.mailer.sendMail({ from: `"${fromName}" <${fromAddr}>`, to, subject, text, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }

  async getMyNotifications(userId: string): Promise<AppNotification[]> {
    return this.notificationsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationsRepo.update(
      { id: notificationId, userId },
      { readAt: new Date() },
    );
  }
}
