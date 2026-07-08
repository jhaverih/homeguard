import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert, AlertSeverity, AlertStatus } from './entities/alert.entity';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private alertsRepo: Repository<Alert>,
    private notificationsService: NotificationsService,
  ) {}

  async createAlert(data: {
    customerId: string;
    yolinkHomeId?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    event?: string;
    severity: AlertSeverity;
    message: string;
    rawPayload?: any;
  }): Promise<Alert> {
    const alert = this.alertsRepo.create(data);
    await this.alertsRepo.save(alert);

    const emoji = {
      [AlertSeverity.CRITICAL]: '🚨',
      [AlertSeverity.HIGH]: '⚠️',
      [AlertSeverity.MEDIUM]: '🔔',
      [AlertSeverity.LOW]: 'ℹ️',
    }[data.severity] ?? '🔔';

    await this.notificationsService.notifyUserWithEmail(
      data.customerId,
      NotificationType.NEW_REQUEST,
      `${emoji} Home Alert`,
      data.message,
      { alertId: alert.id, severity: data.severity, screen: 'alerts' },
    ).catch(() => {});

    return alert;
  }

  async getMyAlerts(customerId: string, page = 1, limit = 20): Promise<{ alerts: Alert[]; total: number; unread: number }> {
    const [alerts, total] = await this.alertsRepo.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const unread = await this.alertsRepo.count({ where: { customerId, status: AlertStatus.NEW } });
    return { alerts, total, unread };
  }

  async markRead(alertId: string, customerId: string): Promise<void> {
    const alert = await this.alertsRepo.findOne({ where: { id: alertId, customerId } });
    if (!alert) throw new NotFoundException('Alert not found');
    alert.status = AlertStatus.READ;
    await this.alertsRepo.save(alert);
  }

  async markAllRead(customerId: string): Promise<void> {
    await this.alertsRepo.update({ customerId, status: AlertStatus.NEW }, { status: AlertStatus.READ });
  }

  async requestDispatch(alertId: string, customerId: string): Promise<Alert> {
    const alert = await this.alertsRepo.findOne({ where: { id: alertId, customerId } });
    if (!alert) throw new NotFoundException('Alert not found');
    alert.emergencyDispatchRequestedAt = new Date();
    alert.status = AlertStatus.READ;
    await this.alertsRepo.save(alert);

    // Notify all admins
    await this.notificationsService.notifyUser(
      customerId,
      NotificationType.NEW_REQUEST,
      '🚨 Emergency Dispatch Requested',
      `A homeowner has requested emergency dispatch for: ${alert.message}`,
      { alertId: alert.id, screen: 'alerts' },
    ).catch(() => {});

    return alert;
  }

  async getAllAlerts(page = 1, limit = 50): Promise<{ alerts: Alert[]; total: number }> {
    const [alerts, total] = await this.alertsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { alerts, total };
  }
}
