export interface SeasonalTip {
  text: string;
  // Orderable tips get a checkbox in the mobile UI and can be bundled into a
  // service-request draft; informational tips are plain, non-interactive
  // bullets — not everything a homeowner should know about is something
  // Attenteve can be booked to do.
  orderable: boolean;
}

export type SeasonGroup = 'spring' | 'summer' | 'fall' | 'winter' | 'annual';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export const SEASON_GROUP_LABELS: Record<SeasonGroup, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
  annual: 'Annual Maintenance — Tennessee-Specific Priorities',
};

export const SEASONAL_TIPS: Record<SeasonGroup, SeasonalTip[]> = {
  spring: [
    { text: 'Inspect the roof for storm damage from winter weather and early spring thunderstorms, including missing shingles and damaged flashing', orderable: true },
    { text: 'Clean gutters and downspouts to prepare for heavy spring rains', orderable: true },
    { text: 'Check drainage around the foundation to prevent basement or crawlspace moisture issues', orderable: true },
    { text: "Inspect crawlspaces for moisture and mold, which are common in Tennessee's humid climate", orderable: true },
    { text: 'Test sump pumps and ensure they discharge away from the home', orderable: true },
    { text: 'Service the HVAC system before summer heat and humidity arrive', orderable: true },
    { text: 'Trim trees and remove dead limbs before severe storm and tornado season', orderable: true },
    { text: 'Inspect decks and fences for moisture damage and mildew', orderable: true },
    { text: 'Check for termites and other pests, which become active in spring', orderable: true },
    { text: 'Review emergency supplies and storm plans for severe weather season', orderable: true },
  ],
  summer: [
    { text: 'Replace HVAC filters regularly and keep outdoor condenser units free of debris', orderable: true },
    { text: 'Monitor indoor humidity levels and consider using dehumidifiers, especially in basements and crawlspaces', orderable: true },
    { text: 'Inspect crawlspace encapsulation and vapor barriers for damage or moisture buildup', orderable: true },
    { text: 'Control mosquitoes by eliminating standing water in gutters, birdbaths, and containers', orderable: true },
    { text: 'Inspect siding and exterior paint for mildew or moisture-related deterioration', orderable: true },
    { text: 'Clean and seal decks, porches, and fences to protect against humidity and sun exposure', orderable: true },
    { text: 'Inspect attic ventilation to reduce heat buildup and lower cooling costs', orderable: true },
    { text: 'Check irrigation systems and water lawns efficiently during dry periods', orderable: true },
    { text: 'Clean dryer vents and exhaust fans to improve efficiency and reduce fire risk', orderable: true },
    { text: 'Prepare for severe thunderstorms and power outages by checking flashlights, batteries, and backup power sources', orderable: false },
  ],
  fall: [
    { text: 'Remove leaves from gutters and roof valleys to prevent water backups', orderable: true },
    { text: 'Schedule furnace maintenance before colder temperatures arrive', orderable: true },
    { text: 'Seal gaps around windows and doors to improve energy efficiency', orderable: true },
    { text: 'Inspect and clean chimneys and fireplaces before use', orderable: true },
    { text: 'Winterize outdoor faucets and irrigation systems to prevent freeze damage', orderable: false },
    { text: "Rake leaves away from the home's foundation to discourage pests and moisture problems", orderable: true },
    { text: 'Inspect crawlspaces for rodent entry points as temperatures cool', orderable: true },
    { text: 'Trim tree limbs that could break during ice storms', orderable: true },
    { text: 'Test smoke and carbon monoxide detectors', orderable: true },
    { text: 'Inspect weather stripping and attic insulation before winter', orderable: true },
  ],
  winter: [
    { text: 'Protect exposed pipes in crawlspaces, garages, and exterior walls from freezing temperatures', orderable: true },
    { text: 'Keep crawlspace vents managed appropriately based on whether the crawlspace is vented or encapsulated', orderable: false },
    { text: 'Inspect attic insulation and air leaks to reduce heating costs', orderable: true },
    { text: 'Monitor for ice accumulation on roofs and gutters during winter storms', orderable: false },
    { text: 'Test generators and backup batteries, as ice storms can cause power outages', orderable: true },
    { text: 'Check for water leaks or condensation, especially around windows and crawlspaces', orderable: true },
    { text: 'Maintain heating systems and replace furnace filters', orderable: true },
    { text: 'Inspect for rodents and other pests seeking warmth indoors', orderable: true },
    { text: 'Keep walkways clear of ice and fallen branches', orderable: true },
    { text: 'Review emergency supplies, including bottled water, blankets, medications, and portable chargers', orderable: false },
  ],
  annual: [
    { text: 'Crawlspace moisture control and encapsulation', orderable: false },
    { text: 'Termite inspections and prevention', orderable: true },
    { text: 'Storm preparedness for tornadoes and severe thunderstorms', orderable: false },
    { text: 'Tree maintenance due to frequent storm damage', orderable: true },
    { text: 'Gutter and drainage management because of heavy rainfall', orderable: true },
    { text: 'Humidity control to prevent mold and mildew growth', orderable: false },
  ],
};

export function getCurrentSeason(date = new Date()): Season {
  const month = date.getMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}
