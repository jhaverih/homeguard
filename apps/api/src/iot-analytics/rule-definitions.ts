import { SensorRole, MeasurementType } from '../common/enums/sensor-role.enum';
import { FindingSeverity, FindingConfidence } from './entities/analytics-finding.entity';

// Data-driven rule catalog — every rule's METADATA (applicability, severity,
// confidence, reason code, recommended actions, notification policy) lives
// here as a typed config array per spec section 12/31, not hardcoded per
// rule inside a service method. This also drives the admin page's "rules
// not available for this customer" section (evaluateRuleAvailability below)
// and which findings a CarePlus vs. Proactive+ customer can see.
//
// What this deliberately is NOT: a parsed string-expression interpreter for
// the spec's `"condition": "water_detected == true"` syntax. For the ~6
// conditions this MVP actually evaluates, a hand-rolled DSL/interpreter is
// disproportionate effort versus a small typed predicate map keyed by the
// same reasonCode (see CONDITION_PREDICATES in analytics-engine.service.ts)
// — every rule's applicability/severity/actions stays genuinely data-driven
// and centrally reviewable; only the boolean condition itself is a typed
// function reference instead of a parsed string.
export interface RuleDefinition {
  ruleId: string;
  ruleGroup: string;
  label: string;
  description: string;
  applicableSensorRoles: SensorRole[];
  requiredMeasurements: MeasurementType[];
  requiredIntegrations: string[];
  needsBaseline: boolean;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  reasonCode: string;
  recommendedActions: string[];
  notificationPolicy: 'IMMEDIATE' | 'DASHBOARD_ONLY';
  implemented: boolean;
  // Which tier unlocks this rule's findings — CarePlus only gets the two
  // synthetic tier-scoped rules below; everything else is Proactive+.
  careplusEligible: boolean;
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  // ── Synthetic tier-scoped rule (CarePlus's own allowance: low/high indoor
  // temperature) ──
  {
    ruleId: 'INDOOR-TEMP-001', ruleGroup: 'INDOOR_CLIMATE', label: 'Low / High Indoor Temperature',
    description: 'Indoor temperature outside a safe/comfortable range.',
    applicableSensorRoles: [SensorRole.INDOOR_AMBIENT_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE],
    requiredIntegrations: [], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.HIGH,
    reasonCode: 'INDOOR_TEMP_OUT_OF_RANGE', recommendedActions: [], notificationPolicy: 'IMMEDIATE',
    implemented: true, careplusEligible: true,
  },

