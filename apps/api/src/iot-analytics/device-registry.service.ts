import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { ClassificationService, FixedAssignmentSpec } from './classification.service';

export interface ProviderDeviceMeta {
  deviceType?: string | null;
  model?: string | null;
  name?: string | null;
  room?: string | null;
}

// The Device Registry layer of the architecture — upserts the immutable
// (provider, providerDeviceId) identity row from whatever the provider
// adapter (YolinkService today) discovered, and kicks off classification
// for any device that isn't assigned a sensor role yet. Nothing here is
// Yolink-specific: `provider` is a plain string, so a future adapter
// (Home Assistant/Zigbee/Matter/Z-Wave) calls the exact same upsert.
@Injectable()
export class DeviceRegistryService {
  private readonly logger = new Logger(DeviceRegistryService.name);

  constructor(
    @InjectRepository(DeviceRegistry) private registryRepo: Repository<DeviceRegistry>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    private classificationService: ClassificationService,
  ) {}

  // `fixedAssignment` skips name-based classification for devices whose role
  // is known from the provider's own data model (see ClassificationService
  // .assignFixed) — without it a Nest "Upstairs Thermostat" would be fuzzy-
  // matched against the ATV installer naming convention it never follows.
  async upsertFromProvider(homeId: string, provider: string, providerDeviceId: string, meta: ProviderDeviceMeta, fixedAssignment?: FixedAssignmentSpec): Promise<DeviceRegistry> {
    const now = new Date();
    let device = await this.registryRepo.findOne({ where: { provider, providerDeviceId } });
    if (device) {
      if (meta.name != null) device.currentProviderName = meta.name;
      if (meta.room != null) device.currentProviderRoom = meta.room;
      if (meta.deviceType) device.providerDeviceType = meta.deviceType;
      if (meta.model) device.providerModel = meta.model;
      device.lastSeenAt = now;
      device = await this.registryRepo.save(device);
    } else {
      device = await this.registryRepo.save(this.registryRepo.create({
        homeId, provider, providerDeviceId,
        providerDeviceType: meta.deviceType ?? null, providerModel: meta.model ?? null,
        currentProviderName: meta.name ?? null, currentProviderRoom: meta.room ?? null,
        firstSeenAt: now, lastSeenAt: now,
      }));
    }
    const classified = fixedAssignment
      ? this.classificationService.assignFixed(device, fixedAssignment)
      : this.classificationService.classifyAndAssign(device);
    await classified.catch((e) =>
      this.logger.warn(`Classification failed for device ${device.id} (${device.currentProviderName}): ${e.message}`),
    );
    return device;
  }

  async setConnectivity(deviceRegistryIds: string[], connectivity: 'ONLINE' | 'OFFLINE' | null): Promise<void> {
    if (deviceRegistryIds.length === 0) return;
    await this.registryRepo.update({ id: In(deviceRegistryIds) }, { connectivity, connectivityAt: new Date() });
  }

  // Moves an already-assigned device to another equipment of its type (e.g.
  // a Nest zone thermostat from HVAC-01 to HVAC-02 when the homeowner has
  // separate systems) — the assignment's role is untouched.
  async reassignEquipment(deviceRegistryId: string, equipmentNumber: string): Promise<void> {
    const [device, assignment] = await Promise.all([this.findById(deviceRegistryId), this.getAssignment(deviceRegistryId)]);
    if (!device || !assignment?.equipmentId) return;
    const current = await this.classificationService.getEquipment(assignment.equipmentId);
    if (!current || current.equipmentNumber === equipmentNumber) return;
    assignment.equipmentId = await this.classificationService.ensureEquipment(device.homeId, current.equipmentType, equipmentNumber);
    await this.assignmentsRepo.save(assignment);
  }

  equipmentMetadata(homeId: string, equipmentCode: string): Promise<Record<string, any> | null> {
    return this.classificationService.equipmentMetadata(homeId, equipmentCode);
  }

  configureEquipment(homeId: string, equipmentCode: string, metadata: Record<string, any>): Promise<void> {
    return this.classificationService.mergeEquipmentMetadata(homeId, equipmentCode, metadata);
  }

  findByProviderDeviceId(provider: string, providerDeviceId: string): Promise<DeviceRegistry | null> {
    return this.registryRepo.findOne({ where: { provider, providerDeviceId } });
  }

  findById(id: string): Promise<DeviceRegistry | null> {
    return this.registryRepo.findOne({ where: { id } });
  }

  getAssignment(deviceRegistryId: string): Promise<SensorAssignment | null> {
    return this.assignmentsRepo.findOne({ where: { deviceRegistryId } });
  }

  // Convenience combo used by the ingest path — a device with no assignment
  // yet is "unclassified" and simply isn't analytics-relevant, so callers
  // treat a null result as "nothing to evaluate" rather than an error.
  async getDeviceAndAssignment(deviceRegistryId: string): Promise<{ device: DeviceRegistry; assignment: SensorAssignment } | null> {
    const device = await this.findById(deviceRegistryId);
    if (!device) return null;
    const assignment = await this.getAssignment(deviceRegistryId);
    if (!assignment) return null;
    return { device, assignment };
  }
}
