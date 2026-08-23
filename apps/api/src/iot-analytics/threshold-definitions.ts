// Catalog of every configurable analytics threshold — the admin-editable
// alternative to a hardcoded numeric literal inside a rule's evaluation
// logic. defaultValue seeds the platform-wide row the first time the app
// boots (ThresholdsService.onModuleInit); after that, the DB row is the
// live value and this array is only referenced for its bounds/labels.
//
// INDOOR_TEMP_LOW_F/HIGH_F have no prior "current value" to preserve —
// before this change, low/high indoor temperature was decided entirely by
// YoLink's own per-device alarm configuration (set in the YoLink app, not
// visible to or controlled by Attenteve). These defaults are new, chosen
// as reasonable starting points (pipe-freeze risk / dangerous heat) —
// adjust via the admin Analytics Thresholds page.
export interface ThresholdDefinition {
  key: string;
  label: string;
  description: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  // Rule ID(s) this threshold feeds — shown in the admin UI so it's clear
  // what changing a value actually affects.
  ruleIds: string[];
}

export const THRESHOLD_DEFINITIONS: ThresholdDefinition[] = [
  {
    key: 'INDOOR_TEMP_LOW_F', label: 'Indoor Temperature — Low',
    description: 'At or below this temperature, Attenteve fires a low-temperature finding (frozen-pipe risk). Computed by Attenteve directly from the sensor reading — no longer YoLink\'s own alarm.',
    unit: '°F', defaultValue: 41, min: 32, max: 65, ruleIds: ['INDOOR-TEMP-001'],
  },
  {
    key: 'INDOOR_TEMP_HIGH_F', label: 'Indoor Temperature — High',
    description: 'At or above this temperature, Attenteve fires a high-temperature finding (heat risk). Computed by Attenteve directly from the sensor reading — no longer YoLink\'s own alarm.',
    unit: '°F', defaultValue: 95, min: 75, max: 120, ruleIds: ['INDOOR-TEMP-001'],
  },
  {
    key: 'LOW_BATTERY_WATCH_PERCENT', label: 'Low Battery — Watch',
    description: 'At or below this battery percentage, a sensor gets a Watch-level low-battery finding.',
    unit: '%', defaultValue: 20, min: 5, max: 50, ruleIds: ['SENSOR-002'],
  },
  {
    key: 'LOW_BATTERY_ATTENTION_PERCENT', label: 'Low Battery — Attention',
    description: 'At or below this battery percentage, the low-battery finding escalates from Watch to Attention.',
    unit: '%', defaultValue: 10, min: 1, max: 30, ruleIds: ['SENSOR-002'],
  },
  {
    key: 'WATER_REPEATED_EVENT_COUNT', label: 'Repeated Water Events — Count',
    description: 'This many HVAC condensate water events within the window below triggers the "repeated events" escalation.',
    unit: 'events', defaultValue: 2, min: 2, max: 10, ruleIds: ['HVAC-WATER-003'],
  },
  {
    key: 'WATER_REPEATED_EVENT_WINDOW_DAYS', label: 'Repeated Water Events — Window',
    description: 'Rolling window, in days, used to count repeated HVAC condensate water events.',
    unit: 'days', defaultValue: 30, min: 1, max: 90, ruleIds: ['HVAC-WATER-003'],
  },

  // ── Cooling/heating performance — fixed reference bands. No prior value
  // existed anywhere in this codebase; defaults are HVAC-industry-standard
  // starting points (residential split-system cooling delta-T is typically
  // 16-22°F, gas-furnace heating rise 20-25°F) — adjust per real telemetry
  // once sensors are installed. ──
  {
    key: 'COOLING_DELTA_T_MIN_F', label: 'Cooling Delta-T — Minimum',
    description: 'Return-air minus supply-air temperature during active cooling, below which cooling performance is flagged as degraded.',
    unit: '°F', defaultValue: 14, min: 8, max: 25, ruleIds: ['HVAC-COOL-001'],
  },
  {
    key: 'HEATING_DELTA_T_MIN_F', label: 'Heating Delta-T — Minimum',
    description: 'Supply-air minus return-air temperature during active heating, below which heating performance is flagged as degraded.',
    unit: '°F', defaultValue: 20, min: 10, max: 40, ruleIds: ['HVAC-HEAT-001'],
  },
  {
    key: 'TELEMETRY_PAIRING_FRESHNESS_MINUTES', label: 'Return/Supply Pairing Freshness',
    description: 'A return-air and supply-air reading must arrive within this many minutes of each other to be paired into a single delta-T sample.',
    unit: 'min', defaultValue: 15, min: 5, max: 60, ruleIds: ['HVAC-COOL-001', 'HVAC-HEAT-001'],
  },

  // ── Baseline severity — shared across every needsBaseline:true rule.
  // Converts "how many standard deviations off this home's own baseline"
  // into a finding severity, so each individual baseline rule doesn't need
  // its own bespoke sensitivity knob. ──
  {
    key: 'BASELINE_WATCH_STDDEV', label: 'Baseline Deviation — Watch',
    description: 'A reading this many standard deviations from the home\'s own baseline is flagged Watch.',
    unit: 'σ', defaultValue: 1.5, min: 0.5, max: 3, ruleIds: ['HVAC-COOL-002', 'HVAC-COOL-003', 'HVAC-COOL-004', 'HVAC-RUNTIME-001', 'HVAC-RUNTIME-002', 'HVAC-COMFORT-002', 'HVAC-HUMIDITY-002', 'HVAC-AIRFLOW-001', 'HVAC-COMPRESSOR-001', 'HVAC-COMPRESSOR-002', 'HVAC-COMPRESSOR-004', 'HVAC-BLOWER-001', 'HVAC-BLOWER-002', 'HVAC-BLOWER-004', 'HVAC-ELECTRICAL-002', 'HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'BASELINE_ATTENTION_STDDEV', label: 'Baseline Deviation — Attention',
    description: 'A reading this many standard deviations from the home\'s own baseline escalates to Attention.',
    unit: 'σ', defaultValue: 2.5, min: 1, max: 4, ruleIds: ['HVAC-COOL-002', 'HVAC-COOL-003', 'HVAC-COOL-004', 'HVAC-RUNTIME-001', 'HVAC-RUNTIME-002', 'HVAC-COMFORT-002', 'HVAC-HUMIDITY-002', 'HVAC-AIRFLOW-001', 'HVAC-COMPRESSOR-001', 'HVAC-COMPRESSOR-002', 'HVAC-COMPRESSOR-004', 'HVAC-BLOWER-001', 'HVAC-BLOWER-002', 'HVAC-BLOWER-004', 'HVAC-ELECTRICAL-002', 'HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'BASELINE_CRITICAL_STDDEV', label: 'Baseline Deviation — Critical',
    description: 'A reading this many standard deviations from the home\'s own baseline escalates to Critical.',
    unit: 'σ', defaultValue: 3.5, min: 2, max: 6, ruleIds: ['HVAC-COOL-002', 'HVAC-COMPRESSOR-002', 'HVAC-BLOWER-002'],
  },

  // ── Runtime / cycling ──
  {
    key: 'RUNTIME_ON_WATTS_THRESHOLD', label: 'System Running — Power Threshold',
    description: 'Whole-unit power draw above this many watts counts as "the system is running," for daily runtime tracking.',
    unit: 'W', defaultValue: 300, min: 50, max: 2000, ruleIds: ['HVAC-RUNTIME-001', 'HVAC-RUNTIME-002', 'HVAC-RUNTIME-003'],
  },
  {
    key: 'SHORT_CYCLE_MAX_DURATION_MINUTES', label: 'Short Cycle — Max Duration',
    description: 'A run cycle shorter than this counts as a "short" cycle toward short-cycling detection.',
    unit: 'min', defaultValue: 5, min: 1, max: 15, ruleIds: ['HVAC-RUNTIME-003', 'HVAC-COMPRESSOR-003'],
  },
  {
    key: 'SHORT_CYCLE_COUNT', label: 'Short Cycling — Count',
    description: 'This many short cycles within the window below triggers a short-cycling finding.',
    unit: 'cycles', defaultValue: 3, min: 2, max: 10, ruleIds: ['HVAC-RUNTIME-003', 'HVAC-COMPRESSOR-003'],
  },
  {
    key: 'SHORT_CYCLE_WINDOW_MINUTES', label: 'Short Cycling — Window',
    description: 'Rolling window, in minutes, used to count short cycles.',
    unit: 'min', defaultValue: 60, min: 15, max: 180, ruleIds: ['HVAC-RUNTIME-003', 'HVAC-COMPRESSOR-003'],
  },
  {
    key: 'COMPRESSOR_ON_WATTS_THRESHOLD', label: 'Compressor Running — Power Threshold',
    description: 'Compressor power draw above this many watts counts as "the compressor is running."',
    unit: 'W', defaultValue: 400, min: 100, max: 1500, ruleIds: ['HVAC-COMPRESSOR-001', 'HVAC-COMPRESSOR-002', 'HVAC-COMPRESSOR-003'],
  },
  {
    key: 'BLOWER_ON_WATTS_THRESHOLD', label: 'Blower Running — Power Threshold',
    description: 'Blower power draw above this many watts counts as "the blower is running."',
    unit: 'W', defaultValue: 50, min: 10, max: 200, ruleIds: ['HVAC-BLOWER-001', 'HVAC-BLOWER-002', 'HVAC-BLOWER-003'],
  },

  // ── Comfort / humidity ──
  {
    key: 'COMFORT_SETPOINT_DEVIATION_F', label: 'Setpoint Deviation',
    description: 'Indoor temperature this far from the thermostat setpoint, sustained, is flagged as "unable to reach setpoint."',
    unit: '°F', defaultValue: 3, min: 1, max: 10, ruleIds: ['HVAC-COMFORT-001'],
  },
  {
    key: 'COMFORT_SETPOINT_SUSTAINED_MINUTES', label: 'Setpoint Deviation — Sustained Duration',
    description: 'The setpoint deviation above must persist for at least this long before it\'s flagged (avoids alerting on a normal brief overshoot).',
    unit: 'min', defaultValue: 45, min: 10, max: 180, ruleIds: ['HVAC-COMFORT-001'],
  },
  {
    key: 'HUMIDITY_HIGH_DURING_COOLING_PERCENT', label: 'High Humidity During Cooling',
    description: 'Indoor relative humidity above this percentage while the system is actively cooling is flagged.',
    unit: '% RH', defaultValue: 60, min: 40, max: 80, ruleIds: ['HVAC-HUMIDITY-001'],
  },

  // ── Electrical ──
  {
    key: 'ELECTRICAL_VOLTAGE_MIN', label: 'Electrical Voltage — Minimum',
    description: 'HVAC circuit voltage below this is flagged as a brownout/undervoltage condition.',
    unit: 'V', defaultValue: 200, min: 150, max: 220, ruleIds: ['HVAC-ELECTRICAL-001'],
  },
  {
    key: 'ELECTRICAL_VOLTAGE_MAX', label: 'Electrical Voltage — Maximum',
    description: 'HVAC circuit voltage above this is flagged as an overvoltage condition.',
    unit: 'V', defaultValue: 260, min: 240, max: 280, ruleIds: ['HVAC-ELECTRICAL-001'],
  },
  {
    key: 'POWER_LOSS_MIN_PRIOR_WATTS', label: 'Unexpected Power Loss — Prior Draw',
    description: 'Power must have been drawing at least this many watts immediately before dropping near zero to count as an unexpected loss (vs. a normal idle state).',
    unit: 'W', defaultValue: 200, min: 50, max: 1000, ruleIds: ['HVAC-ELECTRICAL-004'],
  },

  // ── Sensor plausibility / configuration checks ──
  {
    key: 'PLAUSIBLE_TEMP_MIN_F', label: 'Plausible Temperature — Minimum',
    description: 'A temperature reading below this is treated as an implausible/faulty sensor reading rather than a real condition.',
    unit: '°F', defaultValue: -20, min: -40, max: 0, ruleIds: ['SENSOR-003'],
  },
  {
    key: 'PLAUSIBLE_TEMP_MAX_F', label: 'Plausible Temperature — Maximum',
    description: 'A temperature reading above this is treated as an implausible/faulty sensor reading rather than a real condition.',
    unit: '°F', defaultValue: 140, min: 100, max: 200, ruleIds: ['SENSOR-003'],
  },
  {
    key: 'PLAUSIBLE_POWER_MAX_WATTS', label: 'Plausible Power — Maximum',
    description: 'A power reading above this is treated as an implausible/faulty sensor reading rather than a real condition (residential HVAC components don\'t draw this much).',
    unit: 'W', defaultValue: 5000, min: 1000, max: 10000, ruleIds: ['SENSOR-003'],
  },
  {
    key: 'SENSOR_REVERSAL_CONFIRMATION_COUNT', label: 'Sensor Reversal — Confirmation Count',
    description: 'This many consecutive paired readings showing supply air warmer than return air (backwards for cooling) confirms a likely Return/Supply sensor swap.',
    unit: 'readings', defaultValue: 5, min: 3, max: 15, ruleIds: ['SENSOR-004'],
  },
];