  // ── Sensor health (SENSOR-*) — per-device, applies to any assigned role ──
  {
    ruleId: 'SENSOR-001', ruleGroup: 'SENSOR_HEALTH', label: 'Sensor Offline', description: 'A required sensor has not reported in too long.',
    applicableSensorRoles: [], requiredMeasurements: [], requiredIntegrations: [], needsBaseline: false,
    severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH, reasonCode: 'SENSOR_OFFLINE',
    recommendedActions: ['CHECK_SENSOR_CONNECTIVITY'], notificationPolicy: 'DASHBOARD_ONLY', implemented: true, careplusEligible: true,
  },
  {
    ruleId: 'SENSOR-002', ruleGroup: 'SENSOR_HEALTH', label: 'Low Battery', description: 'Sensor battery is low.',
    applicableSensorRoles: [], requiredMeasurements: [MeasurementType.BATTERY], requiredIntegrations: [], needsBaseline: false,
    severity: FindingSeverity.WATCH, confidence: FindingConfidence.HIGH, reasonCode: 'LOW_BATTERY',
    recommendedActions: ['REPLACE_BATTERY'], notificationPolicy: 'DASHBOARD_ONLY', implemented: true, careplusEligible: true,
  },
  {
    ruleId: 'SENSOR-003', ruleGroup: 'SENSOR_HEALTH', label: 'Implausible Reading', description: 'Reading outside plausible range or an unconfirmed sudden jump.',
    applicableSensorRoles: [], requiredMeasurements: [], requiredIntegrations: [], needsBaseline: false,
    severity: FindingSeverity.WATCH, confidence: FindingConfidence.LOW, reasonCode: 'IMPLAUSIBLE_READING',
    recommendedActions: ['CHECK_SENSOR_CONNECTIVITY'], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false,
  },
  {
    ruleId: 'SENSOR-004', ruleGroup: 'SENSOR_HEALTH', label: 'Supply/Return Sensors Reversed', description: 'Possible sensor configuration error.',
    applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE],
    requiredIntegrations: [], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM,
    reasonCode: 'SENSORS_REVERSED', recommendedActions: ['GET_ATTENTEVE_HELP'], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false,
  },

  // ── HVAC condensate / water (highest priority per spec) ──
  {
    ruleId: 'HVAC-WATER-001', ruleGroup: 'HVAC_WATER', label: 'Water Detected', description: 'Water detected in the HVAC condensate drain pan.',
    applicableSensorRoles: [SensorRole.HVAC_DRAIN_WATER], requiredMeasurements: [MeasurementType.WATER], requiredIntegrations: [],
    needsBaseline: false, severity: FindingSeverity.CRITICAL, confidence: FindingConfidence.VERY_HIGH, reasonCode: 'HVAC_WATER_DETECTED',
    recommendedActions: ['CHECK_HVAC', 'I_FIXED_IT', 'GET_ATTENTEVE_HELP'], notificationPolicy: 'IMMEDIATE', implemented: true, careplusEligible: true,
  },
  {
    ruleId: 'HVAC-WATER-002', ruleGroup: 'HVAC_WATER', label: 'Persistent Water', description: 'Water remains detected — escalating urgency.',
    applicableSensorRoles: [SensorRole.HVAC_DRAIN_WATER], requiredMeasurements: [MeasurementType.WATER], requiredIntegrations: [],
    needsBaseline: false, severity: FindingSeverity.CRITICAL, confidence: FindingConfidence.VERY_HIGH, reasonCode: 'HVAC_WATER_PERSISTENT',
    recommendedActions: ['CHECK_HVAC', 'GET_ATTENTEVE_HELP'], notificationPolicy: 'IMMEDIATE', implemented: true, careplusEligible: true,
  },
  {
    ruleId: 'HVAC-WATER-003', ruleGroup: 'HVAC_WATER', label: 'Repeated Water Events', description: '2+ water events within 30 days.',
    applicableSensorRoles: [SensorRole.HVAC_DRAIN_WATER], requiredMeasurements: [MeasurementType.WATER], requiredIntegrations: [],
    needsBaseline: false, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH, reasonCode: 'HVAC_WATER_REPEATED',
    recommendedActions: ['SCHEDULE_HVAC_INSPECTION'], notificationPolicy: 'DASHBOARD_ONLY', implemented: true, careplusEligible: true,
  },

  // ── Washer condensate / water — first-class rule group, its own
  // equipment (WASHER-01), never mislabeled as an HVAC finding. ──
  {
    ruleId: 'WASHER-WATER-001', ruleGroup: 'WASHER_WATER', label: 'Washer Leak Detected', description: 'Water has been detected near your washer drain pan.',
    applicableSensorRoles: [SensorRole.WASHER_DRAIN_WATER], requiredMeasurements: [MeasurementType.WATER], requiredIntegrations: [],
    needsBaseline: false, severity: FindingSeverity.CRITICAL, confidence: FindingConfidence.VERY_HIGH, reasonCode: 'WASHER_LEAK_DETECTED',
    // Per spec: the system only knows water was detected — do not
    // auto-diagnose hose failure, drain failure, or appliance failure.
    recommendedActions: ['CHECK_WASHER', 'CHECK_WATER_CONNECTIONS', 'STOP_WATER_SOURCE_IF_SAFE', 'GET_HELP'],
    notificationPolicy: 'IMMEDIATE', implemented: true, careplusEligible: true,
  },

  // ── Cooling / heating performance ──
  { ruleId: 'HVAC-COOL-001', ruleGroup: 'HVAC_PERFORMANCE', label: 'Low Cooling Differential', description: 'Cooling delta-T below broad reference range / baseline.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'LOW_COOLING_DELTA_T', recommendedActions: ['GET_ATTENTEVE_HELP'], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COOL-002', ruleGroup: 'HVAC_PERFORMANCE', label: 'Severe Cooling Degradation', description: 'Cooling delta-T severely below baseline.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.HIGH, confidence: FindingConfidence.HIGH, reasonCode: 'SEVERE_COOLING_DEGRADATION', recommendedActions: ['SCHEDULE_CONTRACTOR_VISIT'], notificationPolicy: 'IMMEDIATE', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COOL-003', ruleGroup: 'HVAC_PERFORMANCE', label: 'Supply Temperature Not Responding', description: 'Supply temp drop smaller than historical baseline.', applicableSensorRoles: [SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.MEDIUM, reasonCode: 'SUPPLY_TEMP_NOT_RESPONDING', recommendedActions: ['GET_ATTENTEVE_HELP'], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COOL-004', ruleGroup: 'HVAC_PERFORMANCE', label: 'Cooling Deterioration Trend', description: '30-day rolling delta-T decline vs. prior period.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'COOLING_DETERIORATION_TREND', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-HEAT-001', ruleGroup: 'HVAC_PERFORMANCE', label: 'Heating Differential', description: 'Heating delta-T below broad reference range / baseline.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'LOW_HEATING_DELTA_T', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },

  // ── Runtime ──
  { ruleId: 'HVAC-RUNTIME-001', ruleGroup: 'HVAC_RUNTIME', label: 'Excessive Runtime', description: 'Daily runtime above baseline for comparable weather.', applicableSensorRoles: [SensorRole.HVAC_POWER, SensorRole.HVAC_STATE], requiredMeasurements: [MeasurementType.POWER], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'EXCESSIVE_RUNTIME', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-RUNTIME-002', ruleGroup: 'HVAC_RUNTIME', label: 'Long Continuous Cycle', description: 'Single cycle runs far longer than baseline.', applicableSensorRoles: [SensorRole.HVAC_POWER, SensorRole.HVAC_STATE], requiredMeasurements: [MeasurementType.POWER], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.MEDIUM, reasonCode: 'LONG_CONTINUOUS_CYCLE', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-RUNTIME-003', ruleGroup: 'HVAC_RUNTIME', label: 'Short Cycling', description: '3+ short ON/OFF cycles within 60 minutes.', applicableSensorRoles: [SensorRole.HVAC_POWER, SensorRole.HVAC_STATE], requiredMeasurements: [MeasurementType.POWER], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: false, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH, reasonCode: 'SHORT_CYCLING', recommendedActions: ['GET_ATTENTEVE_HELP'], notificationPolicy: 'IMMEDIATE', implemented: false, careplusEligible: false },

  // ── Comfort ──
  { ruleId: 'HVAC-COMFORT-001', ruleGroup: 'HVAC_COMFORT', label: 'Unable to Reach Setpoint', description: 'Indoor temp stays away from setpoint during active cooling/heating.', applicableSensorRoles: [SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.HVAC_THERMOSTAT_SETPOINT], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: ['Thermostat Setpoint / Mode'], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'UNABLE_TO_REACH_SETPOINT', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COMFORT-002', ruleGroup: 'HVAC_COMFORT', label: 'Indoor Temperature Instability', description: 'Indoor temp variance higher than baseline.', applicableSensorRoles: [SensorRole.INDOOR_AMBIENT_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.WATCH, confidence: FindingConfidence.LOW, reasonCode: 'INDOOR_TEMP_INSTABILITY', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },

  // ── Humidity ──
  { ruleId: 'HVAC-HUMIDITY-001', ruleGroup: 'HVAC_HUMIDITY', label: 'High Indoor Humidity During Cooling', description: 'RH stays high during/after active cooling.', applicableSensorRoles: [SensorRole.INDOOR_AMBIENT_HUMIDITY], requiredMeasurements: [MeasurementType.HUMIDITY], requiredIntegrations: [], needsBaseline: false, severity: FindingSeverity.WATCH, confidence: FindingConfidence.MEDIUM, reasonCode: 'HIGH_HUMIDITY_DURING_COOLING', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-HUMIDITY-002', ruleGroup: 'HVAC_HUMIDITY', label: 'Cooling But Humidity Not Decreasing', description: 'Humidity response worse than baseline during a cooling cycle.', applicableSensorRoles: [SensorRole.INDOOR_AMBIENT_HUMIDITY], requiredMeasurements: [MeasurementType.HUMIDITY], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.MEDIUM, reasonCode: 'HUMIDITY_NOT_RESPONDING', recommendedActions: [], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },

  // ── Combined / multi-signal ──
  { ruleId: 'HVAC-COMBINED-001', ruleGroup: 'HVAC_COMBINED', label: 'Possible Cooling Performance Issue', description: 'Delta-T + runtime + comfort all abnormal together.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.INDOOR_AMBIENT_TEMP], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH, reasonCode: 'POSSIBLE_COOLING_ISSUE', recommendedActions: ['GET_ATTENTEVE_HELP'], notificationPolicy: 'IMMEDIATE', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COMBINED-002', ruleGroup: 'HVAC_COMBINED', label: 'High-Confidence HVAC Issue', description: 'Multiple independent metrics + persistent trend.', applicableSensorRoles: [SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.INDOOR_AMBIENT_HUMIDITY], requiredMeasurements: [MeasurementType.TEMPERATURE], requiredIntegrations: ['HVAC / Blower Power'], needsBaseline: true, severity: FindingSeverity.HIGH, confidence: FindingConfidence.VERY_HIGH, reasonCode: 'HIGH_CONFIDENCE_HVAC_ISSUE', recommendedActions: ['SCHEDULE_CONTRACTOR_VISIT'], notificationPolicy: 'IMMEDIATE', implemented: false, careplusEligible: false },
  { ruleId: 'HVAC-COMBINED-003', ruleGroup: 'HVAC_COMBINED', label: 'Drainage Issue Pattern', description: 'Water events + repeated high humidity near equipment.', applicableSensorRoles: [SensorRole.HVAC_DRAIN_WATER, SensorRole.INDOOR_AMBIENT_HUMIDITY], requiredMeasurements: [MeasurementType.WATER], requiredIntegrations: [], needsBaseline: true, severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH, reasonCode: 'DRAINAGE_ISSUE_PATTERN', recommendedActions: ['SCHEDULE_HVAC_INSPECTION'], notificationPolicy: 'DASHBOARD_ONLY', implemented: false, careplusEligible: false },
];

export function evaluateRuleAvailability(taggedSensorRoles: Set<SensorRole>, hasBaseline: boolean) {
  return RULE_DEFINITIONS.map((rule) => {
    const missingSensorRoles = rule.applicableSensorRoles.filter((r) => !taggedSensorRoles.has(r));
    const missingBaseline = rule.needsBaseline && !hasBaseline;
    const available = rule.implemented && missingSensorRoles.length === 0 && rule.requiredIntegrations.length === 0 && !missingBaseline;
    return {
      id: rule.ruleId, label: rule.label, description: rule.description,
      requiredSensorRoles: rule.applicableSensorRoles, requiredIntegrations: rule.requiredIntegrations,
      needsBaseline: rule.needsBaseline, implemented: rule.implemented, careplusEligible: rule.careplusEligible,
      available, missingSensorRoles, missingBaseline,
    };
  });
}
