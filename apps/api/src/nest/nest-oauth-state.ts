import { createHmac, timingSafeEqual } from 'crypto';

// The OAuth `state` parameter for the Nest consent flow. The callback is a
// public, unauthenticated URL (Google redirects the homeowner's browser to
// it), so state is what proves the request started from an admin's
// "Connect Nest" click for a specific customer — an HMAC over the
// customerId + expiry, keyed by the server's JWT secret. Not a JWT itself:
// nothing else needs to read it.
const MAX_AGE_MS = 30 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString('base64url');
const sign = (payload: string, secret: string) => b64url(createHmac('sha256', secret).update(payload).digest());

export function signOAuthState(customerId: string, secret: string, now = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ c: customerId, exp: now + MAX_AGE_MS })));
  return `${payload}.${sign(payload, secret)}`;
}

// The customerId the flow was started for, or null if tampered with/expired.
export function verifyOAuthState(state: string, secret: string, now = Date.now()): string | null {
  const [payload, signature] = (state ?? '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { c, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof c !== 'string' || typeof exp !== 'number' || exp < now) return null;
    return c;
  } catch {
    return null;
  }
}
