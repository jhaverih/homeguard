import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminService } from './admin.service';

@Injectable()
export class VendorSchedulerService {
  private readonly logger = new Logger(VendorSchedulerService.name);

  constructor(private readonly adminService: AdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleVendorDowngradeCheck() {
    const result = await this.adminService.runVendorDowngradeCheck();
    if (result.downgraded > 0) {
      this.logger.log(`Downgraded ${result.downgraded} vendor(s) from Elite to Standard (expired plans)`);
    }
  }
}
