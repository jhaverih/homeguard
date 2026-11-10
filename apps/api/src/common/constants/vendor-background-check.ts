// Background check and drug test responsibility statement every vendor
// company signs during onboarding. Attenteve does not run these checks; the
// vendor certifies it does and accepts responsibility for them.
//
// The text is served to the app from here (VendorOnboardingService) so what
// a vendor reads is exactly what the stored version refers to. Same rule as
// common/constants/tos.ts: bump the version only for a material change, and
// only after the product owner confirms every company must re-sign.
//
// DRAFT wording — have counsel review before production launch.
export const CURRENT_VENDOR_BACKGROUND_CHECK_VERSION = '2026-11-09';

export const VENDOR_BACKGROUND_CHECK_TITLE = 'Background Check and Drug Testing Responsibility';

export const VENDOR_BACKGROUND_CHECK_TEXT = [
  'The company named in this application ("Company") certifies that it has completed, and will continue to complete, a criminal background check and a drug test for every owner, employee, technician and subcontractor before that person performs any service for an Attenteve customer or enters an Attenteve customer\'s property, and that it repeats these checks as often as applicable law and its own policies require.',
  'Company is solely responsible for performing these checks in compliance with all applicable laws, including the Fair Credit Reporting Act and any state and local background-check, drug-testing and fair-chance hiring laws, and for every decision it makes based on their results. Attenteve does not perform these checks, does not review their results, and does not verify that Company has performed them.',
  'Company will keep records showing that each check was completed and will provide proof of completion to Attenteve within five (5) business days of a request.',
  'Company will indemnify, defend and hold harmless Attenteve and its officers, directors, employees and agents from and against any claims, losses, damages, liabilities, penalties, costs and expenses (including reasonable attorneys\' fees) arising out of or related to Company\'s failure to perform, or negligent performance of, these checks, or any act or omission of a person Company sent to a customer\'s property.',
  'Failure to perform these checks, or any false statement in this certification, is grounds for immediate suspension or permanent removal from the Attenteve platform, in addition to any other remedy available to Attenteve.',
  'By signing below, the signer confirms that they are authorized to bind Company to this certification.',
];
