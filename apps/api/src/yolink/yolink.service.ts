import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { YolinkHome } from './entities/yolink-home.entity';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';

const YOLINK_API = 'https://api.yosmart.com/open/yolink/v2/api';
const YOLINK_TOKEN_URL = 'https://api.yosmart.com/open/yolink/token';

// Maps Yolink event types to severity and human-readable messages
const EVENT_CONFIG: Record<string, { severity: AlertSeverity; message: (data: any, name: string) => string }> = {
  'DoorSensor.Alert':        { severity: AlertSeverity.MEDIUM,   message: (d, n) => `${n}: Door/window ${d?.state === 'open' ? 'opened' : 'closed'}` },
  'DoorSensor.StatusChange': { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: ${d?.state === 'open' ? 'Opened' : 'Closed'}` },
  'LeakSensor.Alert':        { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Water leak detected!` },
  'LeakSensor.StatusChange': { severity: AlertSeverity.HIGH,     message: (d, n) => `${n}: ${d?.state === 'alert' ? 'Water leak detected!' : 'Leak sensor normal'}` },
  'MotionSensor.Alert':      { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Motion detected` },
  'SmokeDetector.Alert':     { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: Smoke detected! Check immediately.` },
  'COAlarm.Alert':           { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: CO alarm triggered! Evacuate immediately.` },
  'THSensor.Alert':          { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: Temp ${d?.temperature ?? '?'}°C, Humidity ${d?.humidity ?? '?'}%` },
  'VibrationSensor.Alert':   { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Vibration detected` },
  'Siren.Alert':             { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Siren activated` },
};

@Injectable()
export class YolinkService {
  private readonly logger = new Logger(YolinkService.name);
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    @InjectRepository(YolinkHome) private homesRepo: Repository<YolinkHome>,
    private configService: ConfigService,
    private httpService: HttpService,
    private alertsService: AlertsService,
  ) {}

  // ── Token management ────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const clientId = this.configService.get<string>('YOLINK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('YOLINK_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Yolink credentials not configured');

    const res = await firstValueFrom(
      this.httpService.post(YOLINK_TOKEN_URL, `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    this.accessToken = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async yolinkRequest(method: string, params?: any): Promise<any> {
    const token = await this.getAccessToken();
    const res = await firstValueFrom(
      this.httpService.post(YOLINK_API, { method, params }, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (res.data.code !== '000000') throw new Error(`Yolink API error: ${res.data.desc}`);
    return res.data.data;
  }

  // ── Homes & devices ─────────────────────────────────────────────────────────

  async getYolinkHomes(): Promise<any[]> {
    const data = await this.yolinkRequest('Home.getGeneralInfo');
    return data?.homes ?? [];
  }

  async getDevicesForHome(yolinkHomeId: string): Promise<any[]> {
    const data = await this.yolinkRequest('Home.getDeviceList', { homeId: yolinkHomeId });
    return data?.devices ?? [];
  }

  async linkHomeToCustomer(customerId: string, yolinkUAID: string, homeName: string, address?: string): Promise<YolinkHome> {
    const existing = await this.homesRepo.findOne({ where: { customerId, yolinkUAID } });
    if (existing) {
      existing.isActive = true;
      existing.homeName = homeName;
      if (address) existing.address = address;
      return this.homesRepo.save(existing);
    }
    const home = this.homesRepo.create({ customerId, yolinkUAID, homeName, address });
    return this.homesRepo.save(home);
  }

  async getLinkedHomes(customerId?: string): Promise<YolinkHome[]> {
    const where: any = { isActive: true };
    if (customerId) where.customerId = customerId;
    return this.homesRepo.find({ where, relations: ['customer'], order: { createdAt: 'DESC' } });
  }

  async unlinkHome(homeId: string): Promise<void> {
    await this.homesRepo.update(homeId, { isActive: false });
  }

  // ── Webhook handler ──────────────────────────────────────────────────────────

  async handleWebhook(payload: any): Promise<void> {
    const { event, deviceId, deviceType, data, UAID, token } = payload;

    // Validate webhook token
    const expectedToken = this.configService.get<string>('YOLINK_WEBHOOK_TOKEN');
    if (expectedToken && token !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    this.logger.log(`Yolink webhook: ${event} from ${deviceType} (UAID: ${UAID})`);

    // Only process alert/status events
    const config = EVENT_CONFIG[event];
    if (!config) {
      this.logger.debug(`Ignoring non-alert event: ${event}`);
      return;
    }

    // Find which customer this UAID belongs to
    const home = await this.homesRepo.findOne({ where: { yolinkUAID: UAID, isActive: true } });
    if (!home) {
      this.logger.warn(`No customer linked to Yolink UAID: ${UAID}`);
      return;
    }

    const deviceName = data?.name ?? deviceType ?? 'Device';
    const message = config.message(data, deviceName);

    await this.alertsService.createAlert({
      customerId: home.customerId,
      yolinkHomeId: home.id,
      deviceId,
      deviceName,
      deviceType,
      event,
      severity: config.severity,
      message,
      rawPayload: payload,
    });
  }

  // ── Webhook registration ─────────────────────────────────────────────────────

  async registerWebhook(webhookUrl: string): Promise<any> {
    return this.yolinkRequest('Service.setWebhook', { url: webhookUrl });
  }

  async getWebhookStatus(): Promise<any> {
    return this.yolinkRequest('Service.getWebhook');
  }
}
