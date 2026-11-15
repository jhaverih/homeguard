import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCapability, CertificationType } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCertification, CertificationReviewStatus } from '../vendor/entities/vendor-certification.entity';
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { VendorStateRegistration } from '../vendor/entities/vendor-state-registration.entity';
import { registrationCounts } from '../vendor/onboarding/onboarding-checklist';
import { stateForCountyFips } from '../common/utils/county.utils';
import { UsersService } from '../users/users.service';
import { getZipCentroid, getCountyFipsForZip } from '../common/utils/geo.utils';

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
    @InjectRepository(VendorStateRegistration)
    private registrationRepo: Repository<VendorStateRegistration>,
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
    const registered = await this.registeredStates(companies);

    for (const company of companies) {
      if (this.companyCoversZip(company, countyFips, false, registered)) return { available: true };
    }
    return { available: false };
  }

  // Companies within the target zip's coverage, approved. Unlike
  // checkAvailability above, a company with no serviceCounties set counts as
  // in-range (fail open) rather than being skipped — that company's location
  // data being incomplete shouldn't silently hide every service its team can
  // perform for every customer everywhere. Deliberately different from the
  // public marketing "check your zip" widget, which stays conservative on
  // purpose there.
  private async findNearbyCompanies(zip: string): Promise<VendorCompany[]> {
    const countyFips = getCountyFipsForZip(zip);
    const centroid = getZipCentroid(zip);
    const companies = await this.companyRepo.find({
      where: { applicationStatus: VendorApplicationStatus.APPROVED },
    });
    if (!countyFips && !centroid) return companies; // can't resolve the zip at all — fail open, don't hide anything

    const registered = await this.registeredStates(companies);
    return companies.filter((company) => this.companyCoversZip(company, countyFips, true, registered));
  }

  // Company id → states where it has an approved business registration (or a
  // temporary pass that hasn't run out). A company is only shown to customers
  // in those states, even if it picked counties elsewhere.
  private async registeredStates(companies: VendorCompany[]): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (!companies.length) return map;
    const now = new Date();
    const regs = await this.registrationRepo.find({
      where: { companyId: In(companies.map((c) => c.id)), status: CertificationReviewStatus.APPROVED },
    });
    for (const r of regs) {
      if (!registrationCounts(r, now)) continue;
      if (!map.has(r.companyId)) map.set(r.companyId, new Set());
      map.get(r.companyId)!.add(r.state);
    }
    return map;
  }

  // Coverage model is serviceCounties (exact county match), limited to states
  // where the company's business registration is approved. A company with no
  // counties set — or whose target zip can't be resolved to a county — defers
  // to the caller's own conservative-vs-fail-open default.
  private companyCoversZip(
    company: VendorCompany,
    countyFips: string | null,
    failOpen: boolean,
    registered: Map<string, Set<string>>,
  ): boolean {
    if (company.serviceCounties && company.serviceCounties.length > 0) {
      if (countyFips === null || !company.serviceCounties.includes(countyFips)) return false;
      const state = stateForCountyFips(countyFips);
      return !!state && !!registered.get(company.id)?.has(state);
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

  // One row per email + ZIP + audience (+ service, for in-app "notify me").
  // A repeat signup from a pro updates their company and services instead of
  // adding a duplicate.
  async notify(
    email: string,
    zip: string,
    servicePriceId?: string | null,
    extra: { audience?: 'HOMEOWNER' | 'PRO'; companyName?: string; services?: string[] } = {},
  ): Promise<{ success: boolean }> {
    const audience = extra.audience ?? 'HOMEOWNER';
    const pro = audience === 'PRO';
    const companyName = pro ? extra.companyName?.trim() || null : null;
    const services = pro ? [...new Set((extra.services ?? []).map((s) => s.trim()).filter(Boolean))] : null;

    const existing = await this.waitlistRepo.findOne({ where: { email, zipCode: zip, servicePriceId: servicePriceId ? servicePriceId : IsNull(), audience } });
    if (!existing) {
      await this.waitlistRepo.save(this.waitlistRepo.create({ email, zipCode: zip, servicePriceId: servicePriceId ?? null, audience, companyName, services }));
    } else if (pro) {
      await this.waitlistRepo.update(existing.id, { companyName: companyName ?? existing.companyName, services });
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
