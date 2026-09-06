import { describe, it, expect } from 'vitest';
import { filterCustomers, Customer } from './CustomerPicker';

const roster: Customer[] = [
  { id: '1', name: 'Alice Anderson', email: 'alice@example.com' },
  { id: '2', name: 'Bob Baker', email: 'bob@work.com' },
  { id: '3', name: 'Carol Chen', email: 'carol.chen@example.com' },
];

describe('filterCustomers', () => {
  it('returns the full roster when the query is empty or all whitespace', () => {
    expect(filterCustomers(roster, '')).toEqual(roster);
    expect(filterCustomers(roster, '   ')).toEqual(roster);
  });

  it('returns an empty list before the roster has loaded, regardless of query', () => {
    expect(filterCustomers(null, '')).toEqual([]);
    expect(filterCustomers(null, 'alice')).toEqual([]);
  });

  it('matches by name, case-insensitively', () => {
    expect(filterCustomers(roster, 'alice')).toEqual([roster[0]]);
    expect(filterCustomers(roster, 'ALICE')).toEqual([roster[0]]);
  });

  it('matches by email as well as name', () => {
    expect(filterCustomers(roster, 'work.com')).toEqual([roster[1]]);
  });

  it('matches a substring anywhere in the name or email, not just a prefix', () => {
    expect(filterCustomers(roster, 'chen')).toEqual([roster[2]]);
  });

  it('trims leading/trailing whitespace from the query before matching', () => {
    expect(filterCustomers(roster, '  bob  ')).toEqual([roster[1]]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCustomers(roster, 'nonexistent')).toEqual([]);
  });
});
