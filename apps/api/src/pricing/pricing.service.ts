import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, DataSource } from 'typeorm';
import { ServicePrice } from './entities/service-price.entity';
import { PricingCatalogBackup } from './entities/pricing-catalog-backup.entity';
import { ServiceUnitLabel } from './entities/service-unit-label.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { PricingMethod } from '../common/enums/pricing-method.enum';
import { ServiceCategory, SERVICE_CATEGORY_META } from '../common/enums/service-category.enum';
import { ServiceGroup } from '../common/enums/service-group.enum';
import { formatPriceDisplay, formatCustomerPriceDisplay } from './pricing.utils';

// Trimmed to only what's still live — several of the original entries here
// (Gutters Inspection & Cleaning, both Replace Bulbs variants, Drywall
// Repair/Patching/Painting, Move Furniture, Driveway & Patio Power Wash)
// were deliberately deleted from the catalog to be superseded by the more
// granular, tiered-pricing services in VOLUME_PRICING_CATALOG below — not
// re-adding them here, since this array's seed is idempotent-per-name and
// would otherwise resurrect them on every restart.
const NEW_CATALOG = [
  {
    name: 'Additional Inspection',
    description: 'Add-on inspection visit outside subscription plan',
    basePrice: 40,
    pricingMethod: PricingMethod.FLAT_PRICE,
  },
  {
    name: 'HVAC Full Inspection',
    description: 'Comprehensive HVAC system inspection by certified technician',
    basePrice: 175,
    pricingMethod: PricingMethod.FLAT_PRICE,
  },
  {
    name: 'Solar System',
    description: 'Solar panel inspection and performance review',
    basePrice: 0,
    pricingMethod: PricingMethod.REQUEST_QUOTE,
    requiresQuote: true,
  },
  {
    name: 'Replace AC Unit',
    description: 'Full AC unit replacement — sizing and installation',
    basePrice: 0,
    pricingMethod: PricingMethod.REQUEST_QUOTE,
    requiresQuote: true,
  },
];

