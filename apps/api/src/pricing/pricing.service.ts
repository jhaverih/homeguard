import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServicePrice } from './entities/service-price.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';

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
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(ServicePrice)
    private pricesRepo: Repository<ServicePrice>,
    @InjectRepository(VendorCapability)
    private capabilityRepo: Repository<VendorCapability>,
  ) {}

  async onModuleInit() {
    await this.seedPrices();
    await this.seedMonitoringService();
    await this.seedTradeServices();
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

  // Separate from seedPrices() (which only ever runs once, on an empty
  // catalog) so this safely upserts on every boot — matches how
  // VendorService.seedCapabilities() handles new capability rows.
  private async seedMonitoringService() {
    const existing = await this.pricesRepo.findOne({ where: { name: 'Home Monitoring Setup' } });
    if (existing) return;

    const capability = await this.capabilityRepo.findOne({ where: { name: 'Yolink Home Monitoring Setup' } });
    if (!capability) {
      this.logger.warn('"Yolink Home Monitoring Setup" capability not found yet — will retry seeding "Home Monitoring Setup" price on next restart.');
      return;
    }

    await this.pricesRepo.save(this.pricesRepo.create({
      name: 'Home Monitoring Setup',
      description: 'On-site installation and connection of Yolink home monitoring sensors (leak, temperature/humidity) per the customer\'s plan.',
      basePrice: 149,
      markupPercent: 0,
      priceNote: '$149 one-time',
      customerRequestable: false,
      requiredCapabilityId: capability.id,
    }));
    this.logger.log('Seeded "Home Monitoring Setup" service ($149, Yolink-capability-gated, Houmi-triggered only).');
  }

  // Separate from seedPrices() for the same reason as seedMonitoringService() —
  // idempotent per-item, safe to re-run every boot so new trade catalog items
  // and the Solar capability link both land on an already-seeded database.
  private async seedTradeServices() {
    const tradeCatalog = [
      { name: 'Roofing Repair & Replacement', description: 'Roof repair, replacement, or inspection by a licensed roofing contractor.', capabilityName: 'Roofing Contractor' },
      { name: 'Masonry Work', description: 'Brick, block, stone, and concrete masonry work.', capabilityName: 'Masonry' },
      { name: 'Renovation Project', description: 'General contracting for home renovation and remodeling projects.', capabilityName: 'Renovation / General Contracting' },
    ];

    for (const item of tradeCatalog) {
      const existing = await this.pricesRepo.findOne({ where: { name: item.name } });
      if (existing) continue;

      const capability = await this.capabilityRepo.findOne({ where: { name: item.capabilityName } });
      if (!capability) {
        this.logger.warn(`"${item.capabilityName}" capability not found yet — will retry seeding "${item.name}" price on next restart.`);
        continue;
      }

      await this.pricesRepo.save(this.pricesRepo.create({
        name: item.name,
        description: item.description,
        basePrice: 0,
        priceNote: 'Request Quote',
        requiresQuote: true,
        requiredCapabilityId: capability.id,
      }));
      this.logger.log(`Seeded "${item.name}" service (quote-based, ${item.capabilityName}-capability-gated).`);
    }

    // Solar System already exists from the original catalog seed but was never
    // capability-gated — link it now that a Solar Installation capability exists.
    const solarPrice = await this.pricesRepo.findOne({ where: { name: 'Solar System' } });
    if (solarPrice && !solarPrice.requiredCapabilityId) {
      const solarCapability = await this.capabilityRepo.findOne({ where: { name: 'Solar Installation' } });
      if (solarCapability) {
        await this.pricesRepo.update(solarPrice.id, { requiredCapabilityId: solarCapability.id });
        this.logger.log('Linked "Solar System" service to the Solar Installation capability (NABCEP-gated).');
      }
    }
  }

  async getAll(includeInactive = false): Promise<ServicePrice[]> {
    return this.pricesRepo.find(includeInactive ? {} : { where: { isActive: true } });
  }

  async findByName(name: string): Promise<ServicePrice | null> {
    return this.pricesRepo.findOne({ where: { name } });
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
