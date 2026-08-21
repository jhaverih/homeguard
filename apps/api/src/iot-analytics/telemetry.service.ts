import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository, In } from 'typeorm';
import { TelemetryEvent } from './entities/telemetry-event.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';

// Writes normalized telemetry — the provider adapter (YolinkService) hands
// off an already-normalized reading (unit conversion, e.g. °C→°F, happens
// at the adapter, once — see YolinkService's celsiusToFahrenheit) and this
// just persists it against the sensor role the device is currently
// assigned to. Only called for devices that already have a SensorAssignment
// (matches the previous SensorReading table's "tagged devices only" scope).
@Injectable()
export class TelemetryService {
  constructor(@InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>) {}

  async record(device: DeviceRegistry, assignment: SensorAssignment, value: string, numericValue: number | null, unit: string | null, rawState: Record<string, any> | null, observedAt: Date): Promise<TelemetryEvent> {
    return this.telemetryRepo.save(this.telemetryRepo.create({
      homeId: device.homeId, deviceRegistryId: device.id, provider: device.provider, providerDeviceId: device.providerDeviceId,
      sensorRole: assignment.sensorRole, measurementType: assignment.measurementType,
      value, numericValue, unit, rawState, observedAt, receivedAt: new Date(),
    }));
  }

  async getRecentSeries(deviceRegistryIds: string[], since: Date): Promise<TelemetryEvent[]> {
    if (deviceRegistryIds.length === 0) return [];
    return this.telemetryRepo.find({
      where: { deviceRegistryId: In(deviceRegistryIds), observedAt: MoreThan(since) },
      order: { observedAt: 'ASC' },
    });
  }
}
