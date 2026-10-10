import { bucketPoints, stateBands } from './series';

const T0 = Date.UTC(2026, 9, 10, 12, 0);
const at = (min: number) => new Date(T0 + min * 60_000);

describe('bucketPoints', () => {
  it('keeps every reading for the day view', () => {
    expect(bucketPoints([{ t: at(0), v: 70 }, { t: at(5), v: 71 }], 'day')).toHaveLength(2);
  });
  it('averages into hourly buckets for the week view', () => {
    const pts = [{ t: at(0), v: 70 }, { t: at(30), v: 72 }, { t: at(65), v: 75 }];
    expect(bucketPoints(pts, 'week')).toEqual([
      { t: at(30).toISOString(), v: 71 },
      { t: at(90).toISOString(), v: 75 },
    ]);
  });
});

describe('stateBands', () => {
  it('turns report-on-change call states into cooling bands, clipped to the range', () => {
    const samples = [
      { t: at(-30), state: 'COOLING' }, { t: at(10), state: 'OFF' },
      { t: at(40), state: 'COOLING' }, { t: at(41), state: 'COOLING' }, { t: at(55), state: 'OFF' },
      { t: at(90), state: 'COOLING' },
    ];
    expect(stateBands(samples, at(0), at(100), ['COOLING'])).toEqual([
      { from: at(0).toISOString(), to: at(10).toISOString(), state: 'COOLING' },
      { from: at(40).toISOString(), to: at(55).toISOString(), state: 'COOLING' },
      { from: at(90).toISOString(), to: at(100).toISOString(), state: 'COOLING' },
    ]);
  });
});
