import { RULE_DEFINITIONS, evaluateRuleAvailability } from './rule-definitions';
import { SensorRole } from '../common/enums/sensor-role.enum';

describe('RULE_DEFINITIONS catalog integrity', () => {
  it('has no duplicate rule IDs', () => {
    // A copy-paste duplicate here would silently make one rule's finding
    // pick up the wrong severity/actions/reasonCode from another rule with
    // the same ruleId — this catalog is hand-edited and has grown to ~35
    // entries, so this is a real, cheap regression guard.
    const ids = RULE_DEFINITIONS.map((r) => r.ruleId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has no duplicate reason codes among rules that share a sensor role (would make CONDITION_PREDICATES ambiguous)', () => {
    // analytics-engine.service.ts looks up a rule by "applies to this sensor
    // role AND has a registered condition predicate" — two rules sharing
    // both a sensor role and a reasonCode would make that lookup pick
    // whichever comes first in the array, silently.
    const seen = new Map<string, Set<string>>();
    for (const rule of RULE_DEFINITIONS) {
      for (const role of rule.applicableSensorRoles) {
        const codes = seen.get(role) ?? new Set<string>();
        expect(codes.has(rule.reasonCode)).toBe(false);
        codes.add(rule.reasonCode);
        seen.set(role, codes);
      }
    }
  });
});

describe('evaluateRuleAvailability', () => {
  it('returns the exact shape the admin/mobile pages read (id/label/available/missingSensorRoles/missingBaseline)', () => {
    const results = evaluateRuleAvailability(new Set(), false);
    expect(results.length).toBe(RULE_DEFINITIONS.length);
    for (const r of results) {
      expect(r).toEqual(expect.objectContaining({
        id: expect.any(String), label: expect.any(String), description: expect.any(String),
        requiredSensorRoles: expect.any(Array), requiredIntegrations: expect.any(Array),
        needsBaseline: expect.any(Boolean), implemented: expect.any(Boolean), careplusEligible: expect.any(Boolean),
        available: expect.any(Boolean), missingSensorRoles: expect.any(Array), missingBaseline: expect.any(Boolean),
      }));
    }
  });

  it('marks a single-sensor rule available once its sensor is tagged, unavailable with the right reason otherwise', () => {
    const indoorTemp = evaluateRuleAvailability(new Set(), false).find((r) => r.id === 'INDOOR-TEMP-001')!;
    expect(indoorTemp.available).toBe(false);
    expect(indoorTemp.missingSensorRoles).toEqual([SensorRole.INDOOR_AMBIENT_TEMP]);

    const withSensor = evaluateRuleAvailability(new Set([SensorRole.INDOOR_AMBIENT_TEMP]), false).find((r) => r.id === 'INDOOR-TEMP-001')!;
    expect(withSensor.available).toBe(true);
    expect(withSensor.missingSensorRoles).toEqual([]);
  });

  it('lists only the specific missing sensor when a multi-sensor rule is partially tagged', () => {
    const partial = evaluateRuleAvailability(new Set([SensorRole.HVAC_RETURN_TEMP]), false).find((r) => r.id === 'HVAC-COOL-001')!;
    expect(partial.available).toBe(false);
    expect(partial.missingSensorRoles).toEqual([SensorRole.HVAC_SUPPLY_TEMP]);

    const full = evaluateRuleAvailability(new Set([SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP]), false).find((r) => r.id === 'HVAC-COOL-001')!;
    expect(full.missingSensorRoles).toEqual([]);
  });

  it('keeps a baseline-requiring rule unavailable until hasBaseline is true, even with every sensor tagged', () => {
    const sensors = new Set([SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP]);
    const withoutBaseline = evaluateRuleAvailability(sensors, false).find((r) => r.id === 'HVAC-COOL-002')!;
    expect(withoutBaseline.available).toBe(false);
    expect(withoutBaseline.missingBaseline).toBe(true);

    const withBaseline = evaluateRuleAvailability(sensors, true).find((r) => r.id === 'HVAC-COOL-002')!;
    expect(withBaseline.available).toBe(true);
    expect(withBaseline.missingBaseline).toBe(false);
  });

  it('never requires a sensor for a rule with no sensor-role requirement (e.g. generic sensor-health rules)', () => {
    const result = evaluateRuleAvailability(new Set(), false).find((r) => r.id === 'SENSOR-001')!;
    expect(result.requiredSensorRoles).toEqual([]);
    expect(result.missingSensorRoles).toEqual([]);
    expect(result.available).toBe(true);
  });
});

describe('threshold keys referenced by the analytics engines', () => {
  it('are all defined in THRESHOLD_DEFINITIONS', () => {
    const fs = require('fs');
    const path = require('path');
    const { THRESHOLD_DEFINITIONS } = require('./threshold-definitions');
    const defined = new Set(THRESHOLD_DEFINITIONS.map((d: { key: string }) => d.key));
    const files = ['analytics-engine.service.ts', 'performance-engine.service.ts'];
    // Keys passed to getValue directly, plus the PLAUSIBLE_* keys handed to
    // evaluatePlausibility indirectly as min/max arguments.
    const referenced = new Set<string>();
    for (const f of files) {
      const src: string = fs.readFileSync(path.join(__dirname, f), 'utf8');
      for (const m of src.matchAll(/getValue\('([A-Z0-9_]+)'/g)) referenced.add(m[1]);
      for (const m of src.matchAll(/'(PLAUSIBLE_[A-Z0-9_]+)'/g)) referenced.add(m[1]);
    }
    expect([...referenced].filter((k) => !defined.has(k))).toEqual([]);
  });
});

describe('thermostat-driven rules', () => {
  it('never require supply/return air probes', () => {
    const { RULE_DEFINITIONS } = require('./rule-definitions');
    const { SensorRole } = require('../common/enums/sensor-role.enum');
    const ids = ['HVAC-COMFORT-001', 'HVAC-COMFORT-003', 'HVAC-RUNTIME-003', 'HVAC-REFRIGERANT-001', 'HVAC-REFRIGERANT-002',
      'HVAC-HUMIDITY-001', 'HVAC-COMBINED-004', 'HVAC-STATE-001', 'SENSOR-005'];
    for (const id of ids) {
      const rule = RULE_DEFINITIONS.find((r: any) => r.ruleId === id);
      expect(rule).toBeDefined();
      expect(rule.applicableSensorRoles).not.toContain(SensorRole.HVAC_RETURN_TEMP);
      expect(rule.applicableSensorRoles).not.toContain(SensorRole.HVAC_SUPPLY_TEMP);
    }
  });
});
