import { conditionStatus } from './conditionStatus';

describe('conditionStatus', () => {
  it('labels how a condition ended', () => {
    expect(conditionStatus('ACTIVE').label).toBe('Active');
    expect(conditionStatus('RESOLVED', null).label).toBe('Cleared');
    expect(conditionStatus('RESOLVED', 'HOMEOWNER').label).toBe('Marked fixed by you');
    expect(conditionStatus('DISMISSED', 'HOMEOWNER').label).toBe('Dismissed by you');
    // Dismissals recorded before closedVia existed only came from the homeowner.
    expect(conditionStatus('DISMISSED', null).label).toBe('Dismissed by you');
    expect(conditionStatus('DISMISSED', 'ADMIN').label).toBe('Dismissed by Attenteve');
  });
});
