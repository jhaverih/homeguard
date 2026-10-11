import { EvidencePackage, fallbackExplanation, validateExplanation } from './explanation';

const pkg: EvidencePackage = {
  event: { id: 'ev-1', component: 'REFRIGERANT', components: ['PERFORMANCE', 'REFRIGERANT'], category: 'EQUIPMENT', startedAt: '2026-07-15T14:05:00Z', lastOccurrenceAt: '2026-07-15T15:00:00Z', status: 'ACTIVE', severity: 'ATTENTION' },
  items: [
    { ref: 'anomaly:a-1', kind: 'anomaly', description: 'Suction-line temperature 60.5 °F vs baseline 48 °F (robust z 9.1)', values: { observed: 60.5, baseline: 48, robustZ: 9.1 }, unit: '°F' },
    { ref: 'finding:f-1', kind: 'rule_finding', description: 'HVAC-REFRIGERANT-001 triggered', values: { currentF: 60.5, baselineF: 48 } },
  ],
  dataAvailability: [{ input: 'Supply air temperature', state: 'NO_DATA' }, { input: 'Suction line', state: 'OK' }],
  operatingContext: { mode: 'COOLING', outdoorBand: '90s' },
  confidence: { anomalyStrength: 'STRONG', evidenceCompleteness: 'PARTIAL', confidence: 'medium', rationale: ['2 independent signals'] },
  allowedActions: [{ code: 'CHECK_AIR_FILTER', title: 'Check the air filter' }, { code: 'SCHEDULE_CONTRACTOR_VISIT', title: 'Schedule a contractor visit' }],
};
const good = {
  summary: 'The suction-line temperature has been higher than this system\'s normal pattern during cooling.',
  observations: ['Suction-line temperature was 60.5 °F against a usual 48 °F during stable cooling.'],
  possible_causes: [{ cause: 'Restricted airflow across the indoor coil could raise suction temperature', supporting_evidence: ['Suction line above baseline'], contradicting_evidence: ['Supply air temperature is not measured, so airflow cannot be confirmed'] }],
  confidence_label: 'medium',
  confidence_rationale: 'Two independent signals agree, but supply air is not measured.',
  recommended_actions: ['Check the air filter', 'Schedule a contractor visit'],
  customer_message: 'A temperature on your cooling system is higher than usual. Checking the air filter is a good first step.',
  technician_message: 'Suction 60.5 °F vs 48 °F baseline, z 9.1; no supply/return air data.',
  additional_data_needed: ['Supply and return air temperature'],
  safety_note: null,
  evidence_references: ['anomaly:a-1', 'finding:f-1'],
};

describe('validateExplanation', () => {
  it('11. accepts a response that uses only supplied evidence', () => {
    expect(validateExplanation(good, pkg)).toMatchObject({ ok: true });
  });
  it('12. rejects references to evidence that was never supplied', () => {
    const r = validateExplanation({ ...good, evidence_references: ['anomaly:a-1', 'reading:made-up'] }, pkg);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/not in the supplied evidence: reading:made-up/);
  });
  it('12. rejects an invented reading, a confidence label it was not given, and unsafe advice', () => {
    expect(validateExplanation({ ...good, observations: ['Suction-line temperature reached 71 °F.'] }, pkg).reasons.join()).toMatch(/values not in the evidence \(71\)/);
    expect(validateExplanation({ ...good, confidence_label: 'high' }, pkg).reasons.join()).toMatch(/must be "medium"/);
    expect(validateExplanation({ ...good, customer_message: 'You should add refrigerant to the system.' }, pkg).reasons.join()).toMatch(/adding refrigerant/);
    expect(validateExplanation({ ...good, summary: 'Confirmed low charge: the compressor has failed.' }, pkg).reasons.join()).toMatch(/failed component|confirmed/);
    expect(validateExplanation({ ...good, technician_message: 'Fixing this will save 20% energy.' }, pkg).reasons.join()).toMatch(/energy savings/);
    expect(validateExplanation({ ...good, recommended_actions: ['Replace the compressor'] }, pkg).reasons.join()).toMatch(/allowed catalog/);
  });
  it('12. rejects malformed and incomplete output', () => {
    expect(validateExplanation('not json', pkg).ok).toBe(false);
    expect(validateExplanation({ ...good, observations: [] }, pkg).reasons).toContain('observations missing');
    const { customer_message, ...missing } = good;
    expect(validateExplanation(missing, pkg).reasons).toContain('customer_message missing');
    expect(validateExplanation({ ...good, possible_causes: [{ cause: 'x' }] }, pkg).reasons).toContain('possible_causes malformed');
  });
});

describe('fallbackExplanation', () => {
  it('is always valid against its own evidence and uses the computed confidence', () => {
    const fb = fallbackExplanation(pkg);
    expect(fb.confidence_label).toBe('medium');
    expect(fb.evidence_references).toEqual(['anomaly:a-1', 'finding:f-1']);
    expect(fb.additional_data_needed).toEqual(['Supply air temperature (no data)']);
    expect(validateExplanation(fb, pkg)).toMatchObject({ ok: true });
  });
});
