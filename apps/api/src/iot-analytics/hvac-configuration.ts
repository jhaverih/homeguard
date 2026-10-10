import { Equipment } from './entities/equipment.entity';

// HVAC system ↔ thermostat-zone mapping (spec §5). Each Nest thermostat is
// one zone; zones are attached to an HVAC equipment (HVAC-01, HVAC-02, …)
// via NestThermostat.equipmentNumber:
//   MULTIZONE — several zones share one air handler (zone dampers): runtime
//               and cycles are merged across zones, never double-counted
//   SINGLE_ZONE — one thermostat, one system
// Merging zones is only safe once someone has confirmed the physical setup,
// so equipment.metadata.verified gates every rule that combines zones;
// until then those rules report Insufficient data instead of guessing.
export type HvacConfiguration = 'MULTIZONE' | 'SINGLE_ZONE';

export interface HvacEquipmentMetadata {
  hvacConfiguration?: HvacConfiguration;
  verified?: boolean;
  verifiedAt?: string;
}

export function isSystemMappingVerified(equipment: Pick<Equipment, 'metadata'> | null | undefined): boolean {
  return (equipment?.metadata as HvacEquipmentMetadata | null)?.verified === true;
}

export const UNVERIFIED_MAPPING_REASON = 'HVAC system mapping not confirmed — confirm which thermostats control this system on the admin Monitoring Setup page';
