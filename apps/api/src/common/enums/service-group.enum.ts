// Named ServiceGroup, not ServiceType — ServiceType already exists on
// ServiceRequest (SCHEDULED_INSPECTION | ADDITIONAL_SERVICE), an unrelated
// concept. This is an additive, multi-valued classification orthogonal to
// ServiceCategory (trade/domain, e.g. "Minor Electrical Adjustments") — a
// single service can carry one or more of these lifecycle-stage tags.
export enum ServiceGroup {
  INSPECT = 'INSPECT',
  REPAIR = 'REPAIR',
  IMPROVE = 'IMPROVE',
  MAINTAIN = 'MAINTAIN',
  INSTALL = 'INSTALL',
}

export const SERVICE_GROUP_META: Record<ServiceGroup, { label: string; icon: string }> = {
  [ServiceGroup.INSPECT]: { label: 'Inspect', icon: 'home-outline' },
  [ServiceGroup.REPAIR]: { label: 'Repair', icon: 'construct-outline' },
  [ServiceGroup.IMPROVE]: { label: 'Improve', icon: 'sparkles-outline' },
  [ServiceGroup.MAINTAIN]: { label: 'Maintain', icon: 'refresh-outline' },
  [ServiceGroup.INSTALL]: { label: 'Install', icon: 'cube-outline' },
};
