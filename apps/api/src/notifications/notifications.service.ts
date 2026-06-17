import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { AppNotification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

export enum NotificationType {
  NEW_REQUEST = 'NEW_REQUEST',
  REQUEST_ACCEPTED = 'REQUEST_ACCEPTED',
  VENDOR_EN_ROUTE = 'VENDOR_EN_ROUTE',
  VENDOR_ARRIVED = 'VENDOR_ARRIVED',
  JOB_COMPLETED = 'JOB_COMPLETED',
  ADDITIONAL_SERVICE_RECOMMENDED = 'ADDITIONAL_SERVICE_RECOMMENDED',
  ADDITIONAL_SERVICE_APPROVED = 'ADDITIONAL_SERVICE_APPROVED',
  SCHEDULE_CHANGED = 'SCHEDULE_CHANGED',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  NEW_MESSAGE = 'NEW_MESSAGE',
}

@Injectable()
export class NotificationsService {
  private expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(AppNotification)
    private notificationsRepo: Repository<AppNotification>,
    private usersService: UsersService,
  ) {}

  async notifyUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const notification = this.notificationsRepo.create({ userId, type, title, body, data });
    await this.notificationsRepo.save(notification);

    try {
      const user = await this.usersService.findById(userId);
      if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
        await this.sendPush([user.expoPushToken], title, body, data);
      }
    } catch (err) {
      this.logger.warn(`Could not send push notification to user ${userId}: ${err.message}`);
    }
  }

  async notifyVendors(
    vendors: User[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const tokens: string[] = [];

    for (const vendor of vendors) {
      const notification = this.notificationsRepo.create({ userId: vendor.id, type, title, body, data });
      await this.notificationsRepo.save(notification);
      if (vendor.expoPushToken && Expo.isExpoPushToken(vendor.expoPushToken)) {
        tokens.push(vendor.expoPushToken);
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
  ): Promise<void> {
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to, title, body, data: data || {}, sound: 'default',
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
