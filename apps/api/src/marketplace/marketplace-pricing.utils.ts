import { BadRequestException } from '@nestjs/common';
import { MarketplaceRoomUnit } from './entities/marketplace-room-unit.entity';
import { MarketplaceConditionMultiplier } from './entities/marketplace-condition-multiplier.entity';
import { MarketplaceAddOn } from './entities/marketplace-add-on.entity';
import { VisitFrequency, VISITS_PER_YEAR } from './enums/marketplace.enum';

export const QUOTE_REQUIRED = 'QUOTE_REQUIRED' as const;

// Sum of (room count × BCU weight) across the customer's house configuration.
export function computeBCU(houseConfig: Record<string, number>, roomUnits: MarketplaceRoomUnit[]): number {
  const unitByKey = new Map(roomUnits.filter((r) => r.isActive).map((r) => [r.key, Number(r.units)]));
  let total = 0;
  for (const [key, count] of Object.entries(houseConfig)) {
    const units = unitByKey.get(key);
    if (units == null || !count) continue;
    total += units * count;
  }
  return total;
}

// One mutually-exclusive base tier (Well Maintained/Average/Not Cleaned 3+
// Months) plus zero or more stacking modifiers (Has Pets/Heavy Pet Hair/Has
// Children) added on top as (multiplier - 1) offsets — e.g. Average (1.1) +
// Has Pets (+0.15) = 1.25x. Hoarding/Severe Dirt always short-circuits to
// QUOTE_REQUIRED regardless of anything else selected.
export function computeConditionMultiplier(
  conditionKeys: string[],
  conditions: MarketplaceConditionMultiplier[],
): number | typeof QUOTE_REQUIRED {
  const byKey = new Map(conditions.filter((c) => c.isActive).map((c) => [c.key, c]));
  const selected = conditionKeys.map((k) => byKey.get(k)).filter((c): c is MarketplaceConditionMultiplier => !!c);

  if (selected.some((c) => c.forcesQuote)) return QUOTE_REQUIRED;

  const baseTier = selected.find((c) => c.isBaseTier);
  if (!baseTier) throw new BadRequestException('A base house condition (Well Maintained / Average / Not Cleaned in 3+ Months) is required.');

  let multiplier = Number(baseTier.multiplier);
  for (const c of selected) {
    if (c.isBaseTier) continue;
    multiplier += Number(c.multiplier) - 1;
  }
  return multiplier;
}

export function computeAddOnsTotal(
  addOns: { key: string; qty?: number }[],
  catalog: MarketplaceAddOn[],
): number {
  const byKey = new Map(catalog.filter((a) => a.isActive).map((a) => [a.key, a]));
  let total = 0;
  for (const { key, qty } of addOns) {
    const addOn = byKey.get(key);
    if (!addOn) continue;
    total += addOn.perUnit ? Number(addOn.customerPrice) * Math.max(1, qty ?? 1) : Number(addOn.customerPrice);
  }
  return total;
}

// (BCU × retail/unit × condition multiplier × (1 − frequency discount)) + add-ons
export function computePerVisitCost(
  bcu: number,
  retailPerUnit: number,
  conditionMultiplier: number,
  frequencyDiscountPercent: number,
  addOnsTotal: number,
): number {
  const discounted = bcu * retailPerUnit * conditionMultiplier * (1 - frequencyDiscountPercent / 100);
  return Math.round((discounted + addOnsTotal) * 100) / 100;
}

// Annual total = per-visit cost × visits/year; the monthly Stripe-billed
// price is that annual total divided by 12 — every subscriber is charged
// monthly regardless of how often the vendor actually visits.
export function computeMonthlySubscriptionPrice(perVisitCost: number, visitFrequency: VisitFrequency): number {
  const visitsPerYear = VISITS_PER_YEAR[visitFrequency];
  const annualTotal = perVisitCost * visitsPerYear;
  return Math.round((annualTotal / 12) * 100) / 100;
}
