import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { getZipCentroid, haversineMiles } from '../common/utils/geo.utils';

@Injectable()
export class ServiceAreaService {
  constructor(
    @InjectRepository(VendorCompany)
    private companyRepo: Repository<VendorCompany>,
    @InjectRepository(WaitlistSignup)
    private waitlistRepo: Repository<WaitlistSignup>,
  ) {}

  // Deliberately returns only a boolean — no vendor count, identity, or
  // distance — so this public endpoint can't be scraped for coverage/
  // competitive intel about where vendors are based.
  async checkAvailability(zip: string): Promise<{ available: boolean }> {
    const target = getZipCentroid(zip);
    if (!target) return { available: false };

    const companies = await this.companyRepo.find({
      where: { applicationStatus: VendorApplicationStatus.APPROVED },
    });

    for (const company of companies) {
      if (!company.baseZipCode || !company.serviceRadiusMiles) continue;
      const base = getZipCentroid(company.baseZipCode);
      if (!base) continue;
      const distance = haversineMiles(target.lat, target.lng, base.lat, base.lng);
      if (distance <= company.serviceRadiusMiles) return { available: true };
    }
    return { available: false };
  }

  async notify(email: string, zip: string): Promise<{ success: boolean }> {
    const existing = await this.waitlistRepo.findOne({ where: { email, zipCode: zip } });
    if (!existing) {
      await this.waitlistRepo.save(this.waitlistRepo.create({ email, zipCode: zip }));
    }
    return { success: true };
  }
}
