import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { PlanTier } from '../common/enums/role.enum';
import { isPreviewTester } from '../common/constants/launch';
import { RULE_DEFINITIONS } from './rule-definitions';

// Full HVAC analytics (every rule, every sensor) belongs to Proactive and
// above. Monitoring isn't launched yet (common/constants/launch.ts), so a
// preview tester keeps it whatever plan the account is on.
export function hasFullAnalytics(tier: PlanTier | string | null | undefined, email: string | null | undefined): boolean {
  return tier === PlanTier.STANDARD || tier === PlanTier.PREMIUM || isPreviewTester(email);
}

// A rule a customer can't see on their Analytics page must never alert them.
export function canNotifyRule(ruleId: string, fullAnalytics: boolean): boolean {
  const rule = RULE_DEFINITIONS.find((r) => r.ruleId === ruleId);
  return !!rule && (fullAnalytics || rule.careplusEligible);
}

// The one answer to "what may this customer see and be alerted about",
// shared by the Analytics page and every alert path so they can't disagree.
@Injectable()
export class AnalyticsAccessService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
  ) {}

  // Same active-subscription + family-sharing lookup as
  // SubscriptionsService.getActiveSubscription, duplicated here rather than
  // imported to avoid a module cycle (SubscriptionsModule → YolinkModule →
  // IotAnalyticsModule).
  async accessFor(customerId: string): Promise<{ tier: PlanTier | null; fullAnalytics: boolean }> {
    const user = await this.usersRepo.findOne({ where: { id: customerId } });
    const ownerId = user?.parentUserId ?? customerId;
    const owner = ownerId === customerId ? user : await this.usersRepo.findOne({ where: { id: ownerId } });
    const sub = await this.subscriptionsRepo.findOne({ where: { customerId: ownerId, status: SubscriptionStatus.ACTIVE } });
    const tier = sub?.plan?.tier ?? null;
    return { tier, fullAnalytics: hasFullAnalytics(tier, owner?.email) };
  }

  async canNotify(customerId: string, ruleId: string): Promise<boolean> {
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === ruleId);
    if (!rule) return false;
    if (rule.careplusEligible) return true;
    return (await this.accessFor(customerId)).fullAnalytics;
  }
}
