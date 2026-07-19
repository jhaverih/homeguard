// Named ServiceGroup, not ServiceType — ServiceType already exists on
// ServiceRequest (SCHEDULED_INSPECTION | ADDITIONAL_SERVICE), an unrelated
// concept. This is an additive, multi-valued classification orthogonal to
// ServiceCategory (trade/domain, e.g. "Minor Electrical Adjustments") — a
// single service can carry one or more of these lifecycle-stage tags.
//
// INSTALL was merged into IMPROVE and removed 2026-07-19 — any live
// service_prices row still tagged INSTALL was retagged to IMPROVE as part
// of that change (serviceGroups is admin-set runtime data, not seeded).
// MARKETPLACE was added the same day for separately-billed recurring
// subscriptions (see apps/api/src/marketplace/), distinct from the other
// four one-off-service lifecycle stages.
export enum ServiceGroup {
  INSPECT = 'INSPECT',
  REPAIR = 'REPAIR',
  IMPROVE = 'IMPROVE',
  MAINTAIN = 'MAINTAIN',
  MARKETPLACE = 'MARKETPLACE',
}

export const SERVICE_GROUP_META: Record<ServiceGroup, { label: string; icon: string }> = {
  [ServiceGroup.INSPECT]: { label: 'Inspect', icon: 'home-outline' },
  [ServiceGroup.REPAIR]: { label: 'Repair', icon: 'construct-outline' },
  [ServiceGroup.IMPROVE]: { label: 'Improve', icon: 'sparkles-outline' },
  [ServiceGroup.MAINTAIN]: { label: 'Maintain', icon: 'refresh-outline' },
  [ServiceGroup.MARKETPLACE]: { label: 'Marketplace', icon: 'storefront-outline' },
};
