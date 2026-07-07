import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as mqtt from 'mqtt';
import { YolinkHome } from './entities/yolink-home.entity';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';

const YOLINK_TOKEN_URL = 'https://api.yosmart.com/open/yolink/token';
const YOLINK_API_URL  = 'https://api.yosmart.com/open/yolink/v2/api';
const MQTT_BROKER     = 'mqtt://mqtt.api.yosmart.com:8003';

const EVENT_CONFIG: Record<string, { severity: AlertSeverity; message: (d: any, name: string) => string }> = {
  'DoorSensor.Alert':        { severity: AlertSeverity.MEDIUM,   message: (d, n) => `${n}: Door/window ${d?.state === 'open' ? 'opened' : 'closed'}` },
  'DoorSensor.StatusChange': { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: ${d?.state === 'open' ? 'Opened' : 'Closed'}` },
  'LeakSensor.Alert':        { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Water leak detected!` },
  'LeakSensor.StatusChange': { severity: AlertSeverity.HIGH,     message: (d, n) => `${n}: ${d?.state === 'alert' ? 'Water leak detected!' : 'Sensor normal'}` },
  'MotionSensor.Alert':      { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Motion detected` },
  'SmokeDetector.Alert':     { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: Smoke detected! Check immediately.` },
  'COAlarm.Alert':           { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: CO alarm triggered! Evacuate immediately.` },
  'THSensor.Alert':          { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: Temp ${d?.temperature ?? '?'}°C, Humidity ${d?.humidity ?? '?'}%` },
  'VibrationSensor.Alert':   { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Vibration detected` },
  'Siren.Alert':             { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Siren activated` },
};

@Injectable()
export class YolinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YolinkService.name);
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private mqttClient: mqtt.MqttClient | null = null;

  constructor(
    @InjectRepository(YolinkHome) private homesRepo: Repository<YolinkHome>,
    private configService: ConfigService,
    private httpService: HttpService,
    private alertsService: AlertsService,
  ) {}

  async onModuleInit() {
    const uaid = this.configService.get<string>('YOLINK_UAID');
    const secret = this.configService.get<string>('YOLINK_SECRET_KEY');
    if (!uaid || !secret) {
      this.logger.warn('Yolink credentials not configured — MQTT not started. Set YOLINK_UAID and YOLINK_SECRET_KEY.');
      return;
    }
    await this.connectMqtt(uaid, secret);
  }

  onModuleDestroy() {
    this.mqttClient?.end();
  }

  // ── Token management ─────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const uaid = this.configService.get<string>('YOLINK_UAID');
    const secret = this.configService.get<string>('YOLINK_SECRET_KEY');
    if (!uaid || !secret) throw new Error('Yolink credentials not configured');

    const res = await firstValueFrom(
      this.httpService.post(
        YOLINK_TOKEN_URL,
        `grant_type=client_credentials&client_id=${uaid}&client_secret=${secret}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    this.accessToken = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async yolinkRequest(method: string, params?: any): Promise<any> {
    const token = await this.getAccessToken();
    const res = await firstValueFrom(
      this.httpService.post(YOLINK_API_URL, { method, params }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }),
    );
    if (res.data.code !== '000000') throw new Error(`Yolink API error: ${res.data.desc}`);
    return res.data.data;
  }

  // ── MQTT connection ──────────────────────────────────────────────────────────

  private async connectMqtt(uaid: string, secret: string) {
    try {
      const token = await this.getAccessToken();
      const topic = `yl-home/${uaid}/+/report`;

      this.mqttClient = mqtt.connect(MQTT_BROKER, {
        username: token,
        password: '',
        clientId: `houmi-${Date.now()}`,
        clean: true,
        reconnectPeriod: 30000,
      });

      this.mqttClient.on('connect', () => {
        this.logger.log(`Yolink MQTT connected — subscribing to ${topic}`);
        this.mqttClient!.subscribe(topic, (err) => {
          if (err) this.logger.error('MQTT subscribe error', err);
          else this.logger.log('Yolink MQTT subscribed — listening for sensor events');
        });
      });

      this.mqttClient.on('message', (_topic, raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          this.processEvent(uaid, payload).catch((e) =>
            this.logger.error('Error processing Yolink event', e),
          );
        } catch (e) {
          this.logger.warn('Could not parse Yolink MQTT message');
        }
      });

      this.mqttClient.on('error', (err) => this.logger.error('Yolink MQTT error', err.message));
      this.mqttClient.on('reconnect', () => this.logger.log('Yolink MQTT reconnecting…'));
    } catch (err) {
      this.logger.error('Failed to start Yolink MQTT connection', err.message);
    }
  }

  // ── Event processing (shared by MQTT and manual webhook trigger) ─────────────

  async processEvent(uaid: string, payload: any): Promise<void> {
    const { event, deviceId, deviceType, data } = payload;

    const config = EVENT_CONFIG[event];
    if (!config) {
      this.logger.debug(`Ignoring non-alert Yolink event: ${event}`);
      return;
    }

    const home = await this.homesRepo.findOne({ where: { yolinkUAID: uaid, isActive: true } });
    if (!home) {
      this.logger.warn(`No customer linked to Yolink UAID: ${uaid}`);
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

    this.logger.log(`Alert created for customer ${home.customerId}: [${config.severity}] ${message}`);
  }

  // ── Homes & devices (via Yolink REST API) ────────────────────────────────────

  async getYolinkHomes(): Promise<any[]> {
    const data = await this.yolinkRequest('Home.getGeneralInfo');
    return data?.homes ?? [];
  }

  async getDevicesForHome(yolinkHomeId: string): Promise<any[]> {
    const data = await this.yolinkRequest('Home.getDeviceList', { homeId: yolinkHomeId });
    return data?.devices ?? [];
  }

  // ── Linked home management ────────────────────────────────────────────────────

  async linkHomeToCustomer(customerId: string, yolinkUAID: string, homeName: string, address?: string): Promise<YolinkHome> {
    const existing = await this.homesRepo.findOne({ where: { customerId } });
    if (existing) {
      existing.yolinkUAID = yolinkUAID;
      existing.homeName = homeName;
      existing.isActive = true;
      if (address) existing.address = address;
      return this.homesRepo.save(existing);
    }
    return this.homesRepo.save(this.homesRepo.create({ customerId, yolinkUAID, homeName, address }));
  }

  async getLinkedHomes(customerId?: string): Promise<YolinkHome[]> {
    const where: any = { isActive: true };
    if (customerId) where.customerId = customerId;
    return this.homesRepo.find({ where, relations: ['customer'], order: { createdAt: 'DESC' } });
  }

  async unlinkHome(homeId: string): Promise<void> {
    await this.homesRepo.update(homeId, { isActive: false });
  }

  // ── Manual test trigger ───────────────────────────────────────────────────────

  async simulateAlert(customerId: string, eventType: string): Promise<void> {
    const home = await this.homesRepo.findOne({ where: { customerId, isActive: true } });
    const uaid = home?.yolinkUAID ?? this.configService.get('YOLINK_UAID') ?? 'test';
    await this.processEvent(uaid, {
      event: eventType,
      deviceId: 'test-device',
      deviceType: eventType.split('.')[0],
      data: { state: 'open', name: 'Test Sensor' },
    });
  }
}
