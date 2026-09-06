import { haversineMeters } from './geo';

describe('haversineMeters', () => {
  it('returns 0 for two identical coordinates', () => {
    expect(haversineMeters(36.1627, -86.7816, 36.1627, -86.7816)).toBe(0);
  });

  it('matches the known great-circle distance for one degree of latitude at the equator', () => {
    // Reference value computed independently with the same R=6371000 sphere
    // model this function uses (WGS-84's ~111,320m/degree assumes the
    // ellipsoid, not a sphere, so that figure would not match here).
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111194.93, 1);
  });

  it('is symmetric — distance A→B equals distance B→A', () => {
    const ab = haversineMeters(36.1627, -86.7816, 36.1672, -86.7816);
    const ba = haversineMeters(36.1672, -86.7816, 36.1627, -86.7816);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('scales linearly for small distances (double the offset, double the distance)', () => {
    const near = haversineMeters(36.1627, -86.7816, 36.16315, -86.7816);
    const far = haversineMeters(36.1627, -86.7816, 36.1636, -86.7816);
    expect(far / near).toBeCloseTo(2, 2);
  });

  it('is within a meter-scale arrival-proximity radius for two points ~50m apart', () => {
    const distance = haversineMeters(36.1627, -86.7816, 36.16315, -86.7816);
    expect(distance).toBeGreaterThan(45);
    expect(distance).toBeLessThan(55);
  });
});
