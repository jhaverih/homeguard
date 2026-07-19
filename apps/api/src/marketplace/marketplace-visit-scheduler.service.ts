import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceService } from './marketplace.service';

@Injectable()
export class MarketplaceVisitSchedulerService {
  private readonly logger = new Logger(MarketplaceVisitSchedulerService.name);

  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDueVisits() {
    const created = await this.marketplaceService.generateDueVisits();
    if (created > 0) {
      this.logger.log(`Generated ${created} Marketplace visit(s) for their next scheduled cadence.`);
    }
  }
}
