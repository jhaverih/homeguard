import { customerAiSummary } from './customer-summary';

const output: any = {
  customer_message: 'Humidity indoors has stayed higher than usual while cooling.',
  recommended_actions: ['Check the air filter'],
  confidence_label: 'medium',
  safety_note: null,
  technician_message: 'z 4.2 vs baseline',
};
const event = (over: any = {}) => ({
  id: 'ev-1', status: 'ACTIVE', category: 'EQUIPMENT', components: ['HUMIDITY', 'CONDENSATE'],
  findingIds: ['f-1'], evidenceHash: 'h1', lastOccurrenceAt: new Date('2026-10-11T02:00:00Z'), ...over,
});
const explanation = (over: any = {}) => ({ status: 'OK', evidenceHash: 'h1', output, createdAt: new Date('2026-10-11T02:05:00Z'), ...over });

describe('customerAiSummary', () => {
  it('shows the homeowner message of a validated explanation for a rule-backed event', () => {
    const s = customerAiSummary('HUMIDITY', [event()], new Set(['f-1']), () => explanation());
    expect(s).toEqual({
      eventId: 'ev-1', source: 'ai', message: output.customer_message, recommendedActions: ['Check the air filter'],
      confidence: 'medium', safetyNote: null, generatedAt: '2026-10-11T02:05:00.000Z',
    });
    expect(JSON.stringify(s)).not.toContain('z 4.2');
  });

  it('never shows anomaly-only (shadow) events, events for other components, or resolved events', () => {
    expect(customerAiSummary('HUMIDITY', [event({ findingIds: [] })], new Set(['f-1']), () => explanation())).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event()], new Set(['f-other']), () => explanation())).toBeNull();
    expect(customerAiSummary('REFRIGERANT', [event()], new Set(['f-1']), () => explanation())).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event({ status: 'RESOLVED' })], new Set(['f-1']), () => explanation())).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event({ category: 'SENSOR' })], new Set(['f-1']), () => explanation())).toBeNull();
  });

  it('skips explanations written for older evidence or that failed, and labels the fallback', () => {
    expect(customerAiSummary('HUMIDITY', [event()], new Set(['f-1']), () => explanation({ evidenceHash: 'old' }))).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event()], new Set(['f-1']), () => explanation({ status: 'FAILED' }))).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event()], new Set(['f-1']), () => null)).toBeNull();
    expect(customerAiSummary('HUMIDITY', [event()], new Set(['f-1']), () => explanation({ status: 'FALLBACK' }))?.source).toBe('standard');
  });
});