const HANDYMAN_CATALOG: { name: string; description: string; category: ServiceCategory }[] = [
  // Trimmed to only what's still live in the catalog — the removed entries
  // (Drywall Work, Trim and Moldings, Weatherization, Fixture Replacement,
  // Faucet Upgrades, Showerheads, Toilet Maintenance, Sealing Gaps, TV
  // Mounting, Furniture Assembly, Pet Doors, Gutter Cleaning, Pressure
  // Washing, Fencing, Deck Upkeep) were deliberately deleted from the
  // catalog to be superseded by more granular, tiered-pricing equivalents in
  // VOLUME_PRICING_CATALOG below. This seed is idempotent per-item (unlike
  // seedPrices() above), so leaving a deleted name in here would resurrect
  // it on every restart — and several of the new names collide with these,
  // which would double-seed the same service under two different pricing
  // models.
  // Interior Repairs and Maintenance
  { name: 'Wall Coverings', description: 'Hanging wallpaper, removing old wallpaper, and painting small accent walls or full rooms.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },
  { name: 'Cabinet Care', description: 'Adjusting loose cabinet hinges, installing new drawer pulls, or replacing cabinet tracks.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },

  // Minor Electrical Adjustments
  { name: 'Devices', description: 'Replacing damaged or outdated wall outlets and light switches with newer models or USB ports.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS },
  { name: 'Smart Home Devices', description: 'Mounting and configuring smart video doorbells, smart thermostats, or wireless security cameras.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS },
  { name: 'Safety Equipment', description: 'Installing or replacing batteries in smoke detectors and carbon monoxide monitors.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS },

  // Mounting and Installations
  { name: 'Window Treatments', description: 'Hanging curtain rods, horizontal blinds, or privacy shades.', category: ServiceCategory.MOUNTING_INSTALLATIONS },
  { name: 'Wall Decor', description: 'Hanging heavy mirrors, multi-paneled artwork, and floating display shelves securely.', category: ServiceCategory.MOUNTING_INSTALLATIONS },
  { name: 'Safety Rails', description: 'Installing grab bars in walk-in showers and anchoring safety rails alongside entry steps.', category: ServiceCategory.MOUNTING_INSTALLATIONS },
  { name: 'Babyproofing', description: 'Installing magnetic cabinet locks, mounting baby gates, and anchoring heavy dressers to the wall studs.', category: ServiceCategory.MOUNTING_INSTALLATIONS },

  // Carpentry and Assembly
  { name: 'Doors and Windows', description: 'Fixing sticking doors, replacing window screens, and installing new door handles or deadbolts.', category: ServiceCategory.CARPENTRY_ASSEMBLY },
];

// The ~40-service tiered volume-discount catalog transcribed from the
// 2026-07-16 pricing sheet. minimumQuantity is intentionally left unset for
// all of these (sheet's own Min Qty column is 1 or blank throughout) — see
// backfillTieredPricingDefaults() above for why that's a distinct field from
// includeQty. volumeDiscountThreshold/volumeDiscountRate are omitted (both
// undefined, calcTieredCost() treats missing threshold as Infinity) for the
// handful of services with no 3rd tier in the sheet (marked N/A there).
type VolumePricingItem = {
  name: string;
  description: string;
  category: ServiceCategory;
  quantityLabel: string;
  basePrice: number;
  includeQty: number;
  baseRateUnit: number;
  volumeDiscountThreshold?: number;
  volumeDiscountRate?: number;
};

const VOLUME_PRICING_CATALOG: VolumePricingItem[] = [
  { name: 'General Handyman Visit', description: 'General repairs and punch-list work.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'HOUR', basePrice: 70, includeQty: 1, baseRateUnit: 70, volumeDiscountThreshold: 1, volumeDiscountRate: 60 },
  { name: 'Drywall Patch (Small)', description: 'Repair nail holes, anchors, and dents up to 2 inches.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'HOLE', basePrice: 70, includeQty: 3, baseRateUnit: 23.33, volumeDiscountThreshold: 11, volumeDiscountRate: 10 },
  { name: 'Medium Drywall Repair', description: 'Repair holes 2-8 inches — mud, sand, and prime.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'HOLE', basePrice: 80, includeQty: 1, baseRateUnit: 75, volumeDiscountThreshold: 5, volumeDiscountRate: 50 },
  { name: 'Wallpaper Removal', description: 'Remove wallpaper and adhesive residue.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'SQ_FT', basePrice: 175, includeQty: 100, baseRateUnit: 1.5, volumeDiscountThreshold: 500, volumeDiscountRate: 1.35 },
  { name: 'Baseboards & Trim', description: 'Install or replace trim and moldings.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'LINEAR_FEET', basePrice: 120, includeQty: 30, baseRateUnit: 3, volumeDiscountThreshold: 200, volumeDiscountRate: 2.70 },
  { name: 'Weather Stripping', description: 'Replace worn seals around doors and windows.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 70, includeQty: 3, baseRateUnit: 12, volumeDiscountThreshold: 10, volumeDiscountRate: 10.8 },
  { name: 'Hardware Replacement', description: 'Install knobs, pulls, and hinges.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 70, includeQty: 10, baseRateUnit: 5, volumeDiscountThreshold: 25, volumeDiscountRate: 4.5 },
  { name: 'Light Fixture Replacement', description: 'Replace existing light fixture.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS, quantityLabel: 'UNIT', basePrice: 70, includeQty: 1, baseRateUnit: 55, volumeDiscountThreshold: 5, volumeDiscountRate: 49.5 },
  { name: 'Ceiling Fan Replacement', description: 'Replace existing fan.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS, quantityLabel: 'UNIT', basePrice: 90, includeQty: 1, baseRateUnit: 75, volumeDiscountThreshold: 4, volumeDiscountRate: 67.5 },
  { name: 'Outlet/Switch Replacement', description: 'Replace existing outlets and switches.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS, quantityLabel: 'UNIT', basePrice: 70, includeQty: 4, baseRateUnit: 11, volumeDiscountThreshold: 20, volumeDiscountRate: 9.9 },
  { name: 'Smart Device Installation', description: 'Install cameras, thermostats, and doorbells.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 45, volumeDiscountThreshold: 5, volumeDiscountRate: 40.5 },
  { name: 'Smoke/CO Detectors', description: 'Install replacement smoke and carbon monoxide detectors.', category: ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS, quantityLabel: 'UNIT', basePrice: 70, includeQty: 4, baseRateUnit: 12, volumeDiscountThreshold: 10, volumeDiscountRate: 10.8 },
  { name: 'Faucet Replacement', description: 'Replace existing faucet.', category: ServiceCategory.MINOR_PLUMBING_FIXES, quantityLabel: 'UNIT', basePrice: 90, includeQty: 1, baseRateUnit: 75, volumeDiscountThreshold: 3, volumeDiscountRate: 67.5 },
  { name: 'Showerhead Installation', description: 'Replace showerhead.', category: ServiceCategory.MINOR_PLUMBING_FIXES, quantityLabel: 'UNIT', basePrice: 70, includeQty: 1, baseRateUnit: 25, volumeDiscountThreshold: 5, volumeDiscountRate: 22.5 },
  { name: 'Toilet Repair', description: 'Replace internal toilet components.', category: ServiceCategory.MINOR_PLUMBING_FIXES, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 60, volumeDiscountThreshold: 3, volumeDiscountRate: 54 },
  { name: 'TV Mounting', description: 'Install mount and hang TV.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 90, includeQty: 1, baseRateUnit: 75, volumeDiscountThreshold: 4, volumeDiscountRate: 67.5 },
  { name: 'Blinds & Curtains', description: 'Install rods, blinds, and shades.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 80, includeQty: 3, baseRateUnit: 15, volumeDiscountThreshold: 10, volumeDiscountRate: 13.5 },
  { name: 'Mirrors & Artwork', description: 'Secure mounting of décor.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 70, includeQty: 3, baseRateUnit: 10, volumeDiscountThreshold: 10, volumeDiscountRate: 9 },
  { name: 'Shelving Installation', description: 'Install shelving systems.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 35, volumeDiscountThreshold: 5, volumeDiscountRate: 31.5 },
  { name: 'Grab Bars', description: 'Install safety grab bars.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 45, volumeDiscountThreshold: 4, volumeDiscountRate: 40.5 },
  { name: 'Door Repairs', description: 'Adjust or repair doors.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 60, volumeDiscountThreshold: 5, volumeDiscountRate: 54 },
  { name: 'Lock Installation', description: 'Install locksets and deadbolts.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 35, volumeDiscountThreshold: 5, volumeDiscountRate: 31.5 },
  { name: 'Window Screen Repair', description: 'Replace screen mesh or frame.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 70, includeQty: 2, baseRateUnit: 10, volumeDiscountThreshold: 10, volumeDiscountRate: 9 },
  { name: 'Pet Door Installation', description: 'Cut opening and install pet door.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 175, includeQty: 1, baseRateUnit: 175 },
  { name: 'Pressure Washing', description: 'Wash surfaces using pressure equipment.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'SQ_FT', basePrice: 150, includeQty: 1000, baseRateUnit: 0.1, volumeDiscountThreshold: 5000, volumeDiscountRate: 0.09 },
  { name: 'Fence Repairs', description: 'Replace pickets and hardware.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 120, includeQty: 5, baseRateUnit: 10, volumeDiscountThreshold: 20, volumeDiscountRate: 9 },
  { name: 'Tile Replacement', description: 'Replace damaged tiles.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 80, includeQty: 3, baseRateUnit: 15, volumeDiscountThreshold: 20, volumeDiscountRate: 13.5 },
  { name: 'Regrouting', description: 'Remove and replace grout.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'SQ_FT', basePrice: 150, includeQty: 100, baseRateUnit: 1, volumeDiscountThreshold: 500, volumeDiscountRate: 0.9 },
  { name: 'Window Repairs', description: 'Repair sash balances, tracks, and hardware.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 50, volumeDiscountThreshold: 5, volumeDiscountRate: 45 },
  { name: 'Backsplash Installation', description: 'Install tile backsplash.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'SQ_FT', basePrice: 250, includeQty: 30, baseRateUnit: 6.5, volumeDiscountThreshold: 100, volumeDiscountRate: 5.85 },
  { name: 'Bathroom Accessories', description: 'Install towel bars, hooks, and mirrors.', category: ServiceCategory.MOUNTING_INSTALLATIONS, quantityLabel: 'UNIT', basePrice: 70, includeQty: 3, baseRateUnit: 10, volumeDiscountThreshold: 10, volumeDiscountRate: 9 },
  { name: 'Attic Ladder Replacement', description: 'Replace attic ladder.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 275, includeQty: 1, baseRateUnit: 275 },
  { name: 'Siding Repair', description: 'Replace damaged siding panels.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 120, includeQty: 3, baseRateUnit: 20, volumeDiscountThreshold: 20, volumeDiscountRate: 18 },
  { name: 'Soffit/Fascia Repair', description: 'Replace damaged trim boards.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 175, includeQty: 25, baseRateUnit: 5, volumeDiscountThreshold: 100, volumeDiscountRate: 4.5 },
  { name: 'Mailbox Installation', description: 'Install mailbox and post.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 150, includeQty: 1, baseRateUnit: 150 },
  { name: 'Porch Swing Installation', description: 'Install porch swing hardware.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 150, includeQty: 1, baseRateUnit: 150 },
  { name: 'Exterior Light Installation', description: 'Replace exterior light fixture.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 45, volumeDiscountThreshold: 5, volumeDiscountRate: 40.5 },
  { name: 'Pipe Insulation', description: 'Install pipe insulation sleeves.', category: ServiceCategory.MINOR_PLUMBING_FIXES, quantityLabel: 'LINEAR_FEET', basePrice: 80, includeQty: 25, baseRateUnit: 1.5, volumeDiscountThreshold: 100, volumeDiscountRate: 1.35 },
  { name: 'Dryer Vent Cleaning', description: 'Clean vent and inspect airflow.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 40 },
  { name: 'Fireplace Mantel Installation', description: 'Install decorative mantel.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 200, includeQty: 1, baseRateUnit: 200 },
  // The 7 rows below weren't in the screenshot originally transcribed —
  // found in the "Service prices" sheet of Service Price models.xlsx (repo
  // root) once that source file surfaced. No 3rd tier: their sheet rows had
  // a text placeholder ("Whole bath package", "Multi-door pricing", etc.)
  // instead of a numeric Volume Discount Threshold.
  { name: 'Recaulking', description: 'Remove and replace caulk.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 30 },
  { name: 'Gutter Cleaning', description: 'Remove debris and flush downspouts.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'LINEAR_FEET', basePrice: 120, includeQty: 150, baseRateUnit: 0.4, volumeDiscountThreshold: 300, volumeDiscountRate: 0.36 },
  { name: 'Deck Board Replacement', description: 'Replace damaged deck boards.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES, quantityLabel: 'UNIT', basePrice: 150, includeQty: 3, baseRateUnit: 25 },
  { name: 'Carpet Stretching', description: 'Re-stretch loose carpet.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, quantityLabel: 'UNIT', basePrice: 150, includeQty: 1, baseRateUnit: 80 },
  { name: 'Garage Shelving', description: 'Install garage storage systems.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 175, includeQty: 1, baseRateUnit: 80 },
  { name: 'Garage Door Maintenance', description: 'Lubricate and adjust door hardware.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 80, includeQty: 1, baseRateUnit: 40 },
  { name: 'Stair Handrail Installation', description: 'Install stair handrails.', category: ServiceCategory.CARPENTRY_ASSEMBLY, quantityLabel: 'UNIT', basePrice: 250, includeQty: 1, baseRateUnit: 175 },
];

// Request-a-Quote services from the same source sheet whose Base Rate/
// Threshold columns are text placeholders ("Complexity based", "$1-1.50/SF"
// range, etc.) rather than a single usable number — plus the entire
// "QUoted services" sheet of the same workbook, which was Request-Quote
// from the start. Seeded the same way seedTradeServices() seeds Solar/
// Roofing/Masonry: basePrice 0, requiresQuote true, category-capability-gated
// like the tiered catalog above (not a specific trade license).
const REQUEST_QUOTE_CATALOG: { name: string; description: string; category: ServiceCategory; serviceGroups?: ServiceGroup[] }[] = [
  { name: 'Large Drywall Repair', description: 'Replace drywall sections, tape, and finish.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },
  { name: 'Interior Painting', description: 'Prep and paint walls.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },
  { name: 'Furniture Assembly', description: 'Assemble customer-provided furniture.', category: ServiceCategory.CARPENTRY_ASSEMBLY },
  { name: 'Closet Shelving', description: 'Install closet organization systems.', category: ServiceCategory.CARPENTRY_ASSEMBLY },
  { name: 'Exercise Equipment Assembly', description: 'Assemble fitness equipment.', category: ServiceCategory.CARPENTRY_ASSEMBLY },
  { name: 'Large Deck Repairs', description: 'Structural deck repairs beyond individual board replacement.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES },
  { name: 'Pergola Assembly', description: 'Assemble and install a pergola.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES },
  { name: 'Gazebo Assembly', description: 'Assemble and install a gazebo.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES },
  { name: 'Crawlspace Repairs', description: 'Crawlspace access, moisture, and structural repairs.', category: ServiceCategory.EXTERIOR_OUTDOOR_SERVICES },
  { name: 'Accessibility Modifications', description: 'Home modifications for accessibility (ramps, widened doorways, rails).', category: ServiceCategory.CARPENTRY_ASSEMBLY },
  { name: 'Wheelchair Ramp Installation', description: 'Design and install a wheelchair ramp.', category: ServiceCategory.CARPENTRY_ASSEMBLY },
  { name: 'Whole-House Painting', description: 'Interior or exterior painting for an entire home.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },
  { name: 'Seasonal Maintenance Package', description: 'Bundled seasonal home maintenance visit.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE },
  // Marketplace, not the general catalog — shows under the customer home
  // screen's "Marketplace" tab (filtered by serviceGroups, a separate tag
  // from category) rather than Repair/Improve, same as how House
  // Cleaning/Lawncare/Pest Control reach customers, just without a bespoke
  // multi-step flow since it's a single Request-Quote item.
  { name: 'Flooring Services', description: 'Flooring installation, repair, and replacement.', category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE, serviceGroups: [ServiceGroup.MARKETPLACE] },
];

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(ServicePrice)
    private pricesRepo: Repository<ServicePrice>,
    @InjectRepository(PricingCatalogBackup)
    private backupRepo: Repository<PricingCatalogBackup>,
    @InjectRepository(VendorCapability)
    private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(ServiceUnitLabel)
    private unitLabelsRepo: Repository<ServiceUnitLabel>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // One-time consolidation of the five old per-X pricing methods into
    // PER_UNIT + a separate Unit Label ran directly against the live DB
    // during the 2026-07-16 deploy (TypeORM's own schema sync runs before
    // onModuleInit and fails outright on rows still holding a
    // soon-to-be-removed enum value, so this couldn't safely run as
    // application code — it's done and verified, not reintroduced here).
    await this.pricesRepo.update({ name: 'HVAC Full Inspection' }, { quantityLabel: 'AC_UNIT' });
    // Links this catalog item to the new HVAC_FULL_INSPECTION checklist group
    // (see inspection-checklist-seed.service.ts) — same always-run, idempotent
    // update pattern as the quantityLabel backfill directly above.
    await this.pricesRepo.update({ name: 'HVAC Full Inspection' }, { checklistGroupKey: 'HVAC_FULL_INSPECTION' });
    await this.pricesRepo.update({ name: 'General Inspection' }, { checklistGroupKey: 'GENERAL_HOME_INSPECTION' });
    // "Comprehensive Home Inspection" already existed as a real, bookable catalog
    // item (created 2026-07-18, $500/$575, PER_UNIT by SqFt) before this checklist
    // work — missed during research, which only found a same-named dead reference
    // in a mobile display-order map and wrongly assumed nothing real existed. A
    // separate "Comprehensive Inspection" ($249) was mistakenly seeded as a
    // duplicate; deactivated live via psql and seedComprehensiveInspection() below
    // removed. This just links the REAL existing item to its checklist group.
    await this.pricesRepo.update({ name: 'Comprehensive Home Inspection' }, { checklistGroupKey: 'COMPREHENSIVE_INSPECTION' });
    await this.seedPrices();
    await this.seedMonitoringService();
    await this.seedTradeServices();
    await this.seedHandymanCategoryServices();
    await this.backfillTieredPricingDefaults();
    await this.seedVolumePricingCatalog();
    await this.seedQuoteCatalog();
    await this.seedFlooringCapability();
    await this.seedUnitLabels();
  }

  // One-time seed of the original 9 hardcoded UnitLabel enum values into the
  // new admin-manageable table — idempotent per-code like the other seeds
  // above. 'HOUR' and 'NONE' are marked isSystem since service-price.entity.ts's
  // lifecycle hooks compare quantityLabel against those two literals directly;
  // the other 7 are ordinary, fully rename/delete-able rows from day one.
  private async seedUnitLabels() {
    const SEED_LABELS: { code: string; label: string }[] = [
      { code: 'HOUR', label: 'Hour' },
      { code: 'SQ_FT', label: 'SqFt' },
      { code: 'BULB', label: 'Bulb' },
      { code: 'SERVICE_TRIP', label: 'Service Trip' },
      { code: 'AC_UNIT', label: 'AC Unit' },
      { code: 'HOLE', label: 'Hole' },
      { code: 'LINEAR_FEET', label: 'Linear Feet' },
      { code: 'UNIT', label: 'Unit' },
      { code: 'NONE', label: 'None' },
    ];
    for (const item of SEED_LABELS) {
      const existing = await this.unitLabelsRepo.findOne({ where: { code: item.code } });
      if (existing) continue;
      await this.unitLabelsRepo.save(this.unitLabelsRepo.create({
        code: item.code,
        label: item.label,
        isSystem: item.code === 'HOUR' || item.code === 'NONE',
      }));
    }
  }

  // One-time-per-row backfill: gives every pre-existing PER_UNIT service tier
  // fields that reproduce today's flat basePrice × qty behavior exactly
  // (includeQty=1, baseRateUnit=basePrice, no volume-discount tier), so nothing
  // changes for them until an admin configures real tiers. Gated on
  // includeQty IS NULL, so it only ever touches a row once.
  private async backfillTieredPricingDefaults() {
    const untiered = await this.pricesRepo.find({
      where: { pricingMethod: PricingMethod.PER_UNIT, includeQty: IsNull() },
    });
    for (const row of untiered) {
      await this.pricesRepo.update(row.id, { includeQty: 1, baseRateUnit: row.basePrice });
    }
    if (untiered.length) {
      this.logger.log(`Backfilled tiered-pricing defaults for ${untiered.length} existing Per Unit service(s).`);
    }
  }

  // Guards the one-time bootstrap seed on whether the table has ANY rows at
  // all, not a specific row's name — name-matching here previously meant
  // renaming "Additional Inspection" (e.g. to "General Inspection") made
  // this look like a never-seeded database on the next restart, silently
  // wiping and reseeding the ENTIRE catalog (losing every admin edit,
  // including all serviceGroups tagging) from the small hardcoded list
  // below. Confirmed as the cause of a real data-loss incident 2026-07-18 —
  // count() is immune to admin renames since it doesn't care which rows exist.
  private async seedPrices() {
    const count = await this.pricesRepo.count();
    if (count > 0) return;

    // Wrapped in a transaction — a mid-loop failure previously left the
    // catalog wiped (old rows already deleted, new ones only partially
    // inserted), same failure mode as the vendor-capabilities bug fixed
    // 2026-07-18.
    await this.dataSource.transaction(async (manager) => {
      await manager.createQueryBuilder().delete().from(ServicePrice).execute();
      for (const item of NEW_CATALOG) {
        await manager.save(ServicePrice, manager.create(ServicePrice, item));
      }
    });
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
      gmPercent: 0,
      pricingMethod: PricingMethod.ONE_TIME_FEE,
      customerRequestable: false,
      requiredCapabilityId: capability.id,
    }));
    this.logger.log('Seeded "Home Monitoring Setup" service ($149, Yolink-capability-gated, Attenteve-triggered only).');
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
        pricingMethod: PricingMethod.REQUEST_QUOTE,
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

  // Idempotent per-item like seedTradeServices() — safe to re-run every boot.
  // Wires each new handyman service to the matching one of the 6 dormant
  // "Handyman broad categories" capability rows (vendor.service.ts), so
  // requesting one of these services immediately gates on the same category
  // a vendor already self-selects as a skill group via /vendor/me/capabilities.
  private async seedHandymanCategoryServices() {
    const capabilityCache = new Map<string, VendorCapability | null>();
    const resolveCapability = async (name: string) => {
      if (!capabilityCache.has(name)) {
        capabilityCache.set(name, await this.capabilityRepo.findOne({ where: { name } }));
      }
      return capabilityCache.get(name)!;
    };

    for (const item of HANDYMAN_CATALOG) {
      const existing = await this.pricesRepo.findOne({ where: { name: item.name } });
      if (existing) continue;

      const capabilityName = SERVICE_CATEGORY_META[item.category].capabilityName;
      const capability = await resolveCapability(capabilityName);
      if (!capability) {
        this.logger.warn(`"${capabilityName}" capability not found yet — will retry seeding "${item.name}" price on next restart.`);
        continue;
      }

      await this.pricesRepo.save(this.pricesRepo.create({
        name: item.name,
        description: item.description,
        category: item.category,
        basePrice: 85,
        pricingMethod: PricingMethod.PER_UNIT,
        quantityLabel: 'HOUR',
        requiresQuote: false,
        requiredCapabilityId: capability.id,
      }));
      this.logger.log(`Seeded "${item.name}" service ($85/hr, ${capabilityName}-capability-gated, category ${item.category}).`);
    }
  }

  // Idempotent per-item, same capability-resolution pattern as
  // seedHandymanCategoryServices() above — seeds the ~40-service tiered
  // volume-discount catalog from the 2026-07-16 pricing sheet.
  private async seedVolumePricingCatalog() {
    const capabilityCache = new Map<string, VendorCapability | null>();
    const resolveCapability = async (name: string) => {
      if (!capabilityCache.has(name)) {
        capabilityCache.set(name, await this.capabilityRepo.findOne({ where: { name } }));
      }
      return capabilityCache.get(name)!;
    };

    for (const item of VOLUME_PRICING_CATALOG) {
      const existing = await this.pricesRepo.findOne({ where: { name: item.name } });
      if (existing) continue;

      const capabilityName = SERVICE_CATEGORY_META[item.category].capabilityName;
      const capability = await resolveCapability(capabilityName);
      if (!capability) {
        this.logger.warn(`"${capabilityName}" capability not found yet — will retry seeding "${item.name}" price on next restart.`);
        continue;
      }

      await this.pricesRepo.save(this.pricesRepo.create({
        name: item.name,
        description: item.description,
        category: item.category,
        basePrice: item.basePrice,
        pricingMethod: PricingMethod.PER_UNIT,
        quantityLabel: item.quantityLabel,
        requiresQuote: false,
        requiredCapabilityId: capability.id,
        includeQty: item.includeQty,
        baseRateUnit: item.baseRateUnit,
        volumeDiscountThreshold: item.volumeDiscountThreshold ?? null,
        volumeDiscountRate: item.volumeDiscountRate ?? null,
      }));
      this.logger.log(`Seeded "${item.name}" tiered service ($${item.basePrice} payout, includes ${item.includeQty}, ${capabilityName}-capability-gated).`);
    }
  }

  // Idempotent per-item, same pattern as seedVolumePricingCatalog() above —
  // seeds the Request-a-Quote services from the same source workbook.
  private async seedQuoteCatalog() {
    const capabilityCache = new Map<string, VendorCapability | null>();
    const resolveCapability = async (name: string) => {
      if (!capabilityCache.has(name)) {
        capabilityCache.set(name, await this.capabilityRepo.findOne({ where: { name } }));
      }
      return capabilityCache.get(name)!;
    };

    for (const item of REQUEST_QUOTE_CATALOG) {
      const existing = await this.pricesRepo.findOne({ where: { name: item.name } });
      if (existing) continue;

      const capabilityName = SERVICE_CATEGORY_META[item.category].capabilityName;
      const capability = await resolveCapability(capabilityName);
      if (!capability) {
        this.logger.warn(`"${capabilityName}" capability not found yet — will retry seeding "${item.name}" price on next restart.`);
        continue;
      }

      await this.pricesRepo.save(this.pricesRepo.create({
        name: item.name,
        description: item.description,
        category: item.category,
        serviceGroups: item.serviceGroups ?? null,
        basePrice: 0,
        pricingMethod: PricingMethod.REQUEST_QUOTE,
        requiresQuote: true,
        requiredCapabilityId: capability.id,
      }));
      this.logger.log(`Seeded "${item.name}" quote-based service (${capabilityName}-capability-gated, category ${item.category}).`);
    }
  }

  // "Flooring Services" was seeded above sharing Interior Repairs &
  // Maintenance's capability — it needs its own dedicated one (shown under
  // the vendor Capabilities page's "Specialties" group via
  // SPECIALTY_NAME_OVERRIDES in apps/vendor/src/app/capabilities/page.tsx,
  // same treatment as Cleaning Services/Lawn & Landscaping/Pest Control).
  // Same shape as MarketplaceService's seedLawncareCapabilityAndCatalog(),
  // minus the placeholder catalog row — Flooring Services already IS the
  // real catalog row, just needs re-pointing at the new capability once.
  private async seedFlooringCapability() {
    let capability = await this.capabilityRepo.findOne({ where: { name: 'Flooring' } });
    if (!capability) {
      capability = await this.capabilityRepo.save(this.capabilityRepo.create({ name: 'Flooring' }));
    }

    const flooringServices = await this.pricesRepo.findOne({ where: { name: 'Flooring Services' } });
    if (flooringServices && flooringServices.requiredCapabilityId !== capability.id) {
      await this.pricesRepo.update(flooringServices.id, { requiredCapabilityId: capability.id });
    }
  }

  // Live code->label lookup for the admin-manageable unit-label list — the
  // table is tiny (~10-15 rows), so a fresh query per request is simplest
  // and avoids any cache-invalidation complexity.
  private async getUnitLabelMap(): Promise<Record<string, string>> {
    const labels = await this.unitLabelsRepo.find();
    return Object.fromEntries(labels.map((l) => [l.code, l.label]));
  }

  // Attaches the derived, read-only priceDisplay string every consumer used
  // to read off the old free-text priceNote column. Mutates the loaded
  // instance (rather than spreading into a plain object) so it still
  // satisfies ServicePrice's shape, including its lifecycle-hook method.
  private withDisplay(item: ServicePrice, labelMap: Record<string, string>): ServicePrice & { priceDisplay: string; customerPriceDisplay: string } {
    return Object.assign(item, { priceDisplay: formatPriceDisplay(item, labelMap), customerPriceDisplay: formatCustomerPriceDisplay(item, labelMap) });
  }

  async getAll(includeInactive = false): Promise<(ServicePrice & { priceDisplay: string })[]> {
    const items = await this.pricesRepo.find(includeInactive ? {} : { where: { isActive: true } });
    const labelMap = await this.getUnitLabelMap();
    return items.map((item) => this.withDisplay(item, labelMap));
  }

  async findByName(name: string): Promise<ServicePrice | null> {
    return this.pricesRepo.findOne({ where: { name } });
  }

  async update(id: string, data: Partial<ServicePrice>): Promise<ServicePrice & { priceDisplay: string }> {
    // Load-merge-save (not repo.update()) so the ServicePrice entity's
    // @BeforeUpdate lifecycle hook actually fires — TypeORM skips entity
    // hooks on the query-builder-style bulk .update() path.
    const existing = await this.pricesRepo.findOneOrFail({ where: { id } });
    this.pricesRepo.merge(existing, data);
    const saved = await this.pricesRepo.save(existing);
    await this.recordBackup('update', saved.name);
    return this.withDisplay(saved, await this.getUnitLabelMap());
  }

  async bulkUpdateCategory(ids: string[], category: ServiceCategory | null): Promise<(ServicePrice & { priceDisplay: string })[]> {
    // Plain query-builder update is safe here (unlike update() above) since
    // category isn't touched by the @BeforeUpdate quote/pricingMethod sync hook.
    await this.pricesRepo.update({ id: In(ids) }, { category });
    const items = await this.pricesRepo.find({ where: { id: In(ids) } });
    await this.recordBackup('bulk-category', `${ids.length} item${ids.length === 1 ? '' : 's'} → ${category ?? 'Uncategorized'}`);
    const labelMap = await this.getUnitLabelMap();
    return items.map((item) => this.withDisplay(item, labelMap));
  }

  async create(data: Partial<ServicePrice>): Promise<ServicePrice & { priceDisplay: string }> {
    const saved = await this.pricesRepo.save(this.pricesRepo.create(data));
    await this.recordBackup('create', saved.name);
    return this.withDisplay(saved, await this.getUnitLabelMap());
  }

  async remove(id: string): Promise<void> {
    const existing = await this.pricesRepo.findOne({ where: { id } });
    await this.pricesRepo.delete(id);
    await this.recordBackup('delete', existing?.name ?? id);
  }

  // Full-catalog snapshot taken after every mutation above (including CSV
  // imports, which go through create()/update() same as manual edits) — see
  // PricingCatalogBackup. A failure here must never block the pricing write
  // it's recording, hence the swallow-and-log rather than propagating.
  private async recordBackup(reason: string, detail?: string | null): Promise<void> {
    try {
      const items = await this.pricesRepo.find();
      await this.backupRepo.save(this.backupRepo.create({
        reason,
        detail: detail ?? null,
        itemCount: items.length,
        snapshot: items,
      }));
    } catch (err: any) {
      this.logger.warn(`Failed to record pricing catalog backup (${reason}): ${err.message}`);
    }
  }

  async listBackups(): Promise<Omit<PricingCatalogBackup, 'snapshot'>[]> {
    return this.backupRepo.find({
      select: ['id', 'reason', 'detail', 'itemCount', 'createdAt'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // Mirrors the admin Pricing page's client-side exportCsv() column-for-column
  // so a downloaded backup can be re-imported through the existing CSV import
  // flow unchanged (including matching by id to update rows in place).
  async getBackupCsv(id: string): Promise<string> {
    const backup = await this.backupRepo.findOneOrFail({ where: { id } });
    const headers = ['id', 'name', 'description', 'pricingMethod', 'requiresQuote', 'basePrice', 'gmPercent', 'quantityLabel', 'minimumQuantity', 'includeQty', 'baseRateUnit', 'volumeDiscountThreshold', 'volumeDiscountRate', 'isActive', 'customerRequestable', 'category', 'Type of Service', 'isQuotaInspection'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = (backup.snapshot as ServicePrice[]).map((p) => [
      esc(p.id),
      esc(p.name),
      esc(p.description),
      esc(p.pricingMethod),
      p.requiresQuote ? 'true' : 'false',
      p.basePrice,
      p.gmPercent ?? '',
      esc(p.quantityLabel ?? ''),
      p.minimumQuantity ?? '',
      p.includeQty ?? '',
      p.baseRateUnit ?? '',
      p.volumeDiscountThreshold ?? '',
      p.volumeDiscountRate ?? '',
      p.isActive ? 'true' : 'false',
      p.customerRequestable ? 'true' : 'false',
      esc(p.category ?? ''),
      esc((p.serviceGroups ?? []).join(',')),
      p.isQuotaInspection ? 'true' : 'false',
    ].join(','));
    return [headers.join(','), ...rows].join('\r\n');
  }

  // --- Admin-manageable Unit Labels (service_unit_labels) ---

  async getUnitLabels(): Promise<ServiceUnitLabel[]> {
    return this.unitLabelsRepo.find({ order: { label: 'ASC' } });
  }

  // code is generated once here and is then immutable — see the entity's
  // comment for why (it's what ServicePrice.quantityLabel actually stores,
  // so a stable code lets rename update every catalog item's display
  // instantly without writing to a single ServicePrice row).
  async createUnitLabel(label: string): Promise<ServiceUnitLabel> {
    const trimmed = label.trim();
    let code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'LABEL';
    let suffix = 1;
    while (await this.unitLabelsRepo.findOne({ where: { code } })) {
      suffix += 1;
      code = `${code.replace(/_\d+$/, '')}_${suffix}`;
    }
    return this.unitLabelsRepo.save(this.unitLabelsRepo.create({ code, label: trimmed }));
  }

  async updateUnitLabel(id: string, label: string): Promise<ServiceUnitLabel> {
    const existing = await this.unitLabelsRepo.findOneOrFail({ where: { id } });
    existing.label = label.trim();
    return this.unitLabelsRepo.save(existing);
  }

  async removeUnitLabel(id: string): Promise<void> {
    const existing = await this.unitLabelsRepo.findOneOrFail({ where: { id } });
    if (existing.isSystem) {
      throw new BadRequestException(`"${existing.label}" is required by the pricing engine and can't be deleted.`);
    }
    await this.unitLabelsRepo.delete(id);
  }
}
