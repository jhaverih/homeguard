export enum ServiceCategory {
  INTERIOR_REPAIRS_MAINTENANCE = 'INTERIOR_REPAIRS_MAINTENANCE',
  MINOR_ELECTRICAL_ADJUSTMENTS = 'MINOR_ELECTRICAL_ADJUSTMENTS',
  MINOR_PLUMBING_FIXES = 'MINOR_PLUMBING_FIXES',
  MOUNTING_INSTALLATIONS = 'MOUNTING_INSTALLATIONS',
  CARPENTRY_ASSEMBLY = 'CARPENTRY_ASSEMBLY',
  EXTERIOR_OUTDOOR_SERVICES = 'EXTERIOR_OUTDOOR_SERVICES',
}

// label: customer/admin-facing display text.
// capabilityName: the exact VendorCapability.name already seeded in
// vendor.service.ts ("Handyman broad categories") — lets the pricing seed
// resolve the matching vendor-skill-group capability once per category.
// sortOrder: display/grouping order (doesn't match alphabetical enum order).
export const SERVICE_CATEGORY_META: Record<ServiceCategory, { label: string; capabilityName: string; sortOrder: number }> = {
  [ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE]: { label: 'Interior Repairs and Maintenance', capabilityName: 'Interior Repairs & Maintenance', sortOrder: 1 },
  [ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS]: { label: 'Minor Electrical Adjustments', capabilityName: 'Minor Electrical Adjustments', sortOrder: 2 },
  [ServiceCategory.MINOR_PLUMBING_FIXES]: { label: 'Minor Plumbing Fixes', capabilityName: 'Minor Plumbing Fixes', sortOrder: 3 },
  [ServiceCategory.MOUNTING_INSTALLATIONS]: { label: 'Mounting and Installations', capabilityName: 'Mounting & Installations', sortOrder: 4 },
  [ServiceCategory.CARPENTRY_ASSEMBLY]: { label: 'Carpentry and Assembly', capabilityName: 'Carpentry & Assembly', sortOrder: 5 },
  [ServiceCategory.EXTERIOR_OUTDOOR_SERVICES]: { label: 'Exterior and Outdoor Services', capabilityName: 'Exterior & Outdoor Services', sortOrder: 6 },
};
