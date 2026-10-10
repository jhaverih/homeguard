import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository, In } from 'typeorm';
import { TelemetryDataQuality, TelemetryEvent } from './entities/telemetry-event.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { MeasurementType } from '../common/enums/sensor-role.enum';

// Physically plausible ranges per measurement type — the same defaults as
// the PLAUSIBLE_* thresholds (threshold-definitions.ts). A reading outside
// them is stored as INVALID (audit trail) and excluded from analytics,
// rather than read as a real condition. Per-customer threshold overrides
// still drive SENSOR-003's finding; this is just the ingest-time gate.
const PLAUSIBLE: Partial<Record<MeasurementType, [number, number]>> = {
  [MeasurementType.TEMPERATURE]: [-20, 140],
  [MeasurementType.THERMOSTAT_SETPOINT]: [35, 100],
  [MeasurementType.HUMIDITY]: [0, 100],
  [MeasurementType.POWER]: [0, 5000],
};

export interface TelemetryRecordOptions {
  // When Attenteve fetched the reading from a vendor API by polling; omit
  // for pushed events (YoLink MQTT, Nest Pub/Sub).
  retrievedAt?: Date | null;
}

// Writes normalized telemetry — the provider adapter (YolinkService,
// NestService) hands off an already-normalized reading (unit conversion,
// e.g. °C→°F, happens at the adapter, once) and this persists it against
// the sensor role the device is currently assigned to. Only called for
// devices that already have a SensorAssignment.
@Injectable()
export class TelemetryService {
  constructor(@InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>) {}

  static qualityOf(measurementType: MeasurementType, numericValue: number | null): TelemetryDataQuality {
    const range = PLAUSIBLE[measurementType];
    if (numericValue == null || !range) return TelemetryDataQuality.VALID;
    if (!Number.isFinite(numericValue)) return TelemetryDataQuality.INVALID;
    return numericValue < range[0] || numericValue > range[1] ? TelemetryDataQuality.INVALID : TelemetryDataQuality.VALID;
  }

  async record(device: DeviceRegistry, assignment: SensorAssignment, value: string, numericValue: number | null, unit: string | null, rawState: Record<string, any> | null, observedAt: Date, options: TelemetryRecordOptions = {}): Promise<TelemetryEvent> {
    return this.telemetryRepo.save(this.telemetryRepo.create({
      homeId: device.homeId, deviceRegistryId: device.id, provider: device.provider, providerDeviceId: device.providerDeviceId,
      sensorRole: assignment.sensorRole, measurementType: assignment.measurementType,
      value, numericValue, unit, rawState, observedAt, retrievedAt: options.retrievedAt ?? null, receivedAt: new Date(),
      dataQuality: TelemetryService.qualityOf(assignment.measurementType, numericValue),
    }));
  }

  async getRecentSeries(deviceRegistryIds: string[], since: Date): Promise<TelemetryEvent[]> {
    if (deviceRegistryIds.length === 0) return [];
    return this.telemetryRepo.find({
      where: { deviceRegistryId: In(deviceRegistryIds), observedAt: MoreThan(since), dataQuality: TelemetryDataQuality.VALID },
      order: { observedAt: 'ASC' },
    });
  }

  async latestAny(deviceRegistryId: string): Promise<TelemetryEvent | null> {
    return this.telemetryRepo.findOne({ where: { deviceRegistryId }, order: { observedAt: 'DESC' } });
  }

  // Latest VALID reading per device — what data-quality freshness checks use.
  async latestValid(deviceRegistryId: string): Promise<TelemetryEvent | null> {
    return this.telemetryRepo.findOne({ where: { deviceRegistryId, dataQuality: TelemetryDataQuality.VALID }, order: { observedAt: 'DESC' } });
  }
}
