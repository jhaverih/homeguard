import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Home } from './entities/home.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { YolinkDevice } from '../yolink/entities/yolink-device.entity';
import { DeviceRegistryService } from './device-registry.service';

// One-time (idempotent) backfill for data that predates the provider-
// agnostic model — runs at every boot, no-ops once everything's migrated.
// Schema changes themselves are handled by TypeORM's synchronize (staging
// runs NODE_ENV=staging, not "production", so synchronize stays on); this
// only handles moving DATA into the new shape, which synchronize can't do:
//   - one Home row per existing YolinkHome (backfills YolinkHome.homeId)
//   - one DeviceRegistry row per existing YolinkDevice, which also
//     triggers classification (ClassificationService, via
//     DeviceRegistryService.upsertFromProvider) so the 3 already-installed,
//     already-named sensors get their SensorAssignment/Equipment rows
//     created automatically from the same name they already carry.
@Injectable()
export class IotAnalyticsMigrationService implements OnModuleInit {
  private readonly logger = new Logger(IotAnalyticsMigrationService.name);

  constructor(
    @InjectRepository(Home) private homeRepo: Repository<Home>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    @InjectRepository(YolinkDevice) private yolinkDevicesRepo: Repository<YolinkDevice>,
    @InjectRepository(DeviceRegistry) private deviceRegistryRepo: Repository<DeviceRegistry>,
    private deviceRegistryService: DeviceRegistryService,
  ) {}

  async onModuleInit() {
    await this.backfillHomes().catch((e) => this.logger.warn(`Home backfill failed: ${e.message}`));
    await this.backfillDeviceRegistry().catch((e) => this.logger.warn(`DeviceRegistry backfill failed: ${e.message}`));
  }

  // Called both by the boot-time backfill below and by YolinkService going
  // forward (linkHomeToCustomer) — a YolinkHome should never sit without its
  // provider-agnostic Home counterpart for longer than the request that
  // created/found it.
  async ensureHomeId(yolinkHome: YolinkHome): Promise<string> {
    if (yolinkHome.homeId) return yolinkHome.homeId;
    const home = await this.homeRepo.save(this.homeRepo.create({
      customerId: yolinkHome.customerId, name: yolinkHome.homeName,
      address: yolinkHome.address ? { raw: yolinkHome.address } : null,
    }));
    await this.yolinkHomesRepo.update(yolinkHome.id, { homeId: home.id });
    yolinkHome.homeId = home.id;
    return home.id;
  }

  private async backfillHomes(): Promise<void> {
    const homes = await this.yolinkHomesRepo.find({ where: { homeId: IsNull() } });
    for (const home of homes) await this.ensureHomeId(home);
    if (homes.length > 0) this.logger.log(`Backfilled ${homes.length} provider-agnostic Home row(s) from existing YolinkHome records.`);
  }

  private async backfillDeviceRegistry(): Promise<void> {
    const devices = await this.yolinkDevicesRepo.find({ where: { deviceRegistryId: IsNull() } });
    let migrated = 0;
    for (const dev of devices) {
      const yolinkHome = await this.yolinkHomesRepo.findOne({ where: { id: dev.yolinkHomeId } });
      if (!yolinkHome) continue;
      const homeId = await this.ensureHomeId(yolinkHome);
      const registry = await this.deviceRegistryService.upsertFromProvider(homeId, 'yolink', dev.deviceId, {
        deviceType: dev.deviceType, name: dev.name,
      });
      dev.deviceRegistryId = registry.id;
      await this.yolinkDevicesRepo.save(dev);
      migrated++;
    }
    if (migrated > 0) this.logger.log(`Backfilled ${migrated} DeviceRegistry row(s) from existing YolinkDevice records (auto-classification ran for each).`);
  }
}
