import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyCharacteristics } from './entities/property-characteristics.entity';
import { UpsertPropertyCharacteristicsDto } from './dto/upsert-property-characteristics.dto';

@Injectable()
export class PropertyCharacteristicsService {
  constructor(
    @InjectRepository(PropertyCharacteristics)
    private repo: Repository<PropertyCharacteristics>,
  ) {}

  async get(customerId: string): Promise<PropertyCharacteristics | null> {
    return this.repo.findOne({ where: { customerId } });
  }

  async upsert(customerId: string, dto: UpsertPropertyCharacteristicsDto): Promise<PropertyCharacteristics> {
    const existing = await this.repo.findOne({ where: { customerId } });
    if (existing) {
      this.repo.merge(existing, dto);
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ ...dto, customerId }));
  }
}
