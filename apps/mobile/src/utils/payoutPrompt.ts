// Set when a newly approved vendor taps "Browse jobs first" on the payout
// screen, so (vendor)/_layout stops sending them back to it for the rest of
// this app session. The next launch prompts again until Stripe is finished;
// the API refuses every Accept until then either way.
let deferred = false;

export const deferPayoutSetup = () => { deferred = true; };
export const isPayoutSetupDeferred = () => deferred;
