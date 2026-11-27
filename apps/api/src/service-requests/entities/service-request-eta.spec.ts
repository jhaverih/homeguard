import { ServiceRequest } from './service-request.entity';
import { ServiceRequestStatus } from '../../common/enums/role.enum';
import { timeZoneForState } from '../../common/utils/timezone';

function request(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return Object.assign(new ServiceRequest(), {
    status: ServiceRequestStatus.VENDOR_EN_ROUTE,
    latitude: 35.7512, longitude: -86.9300, // a home in Spring Hill, TN
    zipCode: '37174',
    ...overrides,
  });
}

describe('arrival estimate', () => {
  it('drives to the geocoded home, allowing for roads', () => {
    // ~10 miles straight north: 13 road miles at 28 mph ≈ 28 minutes.
    const min = request().driveMinutesFrom(35.7512 + 10 / 69, -86.93);
    expect(min).toBeGreaterThanOrEqual(26);
    expect(min).toBeLessThanOrEqual(30);
  });

  it('is at least a minute when already there', () => {
    expect(request().driveMinutesFrom(35.7512, -86.93)).toBe(1);
  });

  it('is live only while the location is fresh', () => {
    const fresh = request({ vendorLatitude: 35.8, vendorLongitude: -86.93, vendorLocationAt: new Date() } as any);
    expect(fresh.etaMinutes).not.toBeNull();
    const stale = request({ vendorLatitude: 35.8, vendorLongitude: -86.93, vendorLocationAt: new Date(Date.now() - 30 * 60000) } as any);
    expect(stale.etaMinutes).toBeNull();
  });
});

describe('timeZoneForState', () => {
  it('maps states to their main zone', () => {
    expect(timeZoneForState('TN')).toBe('America/Chicago');
    expect(timeZoneForState('ny')).toBe('America/New_York');
    expect(timeZoneForState(null)).toBe('America/Chicago');
  });
});
