import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Alert, AlertSeverity, AlertStatus } from './entities/alert.entity';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert) private alertsRepo: Repository<Alert>,
    private notificationsService: NotificationsService,
  ) {}

  // Idempotent catch-up for alerts raised before alerts were resolved
  // automatically: those whose finding is already closed, and disconnect
  // alerts for sensors that are reporting again.
  async onModuleInit(): Promise<void> {
    try {
      const findings = await this.alertsRepo.query(`
        UPDATE alerts a SET status = 'RESOLVED'
        FROM analytics_findings f
        WHERE a."rawPayload"->>'findingId' = f.id::text
          AND f.status IN ('RESOLVED', 'DISMISSED') AND a.status <> 'RESOLVED'`);
      const disconnects = await this.alertsRepo.query(`
        UPDATE alerts a SET status = 'RESOLVED'
        FROM yolink_devices d
        WHERE a.event = 'Device.Disconnected' AND a."deviceId" = d."deviceId"
          AND d."disconnectAlertedAt" IS NULL AND a.status <> 'RESOLVED'`);
      const n = (Number(findings?.[1]) || 0) + (Number(disconnects?.[1]) || 0);
      if (n) this.logger.log(`Resolved ${n} alert(s) whose condition had already ended`);
    } catch (err: any) {
      this.logger.warn(`Alert catch-up skipped: ${err?.message ?? err}`);
    }
  }

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
    // Notification action category (e.g. 'SNOOZABLE_FINDING') — not a
    // persisted column, stripped before the repo write below.
    categoryId?: string;
  }): Promise<Alert> {
    const { categoryId, ...alertData } = data;
    const alert = this.alertsRepo.create(alertData);
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
      categoryId,
    ).catch(() => {});

    return alert;
  }

  // Rewrites an existing alert's text in place WITHOUT re-notifying — for
  // grouped alerts (e.g. INDOOR-TEMP-001) where a second sensor joining an
  // already-sent alarm should update what the alert lists, not push again.
  async updateMessage(alertId: string, message: string): Promise<void> {
    await this.alertsRepo.update(alertId, { message });
  }

  // The condition behind these alerts is over (the sensor reads normal
  // again, or someone closed the finding): mark them Resolved so they stop
  // looking urgent and lose the dispatch button. They stay in history.
  async resolveForFinding(findingId: string, stillOpenAlertIds: string[] = []): Promise<void> {
    const qb = this.alertsRepo.createQueryBuilder()
      .update()
      .set({ status: AlertStatus.RESOLVED })
      .where(`"rawPayload"->>'findingId' = :findingId`, { findingId })
      .andWhere('status != :resolved', { resolved: AlertStatus.RESOLVED });
    if (stillOpenAlertIds.length) qb.andWhere('id NOT IN (:...open)', { open: stillOpenAlertIds });
    await qb.execute();
  }

  // The condition came back within moments (same episode): open again.
  async reopen(alertId: string): Promise<void> {
    await this.alertsRepo.update({ id: alertId, status: AlertStatus.RESOLVED }, { status: AlertStatus.NEW });
  }

  // A sensor that was reported disconnected is reporting again.
  async resolveDisconnect(customerId: string, deviceId: string): Promise<void> {
    await this.alertsRepo.createQueryBuilder()
      .update()
      .set({ status: AlertStatus.RESOLVED })
      .where('"customerId" = :customerId AND "deviceId" = :deviceId AND event = :event AND status != :resolved', {
        customerId, deviceId, event: 'Device.Disconnected', resolved: AlertStatus.RESOLVED,
      })
      .execute();
  }

  // What still needs attention, newest first: unresolved alerts only.
  async getActiveAlerts(customerId: string, limit = 20): Promise<Alert[]> {
    return this.alertsRepo.find({
      where: { customerId, status: Not(AlertStatus.RESOLVED) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
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
    if (alert.status === AlertStatus.RESOLVED) return; // already closed
    alert.status = AlertStatus.READ;
    await this.alertsRepo.save(alert);
  }

  async markAllRead(customerId: string): Promise<void> {
    await this.alertsRepo.update({ customerId, status: AlertStatus.NEW }, { status: AlertStatus.READ });
  }

  async requestDispatch(alertId: string, customerId: string): Promise<Alert> {
    const alert = await this.alertsRepo.findOne({ where: { id: alertId, customerId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status === AlertStatus.RESOLVED) {
      throw new BadRequestException('This alert is resolved: the sensor is back to normal. Book a service if you still need help.');
    }
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
