import { signOAuthState, verifyOAuthState } from './nest-oauth-state';

describe('nest-oauth-state', () => {
  const secret = 'test-secret';

  it('round-trips the customer id', () => {
    expect(verifyOAuthState(signOAuthState('cust-1', secret), secret)).toBe('cust-1');
  });

  it('rejects a tampered payload, a wrong secret, and garbage', () => {
    const state = signOAuthState('cust-1', secret);
    const [, sig] = state.split('.');
    const forged = `${Buffer.from(JSON.stringify({ c: 'cust-2', exp: Date.now() + 60000 })).toString('base64url')}.${sig}`;
    expect(verifyOAuthState(forged, secret)).toBeNull();
    expect(verifyOAuthState(state, 'other-secret')).toBeNull();
    expect(verifyOAuthState('not-a-state', secret)).toBeNull();
  });

  it('expires after 30 minutes', () => {
    const issued = Date.now();
    const state = signOAuthState('cust-1', secret, issued);
    expect(verifyOAuthState(state, secret, issued + 29 * 60000)).toBe('cust-1');
    expect(verifyOAuthState(state, secret, issued + 31 * 60000)).toBeNull();
  });
});
