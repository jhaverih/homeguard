import { SensorRole } from '../common/enums/sensor-role.enum';

// The 8 homeowner-facing HVAC "Component Health" tiles. Each maps to the
// sensor role(s) that make it monitorable and the rule group(s) whose
// findings roll up into its status — see ComponentHealthService for how
// this drives NOT_MONITORED/GOOD/ATTENTION/CRITICAL. Adding a new component
// or wiring up a new sensor role never touches the rollup logic itself,
// only this table.
export interface ComponentDefinition {
  id: string;
  label: string;
  // Any ONE of these tagged for the customer is enough to consider the
  // component monitored (not all required) — e.g. Cooling/Heating
  // Performance goes live off Indoor Temperature alone, before Return/
  // Supply Air are installed.
  requiredSensorRoles: SensorRole[];
  ruleGroups: string[];
}

export const COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  {
    id: 'AIRFLOW', label: 'Airflow',
    requiredSensorRoles: [SensorRole.HVAC_STATIC_PRESSURE],
    ruleGroups: ['HVAC_AIRFLOW'],
  },
  {
    // Indoor Temperature is included here (not treated as a separate
    // "indoor comfort" concern) because an out-of-range reading is itself
    // a downstream symptom of the HVAC system underperforming or failing —
    // too hot is dangerous, too cold risks frozen water lines. It activates
    // this tile on its own, ahead of Return/Supply Air being installed.
    id: 'PERFORMANCE', label: 'Cooling / Heating Performance',
    requiredSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.INDOOR_AMBIENT_TEMP],
    ruleGroups: ['HVAC_PERFORMANCE', 'INDOOR_CLIMATE'],
  },
  {
    id: 'CONDENSATE', label: 'Condensate / Drain',
    requiredSensorRoles: [SensorRole.HVAC_DRAIN_WATER],
    ruleGroups: ['HVAC_WATER'],
  },
  {
    id: 'BLOWER', label: 'Blower / Fan',
    requiredSensorRoles: [SensorRole.HVAC_BLOWER_POWER],
    ruleGroups: ['HVAC_BLOWER'],
  },
  {
    id: 'CONTROLS', label: 'Controls / Thermostat',
    requiredSensorRoles: [SensorRole.HVAC_THERMOSTAT_SETPOINT],
    ruleGroups: ['HVAC_COMFORT'],
  },
  {
    id: 'REFRIGERANT', label: 'Refrigerant Circuit',
    requiredSensorRoles: [SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP],
    ruleGroups: ['HVAC_REFRIGERANT'],
  },
  {
    id: 'COMPRESSOR', label: 'Compressor',
    requiredSensorRoles: [SensorRole.HVAC_COMPRESSOR_POWER],
    ruleGroups: ['HVAC_COMPRESSOR'],
  },
  {
    // General/whole-unit power only — Compressor and Blower each read from
    // their own dedicated power sensor, so a single abnormal reading can
    // never flag Electrical alongside either of them.
    id: 'ELECTRICAL', label: 'Electrical',
    requiredSensorRoles: [SensorRole.HVAC_POWER],
    ruleGroups: ['HVAC_ELECTRICAL'],
  },
];
