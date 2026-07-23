import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { MarketplaceCleaningPlan } from './entities/marketplace-cleaning-plan.entity';
import { MarketplaceRoomUnit } from './entities/marketplace-room-unit.entity';
import { MarketplaceConditionMultiplier } from './entities/marketplace-condition-multiplier.entity';
import { MarketplaceAddOn } from './entities/marketplace-add-on.entity';
import { MarketplaceFrequencyDiscount } from './entities/marketplace-frequency-discount.entity';
import { MarketplaceSubscription } from './entities/marketplace-subscription.entity';
import { MarketplaceSubscriptionEvent } from './entities/marketplace-subscription-event.entity';
import { MarketplaceLawncareService } from './entities/marketplace-lawncare-service.entity';
import { MarketplaceLawncarePackage } from './entities/marketplace-lawncare-package.entity';
import { MarketplaceLawncarePackageSubscription } from './entities/marketplace-lawncare-package-subscription.entity';
import { MarketplaceLawncareServiceSubscription } from './entities/marketplace-lawncare-service-subscription.entity';
import { MarketplaceLawncarePropertyProfile } from './entities/marketplace-lawncare-property-profile.entity';
import { MarketplaceLawncarePropertyDetailField } from './entities/marketplace-lawncare-property-detail-field.entity';
import { MarketplaceHouseCleaningPropertyProfile } from './entities/marketplace-house-cleaning-property-profile.entity';
import { MarketplacePestService } from './entities/marketplace-pest-service.entity';
import { MarketplacePestPackage } from './entities/marketplace-pest-package.entity';
import { MarketplacePestPackageSubscription } from './entities/marketplace-pest-package-subscription.entity';
import { MarketplacePestPropertyProfile } from './entities/marketplace-pest-property-profile.entity';
import {
  CleaningType, VisitFrequency, MarketplaceSubscriptionStatus, MarketplaceEventType,
} from './enums/marketplace.enum';
import {
  computeBCU, computeConditionMultiplier, computeAddOnsTotal, computePerVisitCost,
  computeMonthlySubscriptionPrice, QUOTE_REQUIRED,
} from './marketplace-pricing.utils';
import { computeLawncareServicePrice, resolveServiceQty, isManualQtyService, isSubscribableFrequency } from './marketplace-lawncare-pricing.utils';
import { computePestServicePrice, resolvePestServiceQty, resolvePestServiceQty2, isManualQtyPestService } from './marketplace-pest-pricing.utils';
import { QuoteHouseCleaningDto } from './dto/quote-house-cleaning.dto';
import {
  QuoteLawncareDto, BookLawncareServiceDto, SubscribeLawncarePackageDto, SubscribeLawncareServiceDto, UpsertLawncarePropertyProfileDto,
} from './dto/quote-lawncare.dto';
import {
  QuotePestDto, BookPestServiceDto, SubscribePestPackageDto, UpsertPestPropertyProfileDto,
} from './dto/quote-pest.dto';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';
import { ServiceCategory } from '../common/enums/service-category.enum';
import { ServiceGroup } from '../common/enums/service-group.enum';
import { PricingMethod } from '../common/enums/pricing-method.enum';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';

export const CLEANING_SERVICES_CAPABILITY_NAME = 'Cleaning Services';
export const HOUSE_CLEANING_CATALOG_NAME = 'House Cleaning';
export const LAWN_CARE_CAPABILITY_NAME = 'Lawn & Landscaping';
export const LAWNCARE_CATALOG_NAME = 'Lawncare Subscription';
export const PEST_CONTROL_CAPABILITY_NAME = 'Pest Control';
export const PEST_CONTROL_CATALOG_NAME = 'Pest Control Subscription';

export interface HouseCleaningQuote {
  perVisitCost: number;
  monthlyPrice: number | null;
  quoteRequired: boolean;
}

