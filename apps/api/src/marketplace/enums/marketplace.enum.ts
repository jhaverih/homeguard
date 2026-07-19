export enum CleaningType {
  STANDARD = 'STANDARD',
  DEEP = 'DEEP',
  MOVE_OUT = 'MOVE_OUT',
}

// One-time is available to Standard/Deep as a non-subscription booking
// (billed through the existing standalone-service flow, see
// MarketplaceService.bookOneTimeCleaning) — MONTHLY/BIWEEKLY/WEEKLY are the
// three real subscription cadences.
export enum VisitFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  BIWEEKLY = 'BIWEEKLY',
  WEEKLY = 'WEEKLY',
}

export const VISITS_PER_YEAR: Record<VisitFrequency, number> = {
  [VisitFrequency.ONE_TIME]: 1,
  [VisitFrequency.MONTHLY]: 12,
  [VisitFrequency.BIWEEKLY]: 26,
  [VisitFrequency.WEEKLY]: 52,
};

export enum MarketplaceSubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
}

export enum MarketplaceEventType {
  CREATED = 'CREATED',
  RENEWED = 'RENEWED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
}
