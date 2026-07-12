import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServicePrice } from './entities/service-price.entity';

const NEW_CATALOG = [
  {
    name: 'Additional Inspection',
    description: 'Add-on inspection visit outside subscription plan',
    basePrice: 40,
    priceNote: '$40',
  },
  {
    name: 'Gutters Inspection & Cleaning',
    description: 'Full gutter inspection and debris removal',
    basePrice: 100,
    priceNote: '$100',
  },
  {
    name: 'Replace Bulbs (included in inspection)',
    description: 'Bulb replacement during a scheduled inspection visit',
    basePrice: 5.75,
    priceNote: '$5.75/bulb',
  },
  {
    name: 'Replace Bulbs (not included)',
    description: 'Standalone bulb replacement — includes trip fee',
    basePrice: 125,
    priceNote: '$125 trip fee + $5.75/bulb',
  },
  {
    name: 'HVAC Full Inspection',
    description: 'Comprehensive HVAC system inspection by certified technician',
    basePrice: 175,
    priceNote: '$175',
  },
  {
    name: 'Solar System',
    description: 'Solar panel inspection and performance review',
    basePrice: 0,
    priceNote: 'Request Quote',
    requiresQuote: true,
  },
  {
    name: 'Replace AC Unit',
    description: 'Full AC unit replacement — sizing and installation',
    basePrice: 0,
    priceNote: 'Request Quote',
    requiresQuote: true,
  },
  {
    name: 'Drywall Repair, Patching & Painting',
    description: 'Drywall repair and touch-up painting',
    basePrice: 150,
    priceNote: '$150 trip fee + $/sqft',
  },
  {
    name: 'Move Furniture',
    description: 'Furniture moving assistance',
    basePrice: 75,
    priceNote: '$75/hr',
  },
  {
    name: 'Driveway & Patio Power Wash',
    description: 'High-pressure cleaning of driveway and patio surfaces',
    basePrice: 75,
    priceNote: '$75/hr',
  },
];

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
    const existing = await this.pricesRepo.findOne({ where: { name: 'Additional Inspection' } });
    if (existing) return;

    // Remove old catalog
    await this.pricesRepo.createQueryBuilder().delete().execute();

    for (const item of NEW_CATALOG) {
      await this.pricesRepo.save(this.pricesRepo.create(item));
    }
  }

  async getAll(includeInactive = false): Promise<ServicePrice[]> {
    return this.pricesRepo.find(includeInactive ? {} : { where: { isActive: true } });
  }

  async update(id: string, data: Partial<ServicePrice>): Promise<ServicePrice> {
    await this.pricesRepo.update(id, data);
    return this.pricesRepo.findOne({ where: { id } });
  }

  async create(data: Partial<ServicePrice>): Promise<ServicePrice> {
    return this.pricesRepo.save(this.pricesRepo.create(data));
  }

  async remove(id: string): Promise<void> {
    await this.pricesRepo.delete(id);
  }
}