function advanceVisitDate(from: Date, frequency: VisitFrequency): Date {
  const next = new Date(from);
  if (frequency === VisitFrequency.WEEKLY) next.setDate(next.getDate() + 7);
  else if (frequency === VisitFrequency.BIWEEKLY) next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

@Injectable()
export class MarketplaceService implements OnModuleInit {
  private stripe: Stripe;
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceCleaningPlan) private plansRepo: Repository<MarketplaceCleaningPlan>,
    @InjectRepository(MarketplaceRoomUnit) private roomUnitsRepo: Repository<MarketplaceRoomUnit>,
    @InjectRepository(MarketplaceConditionMultiplier) private conditionsRepo: Repository<MarketplaceConditionMultiplier>,
    @InjectRepository(MarketplaceAddOn) private addOnsRepo: Repository<MarketplaceAddOn>,
    @InjectRepository(MarketplaceFrequencyDiscount) private frequencyDiscountsRepo: Repository<MarketplaceFrequencyDiscount>,
    @InjectRepository(MarketplaceSubscription) private subscriptionsRepo: Repository<MarketplaceSubscription>,
    @InjectRepository(MarketplaceSubscriptionEvent) private eventsRepo: Repository<MarketplaceSubscriptionEvent>,
    @InjectRepository(MarketplaceLawncareService) private lawncareServicesRepo: Repository<MarketplaceLawncareService>,
    @InjectRepository(MarketplaceLawncarePackage) private lawncarePackagesRepo: Repository<MarketplaceLawncarePackage>,
    @InjectRepository(MarketplaceLawncarePackageSubscription) private lawncarePackageSubscriptionsRepo: Repository<MarketplaceLawncarePackageSubscription>,
    @InjectRepository(MarketplaceLawncareServiceSubscription) private lawncareServiceSubscriptionsRepo: Repository<MarketplaceLawncareServiceSubscription>,
    @InjectRepository(MarketplaceLawncarePropertyProfile) private lawncarePropertyProfileRepo: Repository<MarketplaceLawncarePropertyProfile>,
    @InjectRepository(MarketplaceLawncarePropertyDetailField) private lawncarePropertyDetailFieldsRepo: Repository<MarketplaceLawncarePropertyDetailField>,
    @InjectRepository(MarketplaceHouseCleaningPropertyProfile) private houseCleaningPropertyProfileRepo: Repository<MarketplaceHouseCleaningPropertyProfile>,
    @InjectRepository(MarketplacePestService) private pestServicesRepo: Repository<MarketplacePestService>,
    @InjectRepository(MarketplacePestPackage) private pestPackagesRepo: Repository<MarketplacePestPackage>,
    @InjectRepository(MarketplacePestPackageSubscription) private pestPackageSubscriptionsRepo: Repository<MarketplacePestPackageSubscription>,
    @InjectRepository(MarketplacePestPropertyProfile) private pestPropertyProfileRepo: Repository<MarketplacePestPropertyProfile>,
    @InjectRepository(VendorCapability) private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(ServicePrice) private servicePriceRepo: Repository<ServicePrice>,
    private configService: ConfigService,
    private usersService: UsersService,
    private subscriptionsService: SubscriptionsService,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => ServiceRequestsService))
    private serviceRequestsService: ServiceRequestsService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), { apiVersion: '2024-04-10' });
  }

  async onModuleInit() {
    await this.seedConfig();
    await this.seedCapabilityAndCatalog();
    await this.seedLawncareConfig();
    await this.seedLawncareCapabilityAndCatalog();
    await this.seedPestConfig();
    await this.seedPestCapabilityAndCatalog();
  }

  // ── Seeding ────────────────────────────────────────────────────────────

  private async seedConfig() {
    const plans: Partial<MarketplaceCleaningPlan>[] = [
      {
        cleaningType: CleaningType.STANDARD, costPerUnit: 13, retailPerUnit: 24,
        allowedFrequencies: [VisitFrequency.ONE_TIME, VisitFrequency.MONTHLY, VisitFrequency.BIWEEKLY, VisitFrequency.WEEKLY],
        defaultFrequency: VisitFrequency.MONTHLY,
      },
      {
        cleaningType: CleaningType.DEEP, costPerUnit: 20, retailPerUnit: 34,
        allowedFrequencies: [VisitFrequency.ONE_TIME, VisitFrequency.MONTHLY, VisitFrequency.BIWEEKLY, VisitFrequency.WEEKLY],
        defaultFrequency: VisitFrequency.MONTHLY,
      },
      {
        cleaningType: CleaningType.MOVE_OUT, costPerUnit: 25, retailPerUnit: 42,
        allowedFrequencies: [VisitFrequency.ONE_TIME],
        defaultFrequency: VisitFrequency.ONE_TIME,
      },
    ];
    for (const p of plans) {
      const existing = await this.plansRepo.findOne({ where: { cleaningType: p.cleaningType } });
      if (!existing) await this.plansRepo.save(this.plansRepo.create(p));
    }

    const roomUnits: Partial<MarketplaceRoomUnit>[] = [
      { key: 'bedroom', label: 'Bedroom', units: 1.0, sortOrder: 1 },
      { key: 'bathroom_full', label: 'Bathroom (full)', units: 1.5, sortOrder: 2 },
      { key: 'bathroom_half', label: 'Half Bathroom', units: 0.75, sortOrder: 3 },
      { key: 'kitchen', label: 'Kitchen', units: 2.0, sortOrder: 4 },
      { key: 'loft_bonus', label: 'Loft / Bonus Room', units: 1.0, sortOrder: 5 },
      { key: 'office', label: 'Office', units: 0.75, sortOrder: 6 },
      { key: 'dining_room', label: 'Dining Room', units: 0.5, sortOrder: 7 },
      { key: 'finished_basement', label: 'Finished Basement', units: 2.0, sortOrder: 8 },
      { key: 'additional_living_room', label: 'Living Room', units: 1.0, sortOrder: 9 },
      { key: 'stairs_flight', label: 'Stairs (per flight)', units: 0.5, sortOrder: 10 },
    ];
    for (const r of roomUnits) {
      const existing = await this.roomUnitsRepo.findOne({ where: { key: r.key } });
      if (!existing) await this.roomUnitsRepo.save(this.roomUnitsRepo.create(r));
    }

    const conditions: Partial<MarketplaceConditionMultiplier>[] = [
      { key: 'well_maintained', label: 'Well Maintained', multiplier: 1.0, isBaseTier: true, sortOrder: 1 },
      { key: 'average', label: 'Average', multiplier: 1.1, isBaseTier: true, sortOrder: 2 },
      { key: 'not_cleaned_3mo', label: 'Not Cleaned in 3+ Months', multiplier: 1.25, isBaseTier: true, sortOrder: 3 },
      { key: 'has_pets', label: 'Has Pets', multiplier: 1.15, isBaseTier: false, sortOrder: 4 },
      { key: 'heavy_pet_hair', label: 'Heavy Pet Hair', multiplier: 1.25, isBaseTier: false, sortOrder: 5 },
      { key: 'has_children', label: 'Has Children', multiplier: 1.10, isBaseTier: false, sortOrder: 6 },
      { key: 'hoarding', label: 'Hoarding / Severe Dirt', multiplier: 1.0, isBaseTier: false, forcesQuote: true, sortOrder: 7 },
    ];
    for (const c of conditions) {
      const existing = await this.conditionsRepo.findOne({ where: { key: c.key } });
      if (!existing) await this.conditionsRepo.save(this.conditionsRepo.create(c));
    }

    const addOns: Partial<MarketplaceAddOn>[] = [
      { key: 'pet_hair', label: 'Pet Hair', subCost: 27.5, customerPrice: 39, sortOrder: 1 },
      { key: 'interior_windows', label: 'Interior Windows', subCost: 3, customerPrice: 7, perUnit: true, unitLabel: 'window', sortOrder: 2 },
      { key: 'refrigerator', label: 'Refrigerator', subCost: 25, customerPrice: 45, sortOrder: 3 },
      { key: 'oven', label: 'Oven', subCost: 27.5, customerPrice: 45, sortOrder: 4 },
      { key: 'laundry', label: 'Laundry', subCost: 27.5, customerPrice: 45, sortOrder: 5 },
      { key: 'dishes', label: 'Dishes', subCost: 20, customerPrice: 35, sortOrder: 6 },
      { key: 'bed_linen', label: 'Bed Linen Change', subCost: 5, customerPrice: 15, perUnit: true, unitLabel: 'bed', sortOrder: 7 },
      { key: 'balcony_patio', label: 'Balcony/Patio', subCost: 22.5, customerPrice: 35, sortOrder: 8 },
    ];
    for (const a of addOns) {
      const existing = await this.addOnsRepo.findOne({ where: { key: a.key } });
      if (!existing) await this.addOnsRepo.save(this.addOnsRepo.create(a));
    }

    const discounts: Partial<MarketplaceFrequencyDiscount>[] = [
      { frequency: VisitFrequency.MONTHLY, discountPercent: 0 },
      { frequency: VisitFrequency.BIWEEKLY, discountPercent: 10 },
      { frequency: VisitFrequency.WEEKLY, discountPercent: 15 },
    ];
    for (const d of discounts) {
      const existing = await this.frequencyDiscountsRepo.findOne({ where: { frequency: d.frequency } });
      if (!existing) await this.frequencyDiscountsRepo.save(this.frequencyDiscountsRepo.create(d));
    }
  }

  // Creates the "Cleaning Services" vendor capability (notifying every active
  // vendor, same as any admin-created capability) and one browsable/
  // searchable "House Cleaning" catalog row gated on it — see
  // marketplace-cleaning-plan/etc. for the actual pricing, this row's own
  // price fields are unused placeholders.
  private async seedCapabilityAndCatalog() {
    let capability = await this.capabilityRepo.findOne({ where: { name: CLEANING_SERVICES_CAPABILITY_NAME } });
    if (!capability) {
      capability = await this.capabilityRepo.save(this.capabilityRepo.create({ name: CLEANING_SERVICES_CAPABILITY_NAME }));
      const vendors = await this.usersService.findAllActiveVendors();
      if (vendors.length > 0) {
        await this.notificationsService.notifyVendors(
          vendors, NotificationType.NEW_CAPABILITY_AVAILABLE, 'New Capability Available',
          `"${capability.name}" has been added — update your profile if you'd like to offer it.`,
          { screen: 'capabilities' },
        ).catch(() => {});
      }
    }

    const existing = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!existing) {
      await this.servicePriceRepo.save(this.servicePriceRepo.create({
        name: HOUSE_CLEANING_CATALOG_NAME,
        description: 'Recurring house cleaning, tailored to your home and schedule.',
        basePrice: 0,
        pricingMethod: PricingMethod.FLAT_PRICE,
        category: ServiceCategory.HOUSE_CLEANING,
        serviceGroups: [ServiceGroup.MARKETPLACE],
        customerRequestable: true,
        requiredCapabilityId: capability.id,
      }));
    }
  }

  // Transcribed verbatim from the source pricing sheet. `subCostBase`/
  // `customerPriceBase` are 0 for pure per-unit services (Sod/Gravel/Plant
  // Installation) and for Drainage Correction/Seasonal Maintenance the
  // "per unit" fields are 0 since those are flat per-project/per-month
  // prices with no additional-unit component.
  private async seedLawncareConfig() {
    const services: Partial<MarketplaceLawncareService>[] = [
      { key: 'lawn_mowing', label: 'Lawn Mowing', pricingUnit: 'Per Visit', includedQty: 0, recommendedFrequency: 'Weekly/Biweekly (Apr–Oct); as-needed (Nov–Mar)', subCostBase: 35, subCostPerUnit: 5, customerPriceBase: 60, customerPricePerUnit: 8, volumeDiscountText: 'Weekly: 15%, Biweekly: 5%', frequencyDiscounts: [
        { frequency: 'MONTHLY', label: 'Monthly', ratePercent: 0, description: 'Pay per visit, no recurring commitment' },
        { frequency: 'WEEKLY', label: 'Weekly', ratePercent: 15, visitsPerYear: 52, description: 'Weekly visits Apr–Oct, as-needed Nov–Mar' },
        { frequency: 'BIWEEKLY', label: 'Biweekly', ratePercent: 5, visitsPerYear: 26, description: 'Biweekly visits Apr–Oct, as-needed Nov–Mar' },
      ], sortOrder: 1 },
      { key: 'mulch_installation', label: 'Bed Mulching', pricingUnit: 'First 3 CY', includedQty: 3, recommendedFrequency: '1× per year', subCostBase: 80, subCostPerUnit: 20, customerPriceBase: 140, customerPricePerUnit: 35, volumeDiscountText: '10+ CY: 10%', volumeDiscountThreshold1: 10, volumeDiscountRate1: 10, sortOrder: 2 },
      { key: 'shrub_trimming', label: 'Shrub Trimming', pricingUnit: 'First 5 shrubs', includedQty: 5, recommendedFrequency: '2–4× per year', subCostBase: 70, subCostPerUnit: 10, customerPriceBase: 125, customerPricePerUnit: 20, volumeDiscountText: '20+ shrubs: 10%', volumeDiscountThreshold1: 20, volumeDiscountRate1: 10, sortOrder: 3 },
      // Seasonal Package discount is no longer customer-selectable — it
      // activates automatically only for customers with an active Seasonal
      // Maintenance Package subscription (membershipBenefit below), same
      // mechanism as Pest Control's "Included with Ultimate" etc.
      { key: 'leaf_removal', label: 'Leaf Removal', pricingUnit: 'First 5,000 SF', includedQty: 5000, recommendedFrequency: '2–6× per Fall', subCostBase: 85, subCostPerUnit: 12, customerPriceBase: 150, customerPricePerUnit: 20, volumeDiscountText: '15% off with an active Seasonal Maintenance Package', frequencyDiscounts: [], membershipBenefit: { requiredPackageKeys: ['premium_landscape_care'], type: 'PERCENT_OFF', ratePercent: 15 }, sortOrder: 4 },
      // Always monthly — no other cadence exists for this service, so there's
      // no real discount tradeoff to offer; kept at 0% intentionally.
      { key: 'bed_weeding', label: 'Bed Weeding', pricingUnit: 'First 200 SF', includedQty: 200, recommendedFrequency: 'Monthly', subCostBase: 60, subCostPerUnit: 0.15, customerPriceBase: 100, customerPricePerUnit: 0.30, volumeDiscountText: 'Always billed monthly', frequencyDiscounts: [{ frequency: 'MONTHLY', label: 'Monthly', ratePercent: 0 }], sortOrder: 5 },
      { key: 'sod_installation', label: 'Sod Installation', pricingUnit: 'Per SF', includedQty: 0, recommendedFrequency: 'One-time', subCostBase: 0, subCostPerUnit: 1.10, customerPriceBase: 0, customerPricePerUnit: 1.95, volumeDiscountText: '5,000+ SF: 10%; 10,000+ SF: 15%', volumeDiscountThreshold1: 5000, volumeDiscountRate1: 10, volumeDiscountThreshold2: 10000, volumeDiscountRate2: 15, sortOrder: 6 },
      { key: 'plant_installation', label: 'Plant Installation', pricingUnit: 'Per Plant', includedQty: 0, recommendedFrequency: 'As needed', subCostBase: 0, subCostPerUnit: 35, customerPriceBase: 0, customerPricePerUnit: 60, volumeDiscountText: '20+ plants: 10%; 50+: 15%', volumeDiscountThreshold1: 20, volumeDiscountRate1: 10, volumeDiscountThreshold2: 50, volumeDiscountRate2: 15, sortOrder: 7 },
      { key: 'gravel_rock_installation', label: 'Gravel/Rock Installation', pricingUnit: 'Per SF', includedQty: 0, recommendedFrequency: 'One-time', subCostBase: 0, subCostPerUnit: 1.75, customerPriceBase: 0, customerPricePerUnit: 3.00, volumeDiscountText: '2,000+ SF: 10%', volumeDiscountThreshold1: 2000, volumeDiscountRate1: 10, sortOrder: 8 },
      { key: 'spring_cleanup', label: 'Spring Cleanup', pricingUnit: 'Per Project', includedQty: 0, recommendedFrequency: 'Annually', subCostBase: 180, subCostPerUnit: 20, customerPriceBase: 300, customerPricePerUnit: 40, volumeDiscountText: 'Annual package: 15%', frequencyDiscounts: [{ frequency: 'ANNUAL_PACKAGE', label: 'Annual Package', ratePercent: 15 }], sortOrder: 9 },
      { key: 'seasonal_maintenance', label: 'Seasonal Maintenance', pricingUnit: 'Per Month', includedQty: 0, recommendedFrequency: 'Monthly', subCostBase: 180, subCostPerUnit: 0, customerPriceBase: 295, customerPricePerUnit: 0, volumeDiscountText: 'Annual agreement: 10%', frequencyDiscounts: [{ frequency: 'ANNUAL_AGREEMENT', label: 'Annual Agreement', ratePercent: 10 }], sortOrder: 10 },
      { key: 'irrigation_startup', label: 'Irrigation Startup', pricingUnit: 'First 6 zones', includedQty: 6, recommendedFrequency: 'Annually', subCostBase: 75, subCostPerUnit: 8, customerPriceBase: 125, customerPricePerUnit: 15, volumeDiscountText: 'Bundle: 15%', frequencyDiscounts: [{ frequency: 'BUNDLE', label: 'Bundle with Winterization', ratePercent: 15 }], sortOrder: 11 },
      { key: 'irrigation_winterization', label: 'Irrigation Winterization', pricingUnit: 'First 6 zones', includedQty: 6, recommendedFrequency: 'Annually', subCostBase: 75, subCostPerUnit: 8, customerPriceBase: 125, customerPricePerUnit: 15, volumeDiscountText: 'Bundle: 15%', frequencyDiscounts: [{ frequency: 'BUNDLE', label: 'Bundle with Startup', ratePercent: 15 }], sortOrder: 12 },
      { key: 'gutter_cleaning', label: 'Gutter Cleaning', pricingUnit: 'First 150 LF', includedQty: 150, recommendedFrequency: 'Twice per year', subCostBase: 100, subCostPerUnit: 0.40, customerPriceBase: 175, customerPricePerUnit: 0.75, volumeDiscountText: 'Semiannual: 10%', frequencyDiscounts: [{ frequency: 'SEMIANNUAL', label: 'Semiannual', ratePercent: 10 }], sortOrder: 13 },
      { key: 'small_tree_trimming', label: "Small Tree Trimming (<20')", pricingUnit: 'Per Tree', includedQty: 0, recommendedFrequency: 'Every 2–3 years', subCostBase: 0, subCostPerUnit: 90, customerPriceBase: 0, customerPricePerUnit: 195, volumeDiscountText: '3–5 trees: 10%', volumeDiscountThreshold1: 3, volumeDiscountRate1: 10, sortOrder: 14 },
      { key: 'medium_tree_trimming', label: "Medium Tree Trimming (20–40')", pricingUnit: 'Per Tree', includedQty: 0, recommendedFrequency: 'Every 2–3 years', subCostBase: 0, subCostPerUnit: 180, customerPriceBase: 0, customerPricePerUnit: 395, volumeDiscountText: '3–5 trees: 10%', volumeDiscountThreshold1: 3, volumeDiscountRate1: 10, sortOrder: 15 },
      { key: 'large_tree_trimming', label: "Large Tree Trimming (40–60')", pricingUnit: 'Per Tree', includedQty: 0, recommendedFrequency: 'Every 3–5 years', subCostBase: 0, subCostPerUnit: 450, customerPriceBase: 0, customerPricePerUnit: 850, volumeDiscountText: '3+ trees: 10%', volumeDiscountThreshold1: 3, volumeDiscountRate1: 10, sortOrder: 16 },
      { key: 'drainage_correction', label: 'Drainage Correction', pricingUnit: 'Per Project', includedQty: 0, recommendedFrequency: 'One-time', subCostBase: 650, subCostPerUnit: 0, customerPriceBase: 1200, customerPricePerUnit: 0, volumeDiscountText: 'Projects >$5k: 10%', sortOrder: 17 },
      { key: 'landscape_lighting_maintenance', label: 'Landscape Lighting Maintenance', pricingUnit: 'Service Call', includedQty: 0, recommendedFrequency: 'Annual', subCostBase: 75, subCostPerUnit: 15, customerPriceBase: 125, customerPricePerUnit: 25, volumeDiscountText: '10+ fixtures: 10%', volumeDiscountThreshold1: 10, volumeDiscountRate1: 10, sortOrder: 18 },
    ];
    // Lawn Mowing's 8 property-size pricing tiers (XS..Large Estate) — see
    // MarketplaceLawncareService.sizeTiers and computeLawncareServicePrice().
    // One-time backfill only (gated on sizeTiers still being null), NOT an
    // unconditional update, so admin edits made via the Configurator survive
    // every subsequent restart/deploy.
    const lawnMowing = await this.lawncareServicesRepo.findOne({ where: { key: 'lawn_mowing' } });
    if (lawnMowing && !lawnMowing.sizeTiers) {
      await this.lawncareServicesRepo.update(lawnMowing.id, {
        sizeTiers: [
          { key: 'XS', label: 'XS (up to 0.15 acre)', maxSF: 2500, vendorBase: 30, vendorAddlRate: 5, customerBase: 50, customerAddlRate: 8, requiresQuote: false },
          { key: 'S', label: 'S (0.15 to 0.25 acre)', maxSF: 4000, vendorBase: 35, vendorAddlRate: 5, customerBase: 60, customerAddlRate: 8, requiresQuote: false },
          { key: 'M', label: 'M (0.25 to 0.50 acre)', maxSF: 6000, vendorBase: 45, vendorAddlRate: 5, customerBase: 76, customerAddlRate: 8, requiresQuote: false },
          { key: 'L', label: 'L (0.50 to 0.75 acre)', maxSF: 8000, vendorBase: 55, vendorAddlRate: 5, customerBase: 92, customerAddlRate: 8, requiresQuote: false },
          { key: 'XL', label: 'XL (0.75 to 1.00 acre)', maxSF: 10000, vendorBase: 65, vendorAddlRate: 5, customerBase: 108, customerAddlRate: 8, requiresQuote: false },
          { key: 'XXL', label: 'XXL (1 to 2 acres)', maxSF: 15000, vendorBase: 80, vendorAddlRate: 5, customerBase: 132, customerAddlRate: 8, requiresQuote: false },
          { key: 'ESTATE', label: 'Estate (2 to 5 acres)', maxSF: 20000, vendorBase: 95, vendorAddlRate: null, customerBase: 156, customerAddlRate: null, requiresQuote: false },
          { key: 'LARGE_ESTATE', label: 'Large Estate (over 5 acres)', maxSF: null, vendorBase: null, vendorAddlRate: null, customerBase: null, customerAddlRate: null, requiresQuote: true },
        ],
      });
    }
    // One-time backfill: the row was already seeded (above `!existing` guard
    // no longer applies) before Monthly/visitsPerYear/description existed —
    // gated on WEEKLY still lacking visitsPerYear so it runs exactly once and
    // never clobbers a future admin edit to these entries.
    if (lawnMowing && !lawnMowing.frequencyDiscounts?.some((f) => f.frequency === 'WEEKLY' && f.visitsPerYear)) {
      await this.lawncareServicesRepo.update(lawnMowing.id, {
        frequencyDiscounts: [
          { frequency: 'MONTHLY', label: 'Monthly', ratePercent: 0, description: 'Pay per visit, no recurring commitment' },
          { frequency: 'WEEKLY', label: 'Weekly', ratePercent: 15, visitsPerYear: 52, description: 'Weekly visits Apr–Oct, as-needed Nov–Mar' },
          { frequency: 'BIWEEKLY', label: 'Biweekly', ratePercent: 5, visitsPerYear: 26, description: 'Biweekly visits Apr–Oct, as-needed Nov–Mar' },
        ],
      });
    }
    // Separate one-time backfill for the summary text, gated on it still
    // being the known-stale original default so a hypothetical admin edit
    // in between is respected.
    if (lawnMowing && lawnMowing.recommendedFrequency === 'Weekly (Apr–Oct), Biweekly (Nov–Mar)') {
      await this.lawncareServicesRepo.update(lawnMowing.id, {
        recommendedFrequency: 'Weekly/Biweekly (Apr–Oct); as-needed (Nov–Mar)',
      });
    }
    // One-time rename backfill: 'Mulch Installation' -> 'Bed Mulching'.
    const mulchInstallation = await this.lawncareServicesRepo.findOne({ where: { key: 'mulch_installation' } });
    if (mulchInstallation && mulchInstallation.label === 'Mulch Installation') {
      await this.lawncareServicesRepo.update(mulchInstallation.id, { label: 'Bed Mulching' });
    }
    // One-time backfill: Leaf Removal's Seasonal Package discount moves from
    // a customer-selectable frequency chip to a membershipBenefit gated on
    // an active Seasonal Maintenance Package subscription — gated on the old
    // SEASONAL_PACKAGE frequencyDiscounts entry still being present.
    const leafRemoval = await this.lawncareServicesRepo.findOne({ where: { key: 'leaf_removal' } });
    if (leafRemoval && leafRemoval.frequencyDiscounts?.some((f) => f.frequency === 'SEASONAL_PACKAGE')) {
      await this.lawncareServicesRepo.update(leafRemoval.id, {
        frequencyDiscounts: [],
        membershipBenefit: { requiredPackageKeys: ['premium_landscape_care'], type: 'PERCENT_OFF', ratePercent: 15 },
        volumeDiscountText: '15% off with an active Seasonal Maintenance Package',
      });
    }
    // One-time backfill: Bed Weeding is always monthly (no other cadence
    // exists), so its 10% Monthly discount is intentionally zeroed out —
    // gated on the old 10% value still being present.
    const bedWeeding = await this.lawncareServicesRepo.findOne({ where: { key: 'bed_weeding' } });
    if (bedWeeding && bedWeeding.frequencyDiscounts?.some((f) => f.frequency === 'MONTHLY' && f.ratePercent === 10)) {
      await this.lawncareServicesRepo.update(bedWeeding.id, {
        frequencyDiscounts: [{ frequency: 'MONTHLY', label: 'Monthly', ratePercent: 0 }],
        volumeDiscountText: 'Always billed monthly',
      });
    }

    // Initial Property Details field set — admin can rename/reorder/remove/
    // add from here via the Configurator; `key` stays stable since
    // resolveServiceQty() (marketplace-lawncare-pricing.utils.ts) reads by it.
    const propertyDetailFields: Partial<MarketplaceLawncarePropertyDetailField>[] = [
      { key: 'shrubPlantCount', label: 'Number of Shrubs/Plants', unit: 'count', sortOrder: 1 },
      { key: 'bedSqFt', label: 'Bed Square Footage', unit: 'sq ft', sortOrder: 2 },
      { key: 'gutterLinearFt', label: 'Gutter Linear Footage', unit: 'ft', sortOrder: 3 },
      { key: 'irrigationZones', label: 'Irrigation Zones', unit: 'zones', sortOrder: 4 },
      { key: 'treeCountSmall', label: "Small Trees (<20')", unit: 'count', sortOrder: 5 },
      { key: 'treeCountMedium', label: "Medium Trees (20-40')", unit: 'count', sortOrder: 6 },
      { key: 'treeCountLarge', label: "Large Trees (40-60')", unit: 'count', sortOrder: 7 },
      { key: 'lightingFixtureCount', label: 'Landscape Lighting Fixtures', unit: 'count', sortOrder: 8 },
    ];
    for (const f of propertyDetailFields) {
      const existing = await this.lawncarePropertyDetailFieldsRepo.findOne({ where: { key: f.key } });
      if (!existing) await this.lawncarePropertyDetailFieldsRepo.save(this.lawncarePropertyDetailFieldsRepo.create(f));
    }

    for (const s of services) {
      const existing = await this.lawncareServicesRepo.findOne({ where: { key: s.key } });
      if (!existing) await this.lawncareServicesRepo.save(this.lawncareServicesRepo.create(s));
    }

    const packages: Partial<MarketplaceLawncarePackage>[] = [
      {
        key: 'essential_lawn_care',
        label: 'Essentials Lawn Care',
        description: `Lawn & Turf
✅ Weekly mowing and edging

Landscape Beds
✅ Monthly bed weeding`,
        composition: [
          { serviceKey: 'lawn_mowing', visitsPerYear: 52, frequency: 'WEEKLY' },
          { serviceKey: 'bed_weeding', visitsPerYear: 12, frequency: 'MONTHLY' },
        ],
        monthlyPrice: 295,
        sortOrder: 1,
      },
      {
        key: 'premium_landscape_care',
        label: 'Seasonal Maintenance Package',
        description: `Lawn & Turf
✅ Weekly mowing and edging

Landscape Beds
✅ Monthly bed weeding

Shrubs & Trees
✅ Annual shrub trimming

Seasonal Services
✅ Spring cleanup
✅ Fall cleanup`,
        composition: [
          { serviceKey: 'lawn_mowing', visitsPerYear: 52, frequency: 'WEEKLY' },
          { serviceKey: 'bed_weeding', visitsPerYear: 12, frequency: 'MONTHLY' },
          { serviceKey: 'shrub_trimming', visitsPerYear: 1 },
          { serviceKey: 'spring_cleanup', visitsPerYear: 2 },
        ],
        monthlyPrice: 495,
        sortOrder: 2,
      },
      {
        key: 'estate_package',
        label: 'Premium Lawn Care',
        description: `Lawn & Turf
✅ Weekly mowing and edging
✅ Seasonal fertilization coordination
✅ Spot weed control monitoring
✅ Turf health inspections

Landscape Beds
✅ Monthly bed weeding
✅ Mulch inspections and replenishment recommendations
✅ Seasonal flower rotation coordination
✅ Debris removal

Shrubs & Trees
✅ Quarterly shrub trimming
✅ Annual tree inspections
✅ Dead limb identification
✅ Coordination of tree services

Irrigation
✅ Spring startup
✅ Monthly irrigation inspections
✅ Fall winterization
✅ Controller adjustments

Seasonal Services
✅ Spring cleanup
✅ Multiple fall cleanups
✅ Storm debris removal

Exterior Maintenance Add-Ons
✅ Gutter cleaning (2× annually)
✅ Drainage inspections
✅ Landscape lighting inspections
✅ Pressure washing coordination
✅ Exterior property condition reports`,
        composition: [
          { serviceKey: 'lawn_mowing', visitsPerYear: 52, frequency: 'WEEKLY' },
          { serviceKey: 'bed_weeding', visitsPerYear: 12, frequency: 'MONTHLY' },
          { serviceKey: 'shrub_trimming', visitsPerYear: 4 },
          { serviceKey: 'irrigation_startup', visitsPerYear: 1, frequency: 'BUNDLE' },
          { serviceKey: 'irrigation_winterization', visitsPerYear: 1, frequency: 'BUNDLE' },
          { serviceKey: 'spring_cleanup', visitsPerYear: 3 },
          { serviceKey: 'gutter_cleaning', visitsPerYear: 2, frequency: 'SEMIANNUAL' },
        ],
        monthlyPrice: 695,
        isStartingAt: true,
        sortOrder: 3,
      },
    ];
    for (const p of packages) {
      const existing = await this.lawncarePackagesRepo.findOne({ where: { key: p.key } });
      if (!existing) await this.lawncarePackagesRepo.save(this.lawncarePackagesRepo.create(p));
    }
    // One-time backfill: the 3 packages were already seeded (above
    // `!existing` guard no longer applies) before composition items carried
    // a `frequency` — add each item's, gated per-package on the composition
    // not already containing any `frequency` value, so a future admin edit
    // to composition (if that ever becomes editable) isn't clobbered.
    for (const p of packages) {
      const existingPkg = await this.lawncarePackagesRepo.findOne({ where: { key: p.key } });
      if (existingPkg && !existingPkg.composition?.some((item) => item.frequency)) {
        await this.lawncarePackagesRepo.update(existingPkg.id, { composition: p.composition });
      }
    }
  }

  // Same shape as seedCapabilityAndCatalog() above — a module-owned
  // "Lawn & Landscaping" vendor capability plus a single browsable
  // "Lawncare Subscription" catalog row gated on it. Real pricing lives in
  // the seedLawncareConfig() tables above; this row's own price fields are
  // unused placeholders, same as House Cleaning's catalog row.
  private async seedLawncareCapabilityAndCatalog() {
    let capability = await this.capabilityRepo.findOne({ where: { name: LAWN_CARE_CAPABILITY_NAME } });
    if (!capability) {
      capability = await this.capabilityRepo.save(this.capabilityRepo.create({ name: LAWN_CARE_CAPABILITY_NAME }));
      const vendors = await this.usersService.findAllActiveVendors();
      if (vendors.length > 0) {
        await this.notificationsService.notifyVendors(
          vendors, NotificationType.NEW_CAPABILITY_AVAILABLE, 'New Capability Available',
          `"${capability.name}" has been added — update your profile if you'd like to offer it.`,
          { screen: 'capabilities' },
        ).catch(() => {});
      }
    }

    const existing = await this.servicePriceRepo.findOne({ where: { name: LAWNCARE_CATALOG_NAME } });
    if (!existing) {
      await this.servicePriceRepo.save(this.servicePriceRepo.create({
        name: LAWNCARE_CATALOG_NAME,
        description: 'Recurring lawn and landscape care, tailored to your property.',
        basePrice: 0,
        pricingMethod: PricingMethod.FLAT_PRICE,
        category: ServiceCategory.LAWN_LANDSCAPING,
        serviceGroups: [ServiceGroup.MARKETPLACE],
        customerRequestable: true,
        requiredCapabilityId: capability.id,
      }));
    }
  }

  // Base/per-unit rates are normalized to a single consistent unit per
  // dimension (matching the "First X" normalization pattern used for
  // Lawncare) — e.g. Pest Control Membership's "+$3 per additional 500 sq
  // ft" is stored as $0.006/sq ft, and every "+$X per additional 1/2 acre"
  // row is stored as $(X*2)/acre — so computePestServicePrice()'s formula
  // never needs to know about the sheet's original block sizes, only
  // includedQty/customerPricePerUnit in the row's own canonical unit
  // (sq ft for home-size-scaled rows, acres for acreage-scaled rows).
  // Premium/Ultimate memberships are the only rows using both dimensions at
  // once (customerPricePerUnit2/includedQty2 for acreage, alongside the
  // sqft-based customerPricePerUnit/includedQty).
  private async seedPestConfig() {
    const services: Partial<MarketplacePestService>[] = [
      {
        key: 'initial_pest_treatment', label: 'Initial Pest Treatment', pricingUnit: 'Per Property',
        includedQty: 2000, recommendedFrequency: 'One-time', subCostBase: 90, subCostPerUnit: 0.012,
        customerPriceBase: 149, customerPricePerUnit: 0.02, volumeDiscountText: '5% (2), 10% (5), 15% (10+) properties',
        sortOrder: 1,
      },
      {
        key: 'quarterly_pest_treatment', label: 'Quarterly Pest Treatment', pricingUnit: 'Per Visit',
        includedQty: 2000, recommendedFrequency: 'Quarterly', subCostBase: 55, subCostPerUnit: 0.009,
        customerPriceBase: 95, customerPricePerUnit: 0.015, volumeDiscountText: '5% (2), 10% (5), 15% (10+) properties',
        sortOrder: 2,
      },
      {
        key: 'pest_control_membership', label: 'Pest Control Membership', pricingUnit: 'Monthly',
        includedQty: 2000, recommendedFrequency: 'Monthly', subCostBase: 22, subCostPerUnit: 0.0036,
        customerPriceBase: 39, customerPricePerUnit: 0.006, volumeDiscountText: '10% additional properties',
        sortOrder: 3,
      },
      {
        key: 'premium_pest_mosquito_membership', label: 'Premium Pest + Mosquito Membership', pricingUnit: 'Monthly',
        includedQty: 2000, includedQty2: 0.5, recommendedFrequency: 'Monthly', subCostBase: 40, subCostPerUnit: 0.006,
        subCostPerUnit2: 12, customerPriceBase: 69, customerPricePerUnit: 0.01, customerPricePerUnit2: 20,
        volumeDiscountText: '10% (2), 15% (5+) properties',
        sortOrder: 4,
      },
      {
        key: 'ultimate_protection_membership', label: 'Ultimate Protection Membership', pricingUnit: 'Monthly',
        includedQty: 2000, includedQty2: 0.5, recommendedFrequency: 'Monthly', subCostBase: 58, subCostPerUnit: 0.006,
        subCostPerUnit2: 12, customerPriceBase: 99, customerPricePerUnit: 0.01, customerPricePerUnit2: 20,
        volumeDiscountText: '10% (2), 15% (5+) properties',
        sortOrder: 5,
      },
      {
        key: 'mosquito_treatment', label: 'Mosquito Treatment', pricingUnit: 'Per Visit',
        includedQty: 0.5, recommendedFrequency: 'Every 45 Days', subCostBase: 46, subCostPerUnit: 24,
        customerPriceBase: 79, customerPricePerUnit: 40,
        volumeDiscountText: '10% for seasonal package',
        frequencyDiscounts: [{ frequency: 'SEASONAL_PACKAGE', label: 'Seasonal Package', ratePercent: 10 }],
        sortOrder: 6,
      },
      {
        key: 'flea_tick_treatment', label: 'Flea & Tick Treatment', pricingUnit: 'Per Visit',
        includedQty: 0.5, recommendedFrequency: 'As needed', subCostBase: 86, subCostPerUnit: 15,
        customerPriceBase: 149, customerPricePerUnit: 50,
        volumeDiscountText: '10% with mosquito plan',
        membershipBenefit: { requiredPackageKeys: ['premium_protection', 'ultimate_protection'], type: 'PERCENT_OFF', ratePercent: 10 },
        sortOrder: 7,
      },
      {
        key: 'fire_ant_treatment', label: 'Fire Ant Treatment', pricingUnit: 'Per Property',
        includedQty: 0.5, recommendedFrequency: 'As needed', subCostBase: 58, subCostPerUnit: 12,
        customerPriceBase: 99, customerPricePerUnit: 40, volumeDiscountText: '10% (2+) properties',
        sortOrder: 8,
      },
      {
        key: 'rodent_inspection', label: 'Rodent Inspection', pricingUnit: 'Per Property',
        includedQty: 0, recommendedFrequency: 'Quarterly', subCostBase: 58, subCostPerUnit: 0,
        customerPriceBase: 99, customerPricePerUnit: 0, volumeDiscountText: 'Included with Ultimate',
        membershipBenefit: { requiredPackageKeys: ['ultimate_protection'], type: 'FREE' },
        sortOrder: 9,
      },
      {
        key: 'rodent_bait_station_service', label: 'Rodent Bait Station Service', pricingUnit: 'Per Property (4 stations)',
        includedQty: 4, recommendedFrequency: 'Quarterly', subCostBase: 88, subCostPerUnit: 15,
        customerPriceBase: 149, customerPricePerUnit: 25, volumeDiscountText: '10% with membership',
        membershipBenefit: { requiredPackageKeys: ['basic_protection', 'premium_protection', 'ultimate_protection'], type: 'PERCENT_OFF', ratePercent: 10 },
        sortOrder: 10,
      },
      {
        key: 'wasp_nest_removal', label: 'Wasp Nest Removal', pricingUnit: 'Per Nest',
        includedQty: 1, recommendedFrequency: 'As needed', subCostBase: 52, subCostPerUnit: 24,
        customerPriceBase: 89, customerPricePerUnit: 40, volumeDiscountText: '15% for 3+ nests',
        volumeDiscountThreshold1: 3, volumeDiscountRate1: 15,
        sortOrder: 11,
      },
      {
        key: 'crawlspace_attic_inspection', label: 'Crawlspace/Attic Inspection', pricingUnit: 'Per Property',
        includedQty: 0, recommendedFrequency: 'Annual', subCostBase: 46, subCostPerUnit: 0,
        customerPriceBase: 79, customerPricePerUnit: 0, volumeDiscountText: 'Included with Ultimate',
        membershipBenefit: { requiredPackageKeys: ['ultimate_protection'], type: 'FREE' },
        sortOrder: 12,
      },
      {
        key: 'emergency_pest_visit', label: 'Emergency Pest Visit', pricingUnit: 'Per Visit',
        includedQty: 0, recommendedFrequency: 'One-Time / Follow-Up as Needed', subCostBase: 76, subCostPerUnit: 0,
        customerPriceBase: 129, customerPricePerUnit: 0, volumeDiscountText: 'Free for Premium & Ultimate',
        membershipBenefit: { requiredPackageKeys: ['premium_protection', 'ultimate_protection'], type: 'FREE' },
        sortOrder: 13,
      },
      {
        key: 'annual_pest_inspection', label: 'Annual Pest Inspection', pricingUnit: 'Per Property',
        includedQty: 0, recommendedFrequency: 'Annual', subCostBase: 58, subCostPerUnit: 0,
        customerPriceBase: 99, customerPricePerUnit: 0, volumeDiscountText: 'Included with Membership',
        membershipBenefit: { requiredPackageKeys: ['basic_protection', 'premium_protection', 'ultimate_protection'], type: 'FREE' },
        sortOrder: 14,
      },
    ];
    for (const s of services) {
      const existing = await this.pestServicesRepo.findOne({ where: { key: s.key } });
      if (!existing) await this.pestServicesRepo.save(this.pestServicesRepo.create(s));
    }

    const packages: Partial<MarketplacePestPackage>[] = [
      {
        key: 'basic_protection', label: 'Basic Protection',
        description: 'Quarterly pest control treatments to keep common household pests out year-round.',
        composition: [{ serviceKey: 'quarterly_pest_treatment', visitsPerYear: 4 }],
        monthlyPrice: 39, sortOrder: 1,
      },
      {
        key: 'premium_protection', label: 'Premium Protection',
        description: 'Quarterly pest control plus mosquito treatments every 45 days through mosquito season.',
        composition: [
          { serviceKey: 'quarterly_pest_treatment', visitsPerYear: 4 },
          { serviceKey: 'mosquito_treatment', visitsPerYear: 8 },
        ],
        monthlyPrice: 69, sortOrder: 2,
      },
      {
        key: 'ultimate_protection', label: 'Ultimate Protection',
        description: 'Quarterly pest control, mosquito treatments, and quarterly rodent bait station service — our most complete coverage, including free Rodent Inspection, Crawlspace/Attic Inspection, and Emergency Pest Visits.',
        composition: [
          { serviceKey: 'quarterly_pest_treatment', visitsPerYear: 4 },
          { serviceKey: 'mosquito_treatment', visitsPerYear: 8 },
          { serviceKey: 'rodent_bait_station_service', visitsPerYear: 4 },
        ],
        monthlyPrice: 99, sortOrder: 3,
      },
    ];
    for (const p of packages) {
      const existing = await this.pestPackagesRepo.findOne({ where: { key: p.key } });
      if (!existing) await this.pestPackagesRepo.save(this.pestPackagesRepo.create(p));
    }
  }

  private async seedPestCapabilityAndCatalog() {
    let capability = await this.capabilityRepo.findOne({ where: { name: PEST_CONTROL_CAPABILITY_NAME } });
    if (!capability) {
      capability = await this.capabilityRepo.save(this.capabilityRepo.create({ name: PEST_CONTROL_CAPABILITY_NAME }));
      const vendors = await this.usersService.findAllActiveVendors();
      if (vendors.length > 0) {
        await this.notificationsService.notifyVendors(
          vendors, NotificationType.NEW_CAPABILITY_AVAILABLE, 'New Capability Available',
          `"${capability.name}" has been added — update your profile if you'd like to offer it.`,
          { screen: 'capabilities' },
        ).catch(() => {});
      }
    }

    const existing = await this.servicePriceRepo.findOne({ where: { name: PEST_CONTROL_CATALOG_NAME } });
    if (!existing) {
      await this.servicePriceRepo.save(this.servicePriceRepo.create({
        name: PEST_CONTROL_CATALOG_NAME,
        description: 'Pest, mosquito, and rodent control, tailored to your property.',
        basePrice: 0,
        pricingMethod: PricingMethod.FLAT_PRICE,
        category: ServiceCategory.PEST_CONTROL,
        serviceGroups: [ServiceGroup.MARKETPLACE],
        customerRequestable: true,
        requiredCapabilityId: capability.id,
      }));
    }
  }

  // ── Config lookups ─────────────────────────────────────────────────────

  async getConfig() {
    const [plans, roomUnits, conditions, addOns, frequencyDiscounts] = await Promise.all([
      this.plansRepo.find({ order: { cleaningType: 'ASC' } }),
      this.roomUnitsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.conditionsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.addOnsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.frequencyDiscountsRepo.find({ where: { isActive: true } }),
    ]);
    return { plans: plans.filter((p) => p.isActive), roomUnits, conditions, addOns, frequencyDiscounts };
  }

  async getHouseCleaningPropertyProfile(customerId: string) {
    return this.houseCleaningPropertyProfileRepo.findOne({ where: { customerId } });
  }

  // Called automatically after every successful subscribe()/
  // bookOneTimeCleaning() — no separate save step for the customer, the
  // profile just stays in sync with whatever houseConfig they last used.
  private async syncHouseCleaningPropertyProfile(customerId: string, houseConfig: Record<string, number>) {
    let profile = await this.houseCleaningPropertyProfileRepo.findOne({ where: { customerId } });
    if (!profile) profile = this.houseCleaningPropertyProfileRepo.create({ customerId });
    profile.roomConfig = houseConfig;
    await this.houseCleaningPropertyProfileRepo.save(profile);
  }

  async getLawncareConfig() {
    const [services, packages, propertyDetailFields] = await Promise.all([
      this.lawncareServicesRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.lawncarePackagesRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.lawncarePropertyDetailFieldsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
    ]);
    return { services, packages, propertyDetailFields };
  }

  async getLawncarePropertyProfile(customerId: string) {
    return this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
  }

  async upsertLawncarePropertyProfile(customerId: string, data: UpsertLawncarePropertyProfileDto) {
    let profile = await this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
    if (!profile) profile = this.lawncarePropertyProfileRepo.create({ customerId });
    const { propertySizeTier, fieldValues, ...rest } = data;
    Object.assign(profile, rest);
    if (fieldValues) profile.fieldValues = { ...profile.fieldValues, ...fieldValues };
    // Derive propertySizeSqFt from the tier's own SF ceiling whenever the
    // tier changes, so leaf_removal's existing qty formula (a continuous SF
    // number) keeps working with zero changes of its own.
    if (propertySizeTier !== undefined) {
      profile.propertySizeTier = propertySizeTier;
      const lawnMowing = await this.lawncareServicesRepo.findOne({ where: { key: 'lawn_mowing' } });
      const tier = lawnMowing?.sizeTiers?.find((t) => t.key === propertySizeTier);
      profile.propertySizeSqFt = tier?.maxSF ?? null;
    }
    return this.lawncarePropertyProfileRepo.save(profile);
  }

  // ── Lawncare: Property Details field definitions (admin) ─────────────────

  async getLawncarePropertyDetailFields() {
    return this.lawncarePropertyDetailFieldsRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async createLawncarePropertyDetailField(label: string, unit: string) {
    const count = await this.lawncarePropertyDetailFieldsRepo.count();
    const key = this.uniqueFieldKey(label);
    return this.lawncarePropertyDetailFieldsRepo.save(this.lawncarePropertyDetailFieldsRepo.create({
      key, label, unit, sortOrder: count, isActive: true,
    }));
  }

  async updateLawncarePropertyDetailField(
    id: string,
    data: Partial<Pick<MarketplaceLawncarePropertyDetailField, 'label' | 'unit' | 'isActive' | 'sortOrder'>>,
  ) {
    await this.lawncarePropertyDetailFieldsRepo.update(id, data);
    return this.lawncarePropertyDetailFieldsRepo.findOneOrFail({ where: { id } });
  }

  async removeLawncarePropertyDetailField(id: string): Promise<void> {
    await this.lawncarePropertyDetailFieldsRepo.delete(id);
  }

  // Field `key` isn't shown to admins — an internal identifier
  // resolveServiceQty() reads by name — a slug plus a short timestamp
  // suffix is simplest way to guarantee uniqueness, same convention as
  // InspectionConfigService.uniqueKey().
  private uniqueFieldKey(label: string): string {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
    return `${slug}_${Date.now().toString(36)}`;
  }

  async getPestConfig() {
    const [services, packages] = await Promise.all([
      this.pestServicesRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.pestPackagesRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
    ]);
    return { services, packages };
  }

  async getPestPropertyProfile(customerId: string) {
    return this.pestPropertyProfileRepo.findOne({ where: { customerId } });
  }

  async upsertPestPropertyProfile(customerId: string, data: UpsertPestPropertyProfileDto) {
    let profile = await this.pestPropertyProfileRepo.findOne({ where: { customerId } });
    if (!profile) profile = this.pestPropertyProfileRepo.create({ customerId });
    Object.assign(profile, data);
    return this.pestPropertyProfileRepo.save(profile);
  }

  private async getActivePlan(cleaningType: CleaningType): Promise<MarketplaceCleaningPlan> {
    const plan = await this.plansRepo.findOne({ where: { cleaningType, isActive: true } });
    if (!plan) throw new BadRequestException(`${cleaningType} cleaning is not currently available.`);
    return plan;
  }

  private async getFrequencyDiscountPercent(frequency: VisitFrequency): Promise<number> {
    if (frequency === VisitFrequency.ONE_TIME) return 0;
    const row = await this.frequencyDiscountsRepo.findOne({ where: { frequency, isActive: true } });
    return row ? Number(row.discountPercent) : 0;
  }

  // ── Pricing ────────────────────────────────────────────────────────────

  async quote(dto: QuoteHouseCleaningDto): Promise<HouseCleaningQuote> {
    const plan = await this.getActivePlan(dto.cleaningType);
    if (!plan.allowedFrequencies.includes(dto.visitFrequency)) {
      throw new BadRequestException(`${dto.visitFrequency} is not available for ${dto.cleaningType} cleaning.`);
    }

    const [roomUnits, conditions, addOnCatalog] = await Promise.all([
      this.roomUnitsRepo.find(),
      this.conditionsRepo.find(),
      this.addOnsRepo.find(),
    ]);

    const conditionMultiplier = computeConditionMultiplier(dto.conditions, conditions);
    if (conditionMultiplier === QUOTE_REQUIRED) {
      return { perVisitCost: 0, monthlyPrice: null, quoteRequired: true };
    }

    const bcu = computeBCU(dto.houseConfig, roomUnits);
    const addOnsTotal = computeAddOnsTotal(dto.addOns ?? [], addOnCatalog);
    const frequencyDiscount = await this.getFrequencyDiscountPercent(dto.visitFrequency);
    const perVisitCost = computePerVisitCost(bcu, Number(plan.retailPerUnit), conditionMultiplier, frequencyDiscount, addOnsTotal);

    if (dto.visitFrequency === VisitFrequency.ONE_TIME) {
      return { perVisitCost, monthlyPrice: null, quoteRequired: false };
    }

    const monthlyPrice = computeMonthlySubscriptionPrice(perVisitCost, dto.visitFrequency);
    return { perVisitCost, monthlyPrice, quoteRequired: false };
  }

  // ── Subscribe (Standard/Deep, recurring) ──────────────────────────────

  // No shared calendar billing anchor — each subscription starts (and bills)
  // immediately at signup, using the payment method already on file from the
  // core plan. Avoids the customer-facing problem a shared "everyone bills
  // on the 1st" anchor has: a late-month signup would wait weeks for their
  // first visit while an early-month one barely waits at all. The customer's
  // preferred first-visit date is independent of billing, same as how the
  // core plan and the Move-Out one-time flow already separate "charge now"
  // from "schedule separately."
  async subscribe(customerId: string, dto: QuoteHouseCleaningDto & { preferredVisitDate: string }): Promise<{
    subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null;
  }> {
    if (dto.visitFrequency === VisitFrequency.ONE_TIME) {
      throw new BadRequestException('One-time cleanings are booked directly — use /marketplace/house-cleaning/one-time.');
    }
    if (dto.cleaningType === CleaningType.MOVE_OUT) {
      throw new BadRequestException('Move-Out cleanings are one-time only.');
    }

    // Marketplace is an add-on — requires an active core Attenteve plan.
    const coreSubscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!coreSubscription) throw new BadRequestException('An active Attenteve plan is required to subscribe to Marketplace services.');

    const quote = await this.quote(dto);
    if (quote.quoteRequired || quote.monthlyPrice == null) {
      throw new BadRequestException('This configuration requires a manual quote — please contact support.');
    }

    const stripeCustomerId = await this.subscriptionsService.getOrCreateStripeCustomer(customerId);
    const customer = await this.stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethod = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;
    if (!defaultPaymentMethod) {
      throw new BadRequestException('Add a payment method in Payments before subscribing to a Marketplace service.');
    }

    const product = await this.ensureStripeProduct();

    // default_payment_method is already attached and off-session-eligible
    // (the same card that already worked for the core plan), so Stripe
    // attempts to confirm this first invoice automatically — no PaymentSheet
    // needed unless that attempt genuinely requires additional
    // authentication, mirroring PaymentsService.chargeForCompletedService's
    // "try silently, only surface a client action if it truly needs one" shape.
    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          unit_amount: Math.round(quote.monthlyPrice * 100),
          recurring: { interval: 'month' },
        },
      }],
      default_payment_method: defaultPaymentMethod,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { type: 'marketplace', customerId, cleaningType: dto.cleaningType },
    });

    const now = new Date();
    const priceLockedUntil = new Date(now);
    priceLockedUntil.setFullYear(priceLockedUntil.getFullYear() + 1);

    const record = this.subscriptionsRepo.create({
      customerId,
      cleaningType: dto.cleaningType,
      visitFrequency: dto.visitFrequency,
      houseConfig: dto.houseConfig,
      conditions: dto.conditions,
      addOns: dto.addOns ?? [],
      computedPerVisitPrice: quote.perVisitCost,
      computedMonthlyPrice: quote.monthlyPrice,
      priceLockedUntil,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      startDate: now,
      stripeSubscriptionId: stripeSub.id,
      nextVisitDate: new Date(dto.preferredVisitDate),
    });
    const saved = await this.subscriptionsRepo.save(record);

    await this.eventsRepo.save(this.eventsRepo.create({
      marketplaceSubscriptionId: saved.id,
      type: MarketplaceEventType.CREATED,
      amount: quote.monthlyPrice,
    }));

    const invoice = stripeSub.latest_invoice as Stripe.Invoice;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
    const charged = pi?.status === 'succeeded';

    await this.syncHouseCleaningPropertyProfile(customerId, dto.houseConfig);

    return {
      subscriptionId: saved.id,
      monthlyPrice: quote.monthlyPrice,
      charged,
      clientSecret: charged ? null : (pi?.client_secret ?? null),
    };
  }

  private async ensureStripeProduct(): Promise<Stripe.Product> {
    const products = await this.stripe.products.list({ limit: 100, active: true });
    const existing = products.data.find((p) => p.name === 'House Cleaning Membership');
    if (existing) return existing;
    return this.stripe.products.create({ name: 'House Cleaning Membership' });
  }

  // ── One-time booking (Move-Out, or Standard/Deep booked once) ─────────

  async bookOneTimeCleaning(customerId: string, dto: QuoteHouseCleaningDto & { preferredDate: string }) {
    if (dto.visitFrequency !== VisitFrequency.ONE_TIME) {
      throw new BadRequestException('Use /marketplace/house-cleaning/subscribe for a recurring plan.');
    }
    const quote = await this.quote(dto);
    if (quote.quoteRequired) throw new BadRequestException('This configuration requires a manual quote — please contact support.');

    const houseCleaningPrice = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!houseCleaningPrice) throw new NotFoundException('House Cleaning is not currently available.');

    const customer = await this.usersService.findById(customerId);
    const profile = customer.customerProfile;
    if (!profile) throw new BadRequestException('A saved address is required to book a cleaning.');

    const saved = await this.serviceRequestsService.createMarketplaceBooking(customerId, {
      servicePriceId: houseCleaningPrice.id,
      preferredDate: dto.preferredDate,
      price: quote.perVisitCost,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
      // Move-Out is a one-time exit transaction — a customer moving out has
      // no ongoing home relationship for a core Attenteve plan to maintain.
      // Standard/Deep booked as a one-time visit still require one, since
      // that customer is maintaining a home they're staying in.
      requireCoreSubscription: dto.cleaningType !== CleaningType.MOVE_OUT,
    });

    await this.syncHouseCleaningPropertyProfile(customerId, dto.houseConfig);

    return saved;
  }

  // ── Lawncare: quote / package subscribe (billing-only) / on-demand booking ─

  // Sums each composition service's per-visit price (at the qty resolved
  // from the customer's saved property profile) × its visits/year, then
  // annualizes to a monthly Stripe-billed amount — the same "annual total /
  // 12" shape House Cleaning uses (computeMonthlySubscriptionPrice), just
  // generalized to a heterogeneous set of services instead of one BCU calc.
  private async computeLawncarePackageMonthlyPrice(customerId: string, pkg: MarketplaceLawncarePackage): Promise<{ monthlyPrice: number; requiresQuote: boolean }> {
    const profile = await this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
    if (!profile) throw new BadRequestException('Complete your property details first.');

    const allServices = await this.lawncareServicesRepo.find();
    const byKey = new Map(allServices.map((s) => [s.key, s]));

    let annualTotal = 0;
    let requiresQuote = false;
    for (const item of pkg.composition) {
      const service = byKey.get(item.serviceKey);
      if (!service) continue;
      const qty = resolveServiceQty(service.key, profile) ?? 0;
      const { price, requiresQuote: rq } = computeLawncareServicePrice(service, qty, item.frequency, profile);
      if (rq) { requiresQuote = true; continue; }
      annualTotal += price * item.visitsPerYear;
    }
    return { monthlyPrice: Math.round((annualTotal / 12) * 100) / 100, requiresQuote };
  }

  // Manual-qty services (Sod/Plant/Gravel-Rock Installation) require an
  // explicit qty from the caller. Every other service defaults to the
  // property-profile-resolved qty, but the mobile add-on UI pre-fills that
  // value and lets the customer edit it for this specific booking — so a
  // provided qty always wins when present, for any service.
  private resolveLawncareBookingQty(profile: MarketplaceLawncarePropertyProfile | null, serviceKey: string, providedQty?: number): number {
    if (providedQty != null) return providedQty;
    if (isManualQtyService(serviceKey)) {
      throw new BadRequestException('A quantity is required for this service.');
    }
    if (!profile) throw new BadRequestException('Complete your property details first.');
    return resolveServiceQty(serviceKey, profile) ?? 0;
  }

  // The customer's currently-active Lawncare PACKAGE subscription, if any —
  // drives membershipBenefit-conditional pricing (e.g. Leaf Removal's
  // Seasonal Package discount, only available with an active Seasonal
  // Maintenance Package). Mirrors Pest Control's identical
  // getActivePestMembershipPackageKey(). Assumes at most one active
  // lawncare package subscription per customer.
  private async getActiveLawncareMembershipPackageKey(customerId: string): Promise<string | null> {
    const active = await this.lawncarePackageSubscriptionsRepo.findOne({
      where: { customerId, status: MarketplaceSubscriptionStatus.ACTIVE },
    });
    return active?.packageKey ?? null;
  }

  async quoteLawncare(customerId: string, dto: QuoteLawncareDto): Promise<
    { type: 'package'; monthlyPrice: number; requiresQuote: boolean }
    | { type: 'service'; price: number; discountRate: number; requiresQuote: boolean; monthlyPrice?: number }
  > {
    if (dto.mode === 'package') {
      if (!dto.packageKey) throw new BadRequestException('packageKey is required for mode "package".');
      const pkg = await this.lawncarePackagesRepo.findOne({ where: { key: dto.packageKey, isActive: true } });
      if (!pkg) throw new NotFoundException('Package not found.');
      const { monthlyPrice, requiresQuote } = await this.computeLawncarePackageMonthlyPrice(customerId, pkg);
      return { type: 'package', monthlyPrice, requiresQuote };
    }

    if (!dto.serviceKey) throw new BadRequestException('serviceKey is required for mode "service".');
    const service = await this.lawncareServicesRepo.findOne({ where: { key: dto.serviceKey, isActive: true } });
    if (!service) throw new NotFoundException('Service not found.');
    const profile = await this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
    const qty = this.resolveLawncareBookingQty(profile, service.key, dto.qty);
    // assumePackageKey is preview-only (see QuoteLawncareDto) — lets the
    // customer see what a membershipBenefit discount would look like if
    // they also subscribe to that package in the same order, before the
    // real subscription exists. bookLawncareService/subscribeLawncareService
    // never accept or trust this — they only ever look up a real active one.
    const membershipPackageKey = dto.assumePackageKey ?? await this.getActiveLawncareMembershipPackageKey(customerId);
    const { price, discountRate, requiresQuote, monthlyPrice } = computeLawncareServicePrice(service, qty, dto.frequency, profile, membershipPackageKey);
    return { type: 'service', price, discountRate, requiresQuote: !!requiresQuote, monthlyPrice };
  }

  // Billing-only: charges a flat monthly Stripe subscription computed fresh
  // from the package's composition against the customer's property profile.
  // No recurring visit is generated from this — the customer books actual
  // work separately via bookLawncareService(), on-demand.
  async subscribeLawncarePackage(customerId: string, dto: SubscribeLawncarePackageDto): Promise<{
    subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null;
  }> {
    const pkg = await this.lawncarePackagesRepo.findOne({ where: { key: dto.packageKey, isActive: true } });
    if (!pkg) throw new NotFoundException('Package not found.');

    const coreSubscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!coreSubscription) throw new BadRequestException('An active Attenteve plan is required to subscribe to Marketplace services.');

    // Never trust a stale client-side number — recompute fresh right before charging.
    const { monthlyPrice, requiresQuote } = await this.computeLawncarePackageMonthlyPrice(customerId, pkg);
    if (requiresQuote) {
      throw new BadRequestException('Your selected property size requires a custom quote — please contact support.');
    }

    const stripeCustomerId = await this.subscriptionsService.getOrCreateStripeCustomer(customerId);
    const customer = await this.stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethod = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;
    if (!defaultPaymentMethod) {
      throw new BadRequestException('Add a payment method in Payments before subscribing to a Marketplace service.');
    }

    const product = await this.ensureLawncarePackageStripeProduct();

    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          unit_amount: Math.round(monthlyPrice * 100),
          recurring: { interval: 'month' },
        },
      }],
      default_payment_method: defaultPaymentMethod,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { type: 'marketplace_lawncare_package', customerId, packageKey: dto.packageKey },
    });

    const saved = await this.lawncarePackageSubscriptionsRepo.save(this.lawncarePackageSubscriptionsRepo.create({
      customerId,
      packageKey: dto.packageKey,
      computedMonthlyPrice: monthlyPrice,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      startDate: new Date(),
      stripeSubscriptionId: stripeSub.id,
    }));

    const invoice = stripeSub.latest_invoice as Stripe.Invoice;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
    const charged = pi?.status === 'succeeded';

    return {
      subscriptionId: saved.id,
      monthlyPrice,
      charged,
      clientSecret: charged ? null : (pi?.client_secret ?? null),
    };
  }

  // Billing-only, same shape as subscribeLawncarePackage — for a standalone
  // service subscribed at a frequency whose frequencyDiscounts entry carries
  // visitsPerYear (today: Lawn Mowing Weekly/Biweekly). No recurring visit is
  // generated from this row; the contractor is still paid per completed
  // visit at computedPerVisitVendorPrice (snapshot, ops reference only).
  async subscribeLawncareService(customerId: string, dto: SubscribeLawncareServiceDto): Promise<{
    subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null;
  }> {
    const service = await this.lawncareServicesRepo.findOne({ where: { key: dto.serviceKey, isActive: true } });
    if (!service) throw new NotFoundException('Service not found.');
    if (!isSubscribableFrequency(service, dto.frequency)) {
      throw new BadRequestException('This service/frequency is not available as a subscription.');
    }

    const existing = await this.lawncareServiceSubscriptionsRepo.findOne({
      where: { customerId, serviceKey: dto.serviceKey, status: MarketplaceSubscriptionStatus.ACTIVE },
    });
    if (existing) throw new BadRequestException('You already have an active subscription for this service.');

    const coreSubscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!coreSubscription) throw new BadRequestException('An active Attenteve plan is required to subscribe to Marketplace services.');

    // Never trust a stale client-side number — recompute fresh right before charging.
    const profile = await this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
    const qty = resolveServiceQty(service.key, profile) ?? 0;
    const membershipPackageKey = await this.getActiveLawncareMembershipPackageKey(customerId);
    const { monthlyPrice, vendorPrice, requiresQuote } = computeLawncareServicePrice(service, qty, dto.frequency, profile, membershipPackageKey);
    if (requiresQuote || monthlyPrice == null) {
      throw new BadRequestException('Your selected property size requires a custom quote — please contact support.');
    }

    const stripeCustomerId = await this.subscriptionsService.getOrCreateStripeCustomer(customerId);
    const customer = await this.stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethod = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;
    if (!defaultPaymentMethod) {
      throw new BadRequestException('Add a payment method in Payments before subscribing to a Marketplace service.');
    }

    const product = await this.ensureLawncarePackageStripeProduct();

    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          unit_amount: Math.round(monthlyPrice * 100),
          recurring: { interval: 'month' },
        },
      }],
      default_payment_method: defaultPaymentMethod,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { type: 'marketplace_lawncare_service', customerId, serviceKey: dto.serviceKey, frequency: dto.frequency },
    });

    const saved = await this.lawncareServiceSubscriptionsRepo.save(this.lawncareServiceSubscriptionsRepo.create({
      customerId,
      serviceKey: dto.serviceKey,
      frequency: dto.frequency,
      computedMonthlyPrice: monthlyPrice,
      computedPerVisitVendorPrice: vendorPrice,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      startDate: new Date(),
      stripeSubscriptionId: stripeSub.id,
    }));

    const invoice = stripeSub.latest_invoice as Stripe.Invoice;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
    const charged = pi?.status === 'succeeded';

    return {
      subscriptionId: saved.id,
      monthlyPrice,
      charged,
      clientSecret: charged ? null : (pi?.client_secret ?? null),
    };
  }

  private async ensureLawncarePackageStripeProduct(): Promise<Stripe.Product> {
    const products = await this.stripe.products.list({ limit: 100, active: true });
    const existing = products.data.find((p) => p.name === 'Lawncare Package Subscription');
    if (existing) return existing;
    return this.stripe.products.create({ name: 'Lawncare Package Subscription' });
  }

  // On-demand, one-time booking for a single à-la-carte service (not a
  // subscription) — e.g. "Lawn Mowing" or "Sod Installation" requested
  // outside of any package. Payment happens at job completion via the
  // standard ServiceRequest flow, same as any other approved add-on.
  async bookLawncareService(customerId: string, dto: BookLawncareServiceDto) {
    const service = await this.lawncareServicesRepo.findOne({ where: { key: dto.serviceKey, isActive: true } });
    if (!service) throw new NotFoundException('Service not found.');
    if (isSubscribableFrequency(service, dto.frequency)) {
      throw new BadRequestException('This frequency is billed as a monthly subscription — use the subscribe flow instead of booking a one-time visit.');
    }
    const propertyProfile = await this.lawncarePropertyProfileRepo.findOne({ where: { customerId } });
    const qty = this.resolveLawncareBookingQty(propertyProfile, service.key, dto.qty);
    const membershipPackageKey = await this.getActiveLawncareMembershipPackageKey(customerId);
    const { price, requiresQuote } = computeLawncareServicePrice(service, qty, dto.frequency, propertyProfile, membershipPackageKey);
    if (requiresQuote) {
      throw new BadRequestException('Your selected property size requires a custom quote — please contact support.');
    }

    const lawncareCatalogPrice = await this.servicePriceRepo.findOne({ where: { name: LAWNCARE_CATALOG_NAME } });
    if (!lawncareCatalogPrice) throw new NotFoundException('Lawncare is not currently available.');

    const customer = await this.usersService.findById(customerId);
    const profile = customer.customerProfile;
    if (!profile) throw new BadRequestException('A saved address is required to book a Lawncare service.');

    return this.serviceRequestsService.createMarketplaceBooking(customerId, {
      servicePriceId: lawncareCatalogPrice.id,
      preferredDate: dto.preferredDate,
      price,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
      nameOverride: service.label,
      descriptionOverride: `${service.label} — ${qty} (${service.pricingUnit})`,
    });
  }

  // ── Pest Control: quote / package subscribe (billing-only) / on-demand booking ─

  private async computePestPackageMonthlyPrice(customerId: string, pkg: MarketplacePestPackage): Promise<number> {
    const profile = await this.pestPropertyProfileRepo.findOne({ where: { customerId } });
    if (!profile) throw new BadRequestException('Complete your property details first.');

    const allServices = await this.pestServicesRepo.find();
    const byKey = new Map(allServices.map((s) => [s.key, s]));

    let annualTotal = 0;
    for (const item of pkg.composition) {
      const service = byKey.get(item.serviceKey);
      if (!service) continue;
      const qty = resolvePestServiceQty(service.key, profile) ?? 0;
      const qty2 = resolvePestServiceQty2(service.key, profile);
      // Membership benefits never apply to a package's own composition
      // pricing — they only discount/comp on-demand add-on bookings made BY
      // an existing member, so this is intentionally computed at full price.
      const { price } = computePestServicePrice(service, qty, qty2);
      annualTotal += price * item.visitsPerYear;
    }
    return Math.round((annualTotal / 12) * 100) / 100;
  }

  // Manual-qty services (Rodent Bait Station/Wasp Nest Removal) require an
  // explicit qty; every other service defaults to the property-profile-
  // resolved qty, overridable by the caller, same pattern as Lawncare.
  private async resolvePestBookingQty(customerId: string, serviceKey: string, providedQty?: number): Promise<{ qty: number; qty2: number }> {
    const profile = await this.pestPropertyProfileRepo.findOne({ where: { customerId } });
    if (providedQty != null) return { qty: providedQty, qty2: resolvePestServiceQty2(serviceKey, profile) };
    if (isManualQtyPestService(serviceKey)) {
      throw new BadRequestException('A quantity is required for this service.');
    }
    if (!profile) throw new BadRequestException('Complete your property details first.');
    return { qty: resolvePestServiceQty(serviceKey, profile) ?? 0, qty2: resolvePestServiceQty2(serviceKey, profile) };
  }

  // The customer's currently-active Pest Control package, if any — drives
  // membership-conditional pricing (e.g. "Included with Ultimate"). Assumes
  // at most one active pest package subscription per customer.
  private async getActivePestMembershipPackageKey(customerId: string): Promise<string | null> {
    const active = await this.pestPackageSubscriptionsRepo.findOne({
      where: { customerId, status: MarketplaceSubscriptionStatus.ACTIVE },
    });
    return active?.packageKey ?? null;
  }

  async quotePest(customerId: string, dto: QuotePestDto): Promise<
    { type: 'package'; monthlyPrice: number } | { type: 'service'; price: number; discountRate: number; comped: boolean }
  > {
    if (dto.mode === 'package') {
      if (!dto.packageKey) throw new BadRequestException('packageKey is required for mode "package".');
      const pkg = await this.pestPackagesRepo.findOne({ where: { key: dto.packageKey, isActive: true } });
      if (!pkg) throw new NotFoundException('Package not found.');
      const monthlyPrice = await this.computePestPackageMonthlyPrice(customerId, pkg);
      return { type: 'package', monthlyPrice };
    }

    if (!dto.serviceKey) throw new BadRequestException('serviceKey is required for mode "service".');
    const service = await this.pestServicesRepo.findOne({ where: { key: dto.serviceKey, isActive: true } });
    if (!service) throw new NotFoundException('Service not found.');
    const { qty, qty2 } = await this.resolvePestBookingQty(customerId, service.key, dto.qty);
    const membershipPackageKey = await this.getActivePestMembershipPackageKey(customerId);
    const { price, discountRate, comped } = computePestServicePrice(service, qty, qty2, dto.frequency, membershipPackageKey);
    return { type: 'service', price, discountRate, comped };
  }

  // Billing-only: charges a flat monthly Stripe subscription computed fresh
  // from the package's composition against the customer's property profile.
  async subscribePestPackage(customerId: string, dto: SubscribePestPackageDto): Promise<{
    subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null;
  }> {
    const pkg = await this.pestPackagesRepo.findOne({ where: { key: dto.packageKey, isActive: true } });
    if (!pkg) throw new NotFoundException('Package not found.');

    const coreSubscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!coreSubscription) throw new BadRequestException('An active Attenteve plan is required to subscribe to Marketplace services.');

    const monthlyPrice = await this.computePestPackageMonthlyPrice(customerId, pkg);

    const stripeCustomerId = await this.subscriptionsService.getOrCreateStripeCustomer(customerId);
    const customer = await this.stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethod = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;
    if (!defaultPaymentMethod) {
      throw new BadRequestException('Add a payment method in Payments before subscribing to a Marketplace service.');
    }

    const product = await this.ensurePestPackageStripeProduct();

    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          unit_amount: Math.round(monthlyPrice * 100),
          recurring: { interval: 'month' },
        },
      }],
      default_payment_method: defaultPaymentMethod,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { type: 'marketplace_pest_package', customerId, packageKey: dto.packageKey },
    });

    const saved = await this.pestPackageSubscriptionsRepo.save(this.pestPackageSubscriptionsRepo.create({
      customerId,
      packageKey: dto.packageKey,
      computedMonthlyPrice: monthlyPrice,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      startDate: new Date(),
      stripeSubscriptionId: stripeSub.id,
    }));

    const invoice = stripeSub.latest_invoice as Stripe.Invoice;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
    const charged = pi?.status === 'succeeded';

    return {
      subscriptionId: saved.id,
      monthlyPrice,
      charged,
      clientSecret: charged ? null : (pi?.client_secret ?? null),
    };
  }

  private async ensurePestPackageStripeProduct(): Promise<Stripe.Product> {
    const products = await this.stripe.products.list({ limit: 100, active: true });
    const existing = products.data.find((p) => p.name === 'Pest Control Package Subscription');
    if (existing) return existing;
    return this.stripe.products.create({ name: 'Pest Control Package Subscription' });
  }

  async bookPestService(customerId: string, dto: BookPestServiceDto) {
    const service = await this.pestServicesRepo.findOne({ where: { key: dto.serviceKey, isActive: true } });
    if (!service) throw new NotFoundException('Service not found.');
    const { qty, qty2 } = await this.resolvePestBookingQty(customerId, service.key, dto.qty);
    const membershipPackageKey = await this.getActivePestMembershipPackageKey(customerId);
    const { price } = computePestServicePrice(service, qty, qty2, dto.frequency, membershipPackageKey);

    const pestCatalogPrice = await this.servicePriceRepo.findOne({ where: { name: PEST_CONTROL_CATALOG_NAME } });
    if (!pestCatalogPrice) throw new NotFoundException('Pest Control is not currently available.');

    const customer = await this.usersService.findById(customerId);
    const profile = customer.customerProfile;
    if (!profile) throw new BadRequestException('A saved address is required to book a Pest Control service.');

    return this.serviceRequestsService.createMarketplaceBooking(customerId, {
      servicePriceId: pestCatalogPrice.id,
      preferredDate: dto.preferredDate,
      price,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
      nameOverride: service.label,
      descriptionOverride: `${service.label} — ${qty} (${service.pricingUnit})`,
    });
  }

  // ── Recurring visit generation (called by MarketplaceVisitSchedulerService) ─

  async generateDueVisits(): Promise<number> {
    const now = new Date();
    const due = await this.subscriptionsRepo.find({
      where: { status: MarketplaceSubscriptionStatus.ACTIVE, nextVisitDate: LessThanOrEqual(now) },
    });
    if (due.length === 0) return 0;

    const houseCleaningPrice = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!houseCleaningPrice) {
      this.logger.warn('House Cleaning catalog row missing — cannot generate Marketplace visits.');
      return 0;
    }

    let created = 0;
    for (const sub of due) {
      try {
        const customer = await this.usersService.findById(sub.customerId);
        const profile = customer.customerProfile;
        if (!profile) {
          this.logger.warn(`Marketplace subscription ${sub.id}: customer has no saved address, skipping this cycle.`);
          continue;
        }

        await this.serviceRequestsService.createMarketplaceBooking(sub.customerId, {
          servicePriceId: houseCleaningPrice.id,
          preferredDate: sub.nextVisitDate.toISOString(),
          price: Number(sub.computedPerVisitPrice),
          marketplaceSubscriptionId: sub.id,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          zipCode: profile.zipCode,
        });

        sub.nextVisitDate = advanceVisitDate(sub.nextVisitDate, sub.visitFrequency);
        sub.lastVisitGeneratedAt = now;
        await this.subscriptionsRepo.save(sub);
        created++;
      } catch (err: any) {
        this.logger.warn(`Failed to generate Marketplace visit for subscription ${sub.id}: ${err.message}`);
      }
    }
    return created;
  }

  // ── Stripe webhook (dispatched from PaymentsController alongside the core
  // plan's own handler — each independently no-ops if the stripeSubscriptionId
  // isn't theirs, so no metadata-based routing is needed) ─────────────────

  async handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (sub) {
        if (sub.status !== MarketplaceSubscriptionStatus.ACTIVE) {
          sub.status = MarketplaceSubscriptionStatus.ACTIVE;
          await this.subscriptionsRepo.save(sub);
        }
        await this.eventsRepo.save(this.eventsRepo.create({
          marketplaceSubscriptionId: sub.id,
          type: MarketplaceEventType.RENEWED,
          amount: (invoice.amount_paid ?? 0) / 100,
        }));
      }

      const lawncareSub = await this.lawncarePackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (lawncareSub && lawncareSub.status !== MarketplaceSubscriptionStatus.ACTIVE) {
        lawncareSub.status = MarketplaceSubscriptionStatus.ACTIVE;
        await this.lawncarePackageSubscriptionsRepo.save(lawncareSub);
      }

      const lawncareServiceSub = await this.lawncareServiceSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (lawncareServiceSub && lawncareServiceSub.status !== MarketplaceSubscriptionStatus.ACTIVE) {
        lawncareServiceSub.status = MarketplaceSubscriptionStatus.ACTIVE;
        await this.lawncareServiceSubscriptionsRepo.save(lawncareServiceSub);
      }

      const pestSub = await this.pestPackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (pestSub && pestSub.status !== MarketplaceSubscriptionStatus.ACTIVE) {
        pestSub.status = MarketplaceSubscriptionStatus.ACTIVE;
        await this.pestPackageSubscriptionsRepo.save(pestSub);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (sub) {
        sub.status = MarketplaceSubscriptionStatus.PAST_DUE;
        await this.subscriptionsRepo.save(sub);
        await this.eventsRepo.save(this.eventsRepo.create({
          marketplaceSubscriptionId: sub.id,
          type: MarketplaceEventType.PAYMENT_FAILED,
        }));
      }

      const lawncareSub = await this.lawncarePackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (lawncareSub) {
        lawncareSub.status = MarketplaceSubscriptionStatus.PAST_DUE;
        await this.lawncarePackageSubscriptionsRepo.save(lawncareSub);
      }

      const lawncareServiceSub = await this.lawncareServiceSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (lawncareServiceSub) {
        lawncareServiceSub.status = MarketplaceSubscriptionStatus.PAST_DUE;
        await this.lawncareServiceSubscriptionsRepo.save(lawncareServiceSub);
      }

      const pestSub = await this.pestPackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (pestSub) {
        pestSub.status = MarketplaceSubscriptionStatus.PAST_DUE;
        await this.pestPackageSubscriptionsRepo.save(pestSub);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const stripeSub = event.data.object as Stripe.Subscription;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (sub && sub.status !== MarketplaceSubscriptionStatus.CANCELLED) {
        sub.status = MarketplaceSubscriptionStatus.CANCELLED;
        sub.cancelledAt = new Date();
        await this.subscriptionsRepo.save(sub);
        await this.eventsRepo.save(this.eventsRepo.create({
          marketplaceSubscriptionId: sub.id,
          type: MarketplaceEventType.CANCELLED,
        }));
      }

      const lawncareSub = await this.lawncarePackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (lawncareSub && lawncareSub.status !== MarketplaceSubscriptionStatus.CANCELLED) {
        lawncareSub.status = MarketplaceSubscriptionStatus.CANCELLED;
        lawncareSub.cancelledAt = new Date();
        await this.lawncarePackageSubscriptionsRepo.save(lawncareSub);
      }

      const lawncareServiceSub = await this.lawncareServiceSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (lawncareServiceSub && lawncareServiceSub.status !== MarketplaceSubscriptionStatus.CANCELLED) {
        lawncareServiceSub.status = MarketplaceSubscriptionStatus.CANCELLED;
        lawncareServiceSub.cancelledAt = new Date();
        await this.lawncareServiceSubscriptionsRepo.save(lawncareServiceSub);
      }

      const pestSub = await this.pestPackageSubscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (pestSub && pestSub.status !== MarketplaceSubscriptionStatus.CANCELLED) {
        pestSub.status = MarketplaceSubscriptionStatus.CANCELLED;
        pestSub.cancelledAt = new Date();
        await this.pestPackageSubscriptionsRepo.save(pestSub);
      }
    }
  }

  // ── Admin config CRUD (enable/disable + edit-in-place) ─────────────────

  async updateCleaningPlan(id: string, data: Partial<MarketplaceCleaningPlan>) {
    await this.plansRepo.update(id, data);
    return this.plansRepo.findOne({ where: { id } });
  }

  async updateRoomUnit(id: string, data: Partial<MarketplaceRoomUnit>) {
    await this.roomUnitsRepo.update(id, data);
    return this.roomUnitsRepo.findOne({ where: { id } });
  }

  async updateConditionMultiplier(id: string, data: Partial<MarketplaceConditionMultiplier>) {
    await this.conditionsRepo.update(id, data);
    return this.conditionsRepo.findOne({ where: { id } });
  }

  async updateAddOn(id: string, data: Partial<MarketplaceAddOn>) {
    await this.addOnsRepo.update(id, data);
    return this.addOnsRepo.findOne({ where: { id } });
  }

  async updateFrequencyDiscount(id: string, data: Partial<MarketplaceFrequencyDiscount>) {
    await this.frequencyDiscountsRepo.update(id, data);
    return this.frequencyDiscountsRepo.findOne({ where: { id } });
  }

  async updateLawncareService(id: string, data: Partial<MarketplaceLawncareService>) {
    await this.lawncareServicesRepo.update(id, data);
    return this.lawncareServicesRepo.findOne({ where: { id } });
  }

  async updateLawncarePackage(id: string, data: Partial<MarketplaceLawncarePackage>) {
    await this.lawncarePackagesRepo.update(id, data);
    return this.lawncarePackagesRepo.findOne({ where: { id } });
  }

  async updatePestService(id: string, data: Partial<MarketplacePestService>) {
    await this.pestServicesRepo.update(id, data);
    return this.pestServicesRepo.findOne({ where: { id } });
  }

  async updatePestPackage(id: string, data: Partial<MarketplacePestPackage>) {
    await this.pestPackagesRepo.update(id, data);
    return this.pestPackagesRepo.findOne({ where: { id } });
  }
}
