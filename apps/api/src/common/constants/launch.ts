import { PlanTier } from '../enums/role.enum';

// Launch scope: homeowners can only see and buy the Care Plan (FREE) and
// CarePlus (BASIC). Proactive (STANDARD) and the home-monitoring service it
// includes stay hidden until they launch — except for the accounts below,
// which keep the full catalog for testing. Remove a tier's gate by adding it
// to LAUNCH_PLAN_TIERS.
export const LAUNCH_PLAN_TIERS: readonly PlanTier[] = [PlanTier.FREE, PlanTier.BASIC];

// Comma-separated override via PREVIEW_TESTER_EMAILS (case-insensitive).
const DEFAULT_PREVIEW_TESTERS = ['hjhaveri@blueskylegacyroofing.com'];

export function previewTesterEmails(): string[] {
  const env = process.env.PREVIEW_TESTER_EMAILS;
  const list = env !== undefined ? env.split(',') : DEFAULT_PREVIEW_TESTERS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isPreviewTester(email: string | null | undefined): boolean {
  return !!email && previewTesterEmails().includes(email.trim().toLowerCase());
}

export function isLaunchedTier(tier: PlanTier | string | null | undefined): boolean {
  return LAUNCH_PLAN_TIERS.includes(tier as PlanTier);
}
