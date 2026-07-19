import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCapability, CertificationType } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCertification, CertificationReviewStatus } from '../vendor/entities/vendor-certification.entity';
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { UsersService } from '../users/users.service';
import { getZipCentroid, getCountyFipsForZip, haversineMiles } from '../common/utils/geo.utils';

@Injectable()
export class ServiceAreaService {
  constructor(
    @InjectRepository(VendorCompany)
    private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorProfile)
    private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCapability)
    private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorCapabilitySelection)
    private capabilitySelectionRepo: Repository<VendorCapabilitySelection>,
    @InjectRepository(VendorCertification)
    private certificationRepo: Repository<VendorCertification>,
    @InjectRepository(WaitlistSignup)
    private waitlistRepo: Repository<WaitlistSignup>,
    private usersService: UsersService,
  ) {}

  // Deliberately returns only a boolean — no vendor count, identity, or
  // distance — so this public endpoint can't be scraped for coverage/
  // competitive intel about where vendors are based.
  async checkAvailability(zip: string): Promise<{ available: boolean }> {
    const countyFips = getCountyFipsForZip(zip);
    const centroid = getZipCentroid(zip);
    if (!countyFips && !centroid) return { available: false };

    const companies = await this.companyRepo.find({
      where: { applicationStatus: VendorApplicationStatus.APPROVED },
    });

    for (const company of companies) {
      if (this.companyCoversZip(company, countyFips, centroid, false)) return { available: true };
    }
    return { available: false };
  }

  // Companies within the target zip's coverage, approved. Unlike
  // checkAvailability above, a company with no serviceCounties/legacy
  // baseZipCode+radius set counts as in-range (fail open) rather than being
  // skipped — that company's location data being incomplete shouldn't
  // silently hide every service its team can perform for every customer
  // everywhere. Deliberately different from the public marketing "check your
  // zip" widget, which stays conservative on purpose there.
  private async findNearbyCompanies(zip: string): Promise<VendorCompany[]> {
    const countyFips = getCountyFipsForZip(zip);
    const centroid = getZipCentroid(zip);
    const companies = await this.companyRepo.find({
      where: { applicationStatus: VendorApplicationStatus.APPROVED },
    });
    if (!countyFips && !centroid) return companies; // can't resolve the zip at all — fail open, don't hide anything

    return companies.filter((company) => this.companyCoversZip(company, countyFips, centroid, true));
  }

  // Primary coverage model is serviceCounties (exact county match). A
  // company that hasn't migrated yet falls back to the legacy
  // baseZipCode+serviceRadiusMiles haversine check. A company with neither
  // set — or whose data can't be resolved against these ZIP datasets —
  // defers to the caller's own conservative-vs-fail-open default.
  private companyCoversZip(
    company: VendorCompany,
    countyFips: string | null,
    centroid: { lat: number; lng: number } | null,
    failOpen: boolean,
  ): boolean {
    if (company.serviceCounties && company.serviceCounties.length > 0) {
      return countyFips !== null && company.serviceCounties.includes(countyFips);
    }
    if (company.baseZipCode && company.serviceRadiusMiles) {
      const base = getZipCentroid(company.baseZipCode);
      if (base && centroid) {
        return haversineMiles(centroid.lat, centroid.lng, base.lat, base.lng) <= company.serviceRadiusMiles;
      }
    }
    return failOpen;
  }

  // The set of capability IDs some vendor team within range of `zip` can
  // actually perform — mirrors the same "unlocked capability" eligibility
  // ServiceRequestsService.getEligiblePendingRequests computes per-vendor for
  // job-matching, re-keyed by zip instead of by a specific pending job. Used
  // to filter the customer-facing catalog (see PricingController's
  // /pricing/available) so a service nobody nearby can perform isn't shown
  // to browse/search in the first place.
  async getAvailableCapabilityIds(zip: string): Promise<Set<string>> {
    const companies = await this.findNearbyCompanies(zip);
    const companyIds = companies.map((c) => c.id);
    if (companyIds.length === 0) return new Set();

    const profiles = await this.vendorProfileRepo.find({ where: { companyId: In(companyIds) } });
    if (profiles.length === 0) return new Set();

    const companyById = new Map(companies.map((c) => [c.id, c]));
    const userIds = profiles.map((p) => p.userId);

    const [selections, approvedCerts, capabilities] = await Promise.all([
      this.capabilitySelectionRepo.find({ where: { userId: In(userIds) } }),
      this.certificationRepo.find({
        where: { userId: In(userIds), status: CertificationReviewStatus.APPROVED, expirationDate: MoreThan(new Date()) },
      }),
      this.capabilityRepo.find(),
    ]);
    const capabilityMap = new Map(capabilities.map((c) => [c.id, c]));
    // Per-user approved certification types, not global — a certification
    // only unlocks a capability for the vendor who holds it.
    const certTypesByUser = new Map<string, Set<CertificationType>>();
    for (const cert of approvedCerts) {
      if (!certTypesByUser.has(cert.userId)) certTypesByUser.set(cert.userId, new Set());
      certTypesByUser.get(cert.userId)!.add(cert.certificationType);
    }
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const available = new Set<string>();
    for (const selection of selections) {
      if (available.has(selection.capabilityId)) continue;
      const capability = capabilityMap.get(selection.capabilityId);
      if (!capability || !capability.isActive) continue;

      if (capability.requiredCertificationType === CertificationType.NONE) {
        available.add(capability.id);
        continue;
      }

      const profile = profileByUser.get(selection.userId);
      const company = profile?.companyId ? companyById.get(profile.companyId) : null;
      const isElite = company?.planTier === 'ELITE';
      const hasCert = certTypesByUser.get(selection.userId)?.has(capability.requiredCertificationType);
      if (isElite && hasCert) available.add(capability.id);
    }

    return available;
  }

  // Convenience wrapper for authenticated customer-facing calls — resolves
  // the customer's own saved zip instead of requiring the client to send
  // one. Returns 'all' (meaning: don't filter anything) if the customer has
  // no zip on file yet — same fail-open reasoning as findNearbyCompanies.
  async getAvailableCapabilityIdsForCustomer(customerId: string): Promise<Set<string> | 'all'> {
    const user = await this.usersService.findById(customerId);
    const zip = user.customerProfile?.zipCode;
    if (!zip) return 'all';
    return this.getAvailableCapabilityIds(zip);
  }

  async notify(email: string, zip: string, servicePriceId?: string | null): Promise<{ success: boolean }> {
    const existing = await this.waitlistRepo.findOne({ where: { email, zipCode: zip, servicePriceId: servicePriceId ?? null } });
    if (!existing) {
      await this.waitlistRepo.save(this.waitlistRepo.create({ email, zipCode: zip, servicePriceId: servicePriceId ?? null }));
    }
    return { success: true };
  }

  // Authenticated in-app "notify me" — reuses the customer's own account
  // email/zip instead of asking them to re-enter it like the anonymous
  // marketing-site widget does.
  async notifyForService(customerId: string, servicePriceId: string): Promise<{ success: boolean }> {
    const user = await this.usersService.findById(customerId);
    if (!user.email || !user.customerProfile?.zipCode) return { success: false };
    return this.notify(user.email, user.customerProfile.zipCode, servicePriceId);
  }
}
