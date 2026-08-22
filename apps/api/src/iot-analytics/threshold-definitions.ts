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
];
