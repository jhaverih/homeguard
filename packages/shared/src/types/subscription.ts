export enum PlanTier {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export interface SubscriptionPlan {
  id: string;
  tier: PlanTier;
  name: string;
  description: string;
  price: number;
  inspectionsPerYear: number;
  features: string[];
  isActive: boolean;
}

export interface CustomerSubscription {
  id: string;
  customerId: string;
  planId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  inspectionsUsed: number;
  inspectionsRemaining: number;
  startDate: string;
  endDate: string;
  stripeSubscriptionId?: string;
}

export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  [PlanTier.BASIC]: [
    'AC visual inspection & filter replacement',
    'Toilet water leakage verification',
    'Light bulb replacement check',
    '2 inspections per year',
  ],
  [PlanTier.STANDARD]: [
    'All Basic plan features',
    'AC drainage pan water leak monitoring',
    'Washer machine pan monitoring',
    '2 inspections per year',
  ],
  [PlanTier.PREMIUM]: [
    'All Standard plan features',
    'Full HVAC system monitoring',
    '2 inspections per year',
    'Priority scheduling',
  ],
};
