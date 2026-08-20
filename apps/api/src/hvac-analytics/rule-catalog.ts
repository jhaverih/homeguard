import { SensorRole } from '../common/enums/sensor-role.enum';

// Static catalog of every rule in the Attenteve HVAC Analytics spec — used
// to compute the "rules not available for this customer" list (admin page)
// and drive which findings a customer's tier unlocks. Two independent gates
// decide availability, both surfaced honestly rather than collapsed into one
// generic "unavailable":
//   - a required SensorRole isn't tagged on any of the home's devices, or
//   - a required non-Yolink integration doesn't exist yet (thermostat
//     setpoint/mode, HVAC/blower power, outdoor weather — none of these are
//     wired to anything today), or
//   - the rule is baseline-comparative and no baseline engine exists yet, or
//   - the rule simply isn't implemented yet (see `implemented`).
export interface RuleDefinition {
  id: string;
  label: string;
  description: string;
  requiredSensorRoles: SensorRole[];
  requiredIntegrations: string[];
  needsBaseline: boolean;
  implemented: boolean;
  // Which tier unlocks this rule's findings — CarePlus only gets the two
  // synthetic tier-scoped rules below; everything else is Proactive+.
  careplusEligible: boolean;
}

export const RULE_CATALOG: RuleDefinition[] = [
  // ── Synthetic tier-scoped rules (not spec-numbered, but explicitly called
  // out as CarePlus's two allowances: low/high indoor temp and drain-pan leak) ──
  {
    id: 'INDOOR-TEMP-001', label: 'Low / High Indoor Temperature',
    description: 'Indoor temperature outside a safe/comfortable range.',
    requiredSensorRoles: [SensorRole.AMBIENT_TEMP], requiredIntegrations: [], needsBaseline: false,
    implemented: true, careplusEligible: true,
  },

  // ── Sensor validation (HVAC-SENSOR-*) — apply per-tagged-device, so
  // "available" just needs at least one analytics-tagged sensor of any role ──
  { id: 'HVAC-SENSOR-001', label: 'Missing Sensor', description: 'A required sensor has not reported in too long.', requiredSensorRoles: [], requiredIntegrations: [], needsBaseline: false, implemented: true, careplusEligible: true },
  { id: 'HVAC-SENSOR-002', label: 'Low Battery', description: 'Sensor battery is low.', requiredSensorRoles: [], requiredIntegrations: [], needsBaseline: false, implemented: true, careplusEligible: true },
  { id: 'HVAC-SENSOR-003', label: 'Implausible Reading', description: 'Reading outside plausible range or an unconfirmed sudden jump.', requiredSensorRoles: [], requiredIntegrations: [], needsBaseline: false, implemented: false, careplusEligible: false },
  { id: 'HVAC-SENSOR-004', label: 'Supply/Return Sensors Reversed', description: 'Possible sensor configuration error.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: false, implemented: false, careplusEligible: false },

  // ── Condensate / water (highest priority per spec) ──
  { id: 'HVAC-WATER-001', label: 'Water Detected', description: 'Water detected in a monitored drain pan.', requiredSensorRoles: [SensorRole.DRAIN_WATER], requiredIntegrations: [], needsBaseline: false, implemented: true, careplusEligible: true },
  { id: 'HVAC-WATER-002', label: 'Persistent Water', description: 'Water remains detected — escalating urgency.', requiredSensorRoles: [SensorRole.DRAIN_WATER], requiredIntegrations: [], needsBaseline: false, implemented: true, careplusEligible: true },
  { id: 'HVAC-WATER-003', label: 'Repeated Water Events', description: '2+ water events within 30 days.', requiredSensorRoles: [SensorRole.DRAIN_WATER], requiredIntegrations: [], needsBaseline: false, implemented: true, careplusEligible: true },

  // ── Cooling / heating performance ──
  { id: 'HVAC-COOL-001', label: 'Low Cooling Differential', description: 'Cooling delta-T below broad reference range / baseline.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: false, implemented: false, careplusEligible: false },
  { id: 'HVAC-COOL-002', label: 'Severe Cooling Degradation', description: 'Cooling delta-T severely below baseline.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-COOL-003', label: 'Supply Temperature Not Responding', description: 'Supply temp drop smaller than historical baseline.', requiredSensorRoles: [SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-COOL-004', label: 'Cooling Deterioration Trend', description: '30-day rolling delta-T decline vs. prior period.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-HEAT-001', label: 'Heating Differential', description: 'Heating delta-T below broad reference range / baseline.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP], requiredIntegrations: [], needsBaseline: false, implemented: false, careplusEligible: false },

  // ── Runtime ──
  { id: 'HVAC-RUNTIME-001', label: 'Excessive Runtime', description: 'Daily runtime above baseline for comparable weather.', requiredSensorRoles: [], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-RUNTIME-002', label: 'Long Continuous Cycle', description: 'Single cycle runs far longer than baseline.', requiredSensorRoles: [], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-RUNTIME-003', label: 'Short Cycling', description: '3+ short ON/OFF cycles within 60 minutes.', requiredSensorRoles: [], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: false, implemented: false, careplusEligible: false },

  // ── Comfort ──
  { id: 'HVAC-COMFORT-001', label: 'Unable to Reach Setpoint', description: 'Indoor temp stays away from setpoint during active cooling/heating.', requiredSensorRoles: [SensorRole.AMBIENT_TEMP], requiredIntegrations: ['Thermostat Setpoint / Mode'], needsBaseline: false, implemented: false, careplusEligible: false },
  { id: 'HVAC-COMFORT-002', label: 'Indoor Temperature Instability', description: 'Indoor temp variance higher than baseline.', requiredSensorRoles: [SensorRole.AMBIENT_TEMP], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },

  // ── Humidity ──
  { id: 'HVAC-HUMIDITY-001', label: 'High Indoor Humidity During Cooling', description: 'RH stays high during/after active cooling.', requiredSensorRoles: [SensorRole.INDOOR_HUMIDITY], requiredIntegrations: [], needsBaseline: false, implemented: false, careplusEligible: false },
  { id: 'HVAC-HUMIDITY-002', label: 'Cooling But Humidity Not Decreasing', description: 'Humidity response worse than baseline during a cooling cycle.', requiredSensorRoles: [SensorRole.INDOOR_HUMIDITY], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },

  // ── Combined ──
  { id: 'HVAC-COMBINED-001', label: 'Possible Cooling Performance Issue', description: 'Delta-T + runtime + comfort all abnormal together.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP, SensorRole.AMBIENT_TEMP], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-COMBINED-002', label: 'High-Confidence HVAC Issue', description: 'Multiple independent metrics + persistent trend.', requiredSensorRoles: [SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP, SensorRole.AMBIENT_TEMP, SensorRole.INDOOR_HUMIDITY], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, implemented: false, careplusEligible: false },
  { id: 'HVAC-COMBINED-003', label: 'Drainage Issue Pattern', description: 'Water events + repeated high humidity near equipment.', requiredSensorRoles: [SensorRole.DRAIN_WATER, SensorRole.INDOOR_HUMIDITY], requiredIntegrations: [], needsBaseline: true, implemented: false, careplusEligible: false },
];

export function evaluateRuleAvailability(taggedSensorRoles: Set<SensorRole>, hasBaseline: boolean) {
  return RULE_CATALOG.map((rule) => {
    const missingSensorRoles = rule.requiredSensorRoles.filter((r) => !taggedSensorRoles.has(r));
    const missingBaseline = rule.needsBaseline && !hasBaseline;
    const available = rule.implemented && missingSensorRoles.length === 0 && rule.requiredIntegrations.length === 0 && !missingBaseline;
    return { ...rule, available, missingSensorRoles, missingBaseline };
  });
}
