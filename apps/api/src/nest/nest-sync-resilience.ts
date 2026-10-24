import { NestAuthorizationRevokedError } from './nest-google.clients';

// Google's SDM API and the QNAP's network both blip: between 2026-10-11 and
// 10-23 there were 16 single failed polls (503 "service is currently
// unavailable", 500 "internal error", 20 s timeouts, ETIMEDOUT/ENETUNREACH,
// EAI_AGAIN DNS), each fixed by the next poll 5 minutes later. Retrying and
// waiting out a short outage keeps those from flashing "thermostat data is
// unavailable"; an authorization problem still reports at once because only
// the homeowner can fix it. Pure.

const TRANSIENT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE']);

export function isTransientNestError(err: any): boolean {
  if (err instanceof NestAuthorizationRevokedError) return false;
  const status = err?.response?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  if (TRANSIENT_CODES.has(err?.code)) return true;
  return /timeout|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ECONNRESET|socket hang up|network/i.test(String(err?.message ?? ''));
}

// Runs fn, retrying transient failures after each delay in turn.
export async function withTransientRetry<T>(fn: () => Promise<T>, delaysMs: number[], sleep: (ms: number) => Promise<unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delaysMs.length || !isTransientNestError(err)) throw err;
      await sleep(delaysMs[attempt]);
    }
  }
}

// Whether a failed sync should raise "thermostat data is unavailable" now:
// at once for authorization problems, otherwise only once the connection
// has been failing for graceMinutes since the last success.
export function shouldReportNestOutage(p: { transient: boolean; lastSuccessAt: Date | null; now: Date; graceMinutes: number }): boolean {
  if (!p.transient) return true;
  if (!p.lastSuccessAt) return true;
  return p.now.getTime() - p.lastSuccessAt.getTime() >= p.graceMinutes * 60_000;
}
