import { mergeStateRunCycles } from './run-cycles';

const t = (min: number) => new Date(Date.UTC(2026, 9, 10, 12, min));
const s = (deviceRegistryId: string, min: number, on: 0 | 1) => ({ deviceRegistryId, observedAt: t(min), numericValue: on });

describe('mergeStateRunCycles', () => {
  it('derives cycles from a single thermostat', () => {
    expect(mergeStateRunCycles([s('up', 0, 1), s('up', 12, 0), s('up', 30, 1), s('up', 40, 0)])).toEqual([
      { start: t(0), end: t(12), durationMinutes: 12 },
      { start: t(30), end: t(40), durationMinutes: 10 },
    ]);
  });

  it('treats one air handler called by two zones as a single cycle while either calls', () => {
    // 1st floor calls 0–20, 2nd floor joins at 10 and keeps it running to 25.
    const cycles = mergeStateRunCycles([s('down', 0, 1), s('up', 10, 1), s('down', 20, 0), s('up', 25, 0)]);
    expect(cycles).toEqual([{ start: t(0), end: t(25), durationMinutes: 25 }]);
  });

  it('ignores a repeated OFF from the idle zone and reports a still-running cycle as open', () => {
    const cycles = mergeStateRunCycles([s('down', 0, 1), s('up', 5, 0), s('up', 6, 0)]);
    expect(cycles).toEqual([{ start: t(0), end: null, durationMinutes: null }]);
  });
});
