import { NestAuthorizationRevokedError } from './nest-google.clients';
import { isTransientNestError, shouldReportNestOutage, withTransientRetry } from './nest-sync-resilience';

describe('Nest sync resilience', () => {
  const now = new Date(Date.UTC(2026, 9, 23, 7, 40));
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it('treats the failures seen on the pilot as transient, authorization problems as not', () => {
    expect(isTransientNestError({ response: { status: 503, data: { error: { message: 'The service is currently unavailable.' } } } })).toBe(true);
    expect(isTransientNestError({ response: { status: 500 } })).toBe(true);
    expect(isTransientNestError({ response: { status: 429 } })).toBe(true);
    expect(isTransientNestError({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' })).toBe(true);
    expect(isTransientNestError({ message: 'connect ETIMEDOUT 74.125.136.95:443; connect ENETUNREACH 2607:f8b0::5f:443' })).toBe(true);
    expect(isTransientNestError({ code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN smartdevicemanagement.googleapis.com' })).toBe(true);
    expect(isTransientNestError(new NestAuthorizationRevokedError('Nest is disconnected — reconnect Nest'))).toBe(false);
    expect(isTransientNestError({ response: { status: 401 } })).toBe(false);
    expect(isTransientNestError({ response: { status: 403 } })).toBe(false);
  });

  it('retries transient failures and gives up on the rest at once', async () => {
    const sleep = jest.fn(async () => undefined);
    let calls = 0;
    const flaky = async () => { calls++; if (calls < 3) throw { response: { status: 503 } }; return 'ok'; };
    await expect(withTransientRetry(flaky, [10, 30], sleep)).resolves.toBe('ok');
    expect(sleep.mock.calls.map((c: any[]) => c[0])).toEqual([10, 30]);

    let authCalls = 0;
    const revoked = async () => { authCalls++; throw new NestAuthorizationRevokedError('revoked'); };
    await expect(withTransientRetry(revoked, [10, 30], sleep)).rejects.toThrow('revoked');
    expect(authCalls).toBe(1);

    const down = async () => { throw { code: 'ETIMEDOUT' }; };
    await expect(withTransientRetry(down, [10, 30], sleep)).rejects.toEqual({ code: 'ETIMEDOUT' });
  });

  it('reports a transient outage only once it outlasts the grace period', () => {
    expect(shouldReportNestOutage({ transient: true, lastSuccessAt: minsAgo(5), now, graceMinutes: 15 })).toBe(false);
    expect(shouldReportNestOutage({ transient: true, lastSuccessAt: minsAgo(16), now, graceMinutes: 15 })).toBe(true);
    expect(shouldReportNestOutage({ transient: false, lastSuccessAt: minsAgo(1), now, graceMinutes: 15 })).toBe(true);
    expect(shouldReportNestOutage({ transient: true, lastSuccessAt: null, now, graceMinutes: 15 })).toBe(true);
  });
});
