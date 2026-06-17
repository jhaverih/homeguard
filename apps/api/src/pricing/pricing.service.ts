import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServicePrice } from './entities/service-price.entity';

@Injectable()
export class PricingService implements OnModuleInit {
  constructor(
    @InjectRepository(ServicePrice)
    private pricesRepo: Repository<ServicePrice>,
  ) {}

  async onModuleInit() {
    await this.seedPrices();
  }

  private async seedPrices() {
    const count = await this.pricesRepo.count();
    if (count > 0) return;

    const defaultPrices = [
      { name: 'AC Filter Replacement', description: 'Replace standard AC air filter', basePrice: 45 },
      { name: 'Toilet Leak Check', description: 'Inspect and verify toilet water connections', basePrice: 35 },
      { name: 'Light Bulb Replacement', description: 'Replace up to 5 light bulbs', basePrice: 30 },
      { name: 'AC Drainage Pan Inspection', description: 'Inspect and clean AC drainage pan', basePrice: 65 },
      { name: 'Washer Pan Inspection', description: 'Inspect washer machine drain pan', basePrice: 55 },
      { name: 'HVAC Full Inspection', description: 'Comprehensive HVAC system inspection', basePrice: 150 },
      { name: 'Additional Light Bulbs (per 5)', description: 'Beyond the initial 5 bulbs', basePrice: 25 },
    ];

    for (const price of defaultPrices) {
      await this.pricesRepo.save(this.pricesRepo.create(price));
    }
  }

  async getAll(): Promise<ServicePrice[]> {
    return this.pricesRepo.find({ where: { isActive: true } });
  }

  async update(id: string, data: Partial<ServicePrice>): Promise<ServicePrice> {
    await this.pricesRepo.update(id, data);
    return this.pricesRepo.findOne({ where: { id } });
  }

  async create(data: Partial<ServicePrice>): Promise<ServicePrice> {
    return this.pricesRepo.save(this.pricesRepo.create(data));
  }
}
