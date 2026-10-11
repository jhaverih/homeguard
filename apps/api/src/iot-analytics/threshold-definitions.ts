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

  // ── Thermostat-driven cooling analytics (no supply/return air required) ──
  // Initial screening settings from the Attenteve HVAC analytics spec — not
  // universal equipment specifications; tune per home as history accrues.
  {
    key: 'COOLING_PERF_MIN_ACTIVE_MINUTES', label: 'Cooling Performance — Minimum Active Cooling',
    description: 'Cooling must have been continuously active (since the last setpoint change) at least this long before slow progress toward setpoint is flagged.',
    unit: 'minutes', defaultValue: 60, min: 30, max: 180, ruleIds: ['HVAC-COMFORT-001'],
  },
  {
    key: 'COOLING_PERF_ERROR_F', label: 'Cooling Performance — Temperature Above Setpoint',
    description: 'Indoor temperature must stay more than this many °F above the cooling setpoint for the whole minimum-active period.',
    unit: '°F', defaultValue: 3, min: 1, max: 10, ruleIds: ['HVAC-COMFORT-001'],
  },
  {
    key: 'COOLING_PERF_MIN_PROGRESS_F', label: 'Cooling Performance — Expected Progress',
    description: 'If the indoor temperature has dropped by at least this much over the minimum-active period, cooling counts as making progress and is not flagged.',
    unit: '°F', defaultValue: 1, min: 0.5, max: 5, ruleIds: ['HVAC-COMFORT-001'],
  },
  {
    key: 'PROGRESS_CHECK_MINUTES', label: 'Setpoint Progress — Check After',
    description: 'How long into a continuous cooling call to check whether the indoor temperature has started moving toward the setpoint.',
    unit: 'minutes', defaultValue: 30, min: 15, max: 120, ruleIds: ['HVAC-COMFORT-003'],
  },
  {
    key: 'PROGRESS_MIN_INITIAL_ERROR_F', label: 'Setpoint Progress — Minimum Starting Gap',
    description: 'The progress check only applies when the indoor temperature started at least this many °F above the cooling setpoint (smaller gaps are within measurement resolution).',
    unit: '°F', defaultValue: 2, min: 1, max: 10, ruleIds: ['HVAC-COMFORT-003'],
  },
  {
    key: 'PROGRESS_MIN_DECREASE_F', label: 'Setpoint Progress — Minimum Decrease',
    description: 'The indoor temperature gap to setpoint must have shrunk by at least this much by the check time, or a warning is raised.',
    unit: '°F', defaultValue: 0.5, min: 0.2, max: 3, ruleIds: ['HVAC-COMFORT-003'],
  },
  {
    key: 'RUNTIME_EXCESS_PERCENT', label: 'Cooling Cycle Runtime — Excess Over Baseline',
    description: 'A cooling cycle counts as extended when it runs at least this much longer than the home\'s typical cycle under comparable outdoor conditions.',
    unit: '%', defaultValue: 30, min: 10, max: 200, ruleIds: ['HVAC-RUNTIME-001'],
  },
  {
    key: 'RUNTIME_MIN_COMPARABLE_CYCLES', label: 'Cooling Cycle Runtime — Consecutive Extended Cycles',
    description: 'This many consecutive comparable cooling cycles must all be extended before the runtime finding is raised.',
    unit: 'cycles', defaultValue: 3, min: 2, max: 10, ruleIds: ['HVAC-RUNTIME-001'],
  },
  {
    key: 'RUNTIME_BASELINE_MIN_CYCLES', label: 'Cooling Cycle Runtime — Baseline Size',
    description: 'Completed comparable cooling cycles needed before a runtime baseline is used (until then: "Baseline collecting").',
    unit: 'cycles', defaultValue: 10, min: 5, max: 100, ruleIds: ['HVAC-RUNTIME-001'],
  },
  {
    key: 'COOLING_STARTS_MAX', label: 'Frequent Cycling — Maximum Starts',
    description: 'More than this many cooling starts within the window is flagged for investigation (not a confirmed compressor fault).',
    unit: 'starts', defaultValue: 3, min: 2, max: 12, ruleIds: ['HVAC-RUNTIME-003'],
  },
  {
    key: 'COOLING_STARTS_WINDOW_MINUTES', label: 'Frequent Cycling — Window',
    description: 'Rolling window over which cooling starts are counted.',
    unit: 'minutes', defaultValue: 60, min: 30, max: 240, ruleIds: ['HVAC-RUNTIME-003'],
  },
  {
    key: 'SETPOINT_CHANGE_EXCLUSION_MINUTES', label: 'Setpoint/Mode Change — Exclusion Period',
    description: 'Cooling starts, cycles and expected-state checks within this many minutes after a setpoint or mode change are excluded — a change legitimately starts or stops cooling.',
    unit: 'minutes', defaultValue: 10, min: 0, max: 60, ruleIds: ['HVAC-RUNTIME-001', 'HVAC-RUNTIME-003', 'HVAC-STATE-001'],
  },
  {
    key: 'LINE_TEMP_STABILIZATION_MINUTES', label: 'Refrigerant Line — Stabilization Period',
    description: 'Line-temperature readings from the first this-many minutes of a cooling run are startup transients and are ignored.',
    unit: 'minutes', defaultValue: 10, min: 0, max: 30, ruleIds: ['HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'LINE_TEMP_DEVIATION_F', label: 'Refrigerant Line — Deviation From Baseline',
    description: 'A suction- or liquid-line temperature this many °F away from the home\'s learned stable-cooling baseline is abnormal. Not a universal refrigerant operating limit.',
    unit: '°F', defaultValue: 10, min: 3, max: 30, ruleIds: ['HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'LINE_TEMP_SUSTAINED_MINUTES', label: 'Refrigerant Line — Sustained Duration',
    description: 'The deviation must persist continuously for this long during stable cooling.',
    unit: 'minutes', defaultValue: 10, min: 5, max: 60, ruleIds: ['HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'LINE_TEMP_MAX_HOLD_MINUTES', label: 'Refrigerant Line — Report Hold Time',
    description: 'Line probes report when their temperature changes; a reading is treated as still current for up to this long. Longer gaps leave the window unassessed.',
    unit: 'minutes', defaultValue: 30, min: 5, max: 120, ruleIds: ['HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'LINE_TEMP_BASELINE_MIN_SAMPLES', label: 'Refrigerant Line — Baseline Size',
    description: 'Stable-cooling readings (from at least 3 separate cooling runs) needed before a line-temperature baseline is used.',
    unit: 'readings', defaultValue: 20, min: 5, max: 500, ruleIds: ['HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002'],
  },
  {
    key: 'HUMIDITY_SUSTAINED_PERCENT', label: 'Sustained Humidity — Level',
    description: 'Indoor relative humidity above this level, sustained during cooling, is flagged.',
    unit: '%', defaultValue: 60, min: 45, max: 80, ruleIds: ['HVAC-HUMIDITY-001'],
  },
  {
    key: 'HUMIDITY_SUSTAINED_MINUTES', label: 'Sustained Humidity — Duration',
    description: 'Humidity must stay above the level for this long.',
    unit: 'minutes', defaultValue: 60, min: 15, max: 480, ruleIds: ['HVAC-HUMIDITY-001'],
  },
  {
    key: 'HUMIDITY_MIN_COOLING_FRACTION_PERCENT', label: 'Sustained Humidity — Cooling Share',
    description: 'The system must have been cooling for at least this share of the duration for the humidity to count as "during cooling".',
    unit: '%', defaultValue: 50, min: 10, max: 100, ruleIds: ['HVAC-HUMIDITY-001'],
  },
  {
    key: 'EXPECTED_STATE_ERROR_F', label: 'Expected Operating State — Temperature Above Setpoint',
    description: 'In Cool mode, a zone this many °F above its cooling setpoint is expected to be calling for cooling.',
    unit: '°F', defaultValue: 2, min: 1, max: 10, ruleIds: ['HVAC-STATE-001'],
  },
  {
    key: 'EXPECTED_STATE_GRACE_MINUTES', label: 'Expected Operating State — Grace Period',
    description: 'How long the zone may stay above setpoint without any observed cooling call before "Expected operating state not observed" is raised (allows for thermostat and equipment protection delays).',
    unit: 'minutes', defaultValue: 20, min: 5, max: 120, ruleIds: ['HVAC-STATE-001'],
  },
  {
    key: 'COMBINED_ALIGNMENT_HOURS', label: 'Combined Performance — Alignment Window',
    description: 'Symptoms count as corroborating each other only if each was observed within this many hours.',
    unit: 'hours', defaultValue: 24, min: 1, max: 168, ruleIds: ['HVAC-COMBINED-004'],
  },
  {
    key: 'NEST_STALE_MINUTES', label: 'Nest Telemetry — Stale After',
    description: 'A Nest thermostat with no successful update (event or 5-minute poll) for this long is treated as unavailable.',
    unit: 'minutes', defaultValue: 15, min: 10, max: 120, ruleIds: ['SENSOR-001'],
  },
  {
    key: 'YOLINK_TEMP_STALE_MINUTES', label: 'YoLink Indoor Temperature — Stale After',
    description: 'YoLink temperature sensors report about hourly; no valid reading for this long is treated as stale.',
    unit: 'minutes', defaultValue: 90, min: 60, max: 360, ruleIds: ['SENSOR-001'],
  },
  {
    key: 'HEALTH_EVIDENCE_MAX_AGE_HOURS', label: 'Health — Evidence Freshness',
    description: 'A component is only shown Healthy if its rules were successfully evaluated within this many hours; otherwise it shows Insufficient data.',
    unit: 'hours', defaultValue: 48, min: 6, max: 336, ruleIds: [],
  },

  // ── Statistical anomaly detection (shadow evidence; never alerts or sets
  // health). Defaults sized for the pilot cadences: line probes report every
  // ~2–3 min, Nest every 5 min, YoLink indoor every 60 min. ──
  {
    key: 'ANOMALY_WINDOW_DAYS', label: 'Anomaly Baseline — Window',
    description: 'How many days of same-context history form a sensor\'s rolling median/MAD baseline.',
    unit: 'days', defaultValue: 7, min: 2, max: 60, ruleIds: [],
  },
  {
    key: 'ANOMALY_MIN_SAMPLES', label: 'Anomaly Baseline — Minimum Readings',
    description: 'Readings a baseline needs before any reading is scored against it (otherwise nothing is scored — never a guessed baseline).',
    unit: 'readings', defaultValue: 30, min: 10, max: 2000, ruleIds: [],
  },
  {
    key: 'ANOMALY_Z_THRESHOLD', label: 'Anomaly — Robust Z Threshold',
    description: 'A reading whose robust z-score (0.6745 × deviation ÷ MAD) exceeds this is unusual. 3.5 is the Iglewicz–Hoaglin recommendation.',
    unit: 'z', defaultValue: 3.5, min: 2, max: 10, ruleIds: [],
  },
  {
    key: 'ANOMALY_RATE_Z_THRESHOLD', label: 'Anomaly — Rate-of-Change Threshold',
    description: 'A change per minute whose robust z-score against the sensor\'s usual rates exceeds this is a rapid change.',
    unit: 'z', defaultValue: 4, min: 2, max: 15, ruleIds: [],
  },
  {
    key: 'ANOMALY_MIN_CONSECUTIVE', label: 'Anomaly — Persistence Readings',
    description: 'Consecutive unusual readings required (together with the persistence duration) before a deviation counts as persistent.',
    unit: 'readings', defaultValue: 3, min: 2, max: 30, ruleIds: [],
  },
  {
    key: 'ANOMALY_PERSISTENCE_MINUTES', label: 'Anomaly — Persistence Duration',
    description: 'How long the unusual readings must last before a deviation counts as persistent.',
    unit: 'minutes', defaultValue: 15, min: 5, max: 240, ruleIds: [],
  },
  {
    key: 'DRIFT_RECENT_DAYS', label: 'Baseline Drift — Recent Period',
    description: 'Recent period compared against the prior period when checking for gradual drift.',
    unit: 'days', defaultValue: 7, min: 2, max: 30, ruleIds: [],
  },
  {
    key: 'DRIFT_PRIOR_DAYS', label: 'Baseline Drift — Prior Period',
    description: 'Prior period the recent period is compared against.',
    unit: 'days', defaultValue: 21, min: 7, max: 120, ruleIds: [],
  },
  {
    key: 'DRIFT_MIN_SHIFT_MAD', label: 'Baseline Drift — Minimum Shift',
    description: 'The recent median must move at least this many MADs away from the prior median to count as drift.',
    unit: 'MAD', defaultValue: 2, min: 1, max: 10, ruleIds: [],
  },
  {
    key: 'CORRELATION_WINDOW_MINUTES', label: 'Event Correlation — Window',
    description: 'Related findings and anomalies within this many minutes of each other are grouped into one event.',
    unit: 'minutes', defaultValue: 60, min: 10, max: 1440, ruleIds: [],
  },
  {
    key: 'ENERGY_SETPOINT_CHANGES_PER_DAY', label: 'Energy Advisory — Setpoint Changes',
    description: 'More setpoint changes than this in 24 hours is noted as an advisory (no savings are estimated).',
    unit: 'changes', defaultValue: 8, min: 2, max: 50, ruleIds: [],
  },
  {
    key: 'ENERGY_MODE_FLIPS_PER_DAY', label: 'Energy Advisory — Heat/Cool Flips',
    description: 'More heating↔cooling mode switches than this in 24 hours is noted as an advisory.',
    unit: 'switches', defaultValue: 2, min: 1, max: 20, ruleIds: [],
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
  // Referenced by PerformanceEngineService.handleHumidityReading since it was
  // written, but never defined — it only surfaced (as "Unknown analytics
  // threshold key") once the first humidity sensor, a Nest thermostat, went live.
  {
    key: 'PLAUSIBLE_HUMIDITY_MIN_PERCENT', label: 'Plausible Humidity — Minimum',
    description: 'A relative-humidity reading below this is treated as an implausible/faulty sensor reading rather than a real condition.',
    unit: '%', defaultValue: 0, min: 0, max: 10, ruleIds: ['SENSOR-003'],
  },
  {
    key: 'PLAUSIBLE_HUMIDITY_MAX_PERCENT', label: 'Plausible Humidity — Maximum',
    description: 'A relative-humidity reading above this is treated as an implausible/faulty sensor reading rather than a real condition.',
    unit: '%', defaultValue: 100, min: 90, max: 100, ruleIds: ['SENSOR-003'],
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
