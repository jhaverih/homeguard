// Bumped whenever a published legal document materially changes — stamped
// onto the User record when a user accepts, so we can tell who accepted an
// older version. As of 2026-09-06 the frontend DOES read these (via
// GET /legal/versions) and forces re-acceptance for any user whose stored
// version doesn't match — bumping one of these is a real, user-facing
// action, not just an audit stamp.
//
// NEVER bump one of these without first asking the product owner whether
// THIS SPECIFIC content change is consequential enough to force every
// existing user to re-accept before they can continue (general terms) or
// submit a new service request (facilitator disclosure). A typo fix or
// formatting change should not bump the version — edit the .md content
// in apps/api/legal/ and leave the constant alone. Only bump when the
// answer to that question is genuinely yes.
export const CURRENT_CUSTOMER_TOS_VERSION = '2026-07-15';
export const CURRENT_VENDOR_TOS_VERSION = '2026-07-15';
export const CURRENT_FACILITATOR_DISCLOSURE_VERSION = '2026-09-06';
