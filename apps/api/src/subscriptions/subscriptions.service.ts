import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { CustomerSubscription, SubscriptionStatus } from './entities/customer-subscription.entity';
import { PlanTier } from '../common/enums/role.enum';
import { addYears } from './utils/date.util';

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private plansRepo: Repository<SubscriptionPlan>,
    @InjectRepository(CustomerSubscription)
    private subscriptionsRepo: Repository<CustomerSubscription>,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    const count = await this.plansRepo.count();
    if (count > 0) return;

    const plans = [
      {
        tier: PlanTier.BASIC,
        name: 'Basic Plan',
        description: '2 annual inspections covering AC, toilets, and light bulbs',
        price: 99,
        inspectionsPerYear: 2,
        features: [
          'AC visual inspection & filter replacement',
          'Toilet water leakage verification',
          'Light bulb replacement check',
          '2 inspections per year',
        ],
      },
      {
        tier: PlanTier.STANDARD,
        name: 'Standard Plan',
        description: 'Basic plan plus water leak monitoring for AC and washer',
        price: 199,
        inspectionsPerYear: 2,
        features: [
          'All Basic plan features',
          'AC drainage pan water leak monitoring',
          'Washer machine pan monitoring',
          '2 inspections per year',
        ],
      },
      {
        tier: PlanTier.PREMIUM,
        name: 'Premium Plan',
        description: 'Standard plan plus full HVAC monitoring',
        price: 299,
        inspectionsPerYear: 2,
        features: [
          'All Standard plan features',
          'Full HVAC system monitoring',
          '2 inspections per year',
          'Priority scheduling',
        ],
      },
    ];

    for (const plan of plans) {
      await this.plansRepo.save(this.plansRepo.create(plan));
    }
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    return this.plansRepo.find({ where: { isActive: true } });
  }

  async getActiveSubscription(customerId: string): Promise<CustomerSubscription | null> {
    return this.subscriptionsRepo.findOne({
      where: { customerId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
  }

  async subscribe(customerId: string, planId: string): Promise<CustomerSubscription> {
    const existing = await this.getActiveSubscription(customerId);
    if (existing) throw new BadRequestException('Customer already has an active subscription');

    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const now = new Date();
    const subscription = this.subscriptionsRepo.create({
      customerId,
      planId,
      status: SubscriptionStatus.ACTIVE,
      inspectionsUsed: 0,
      startDate: now,
      endDate: addYears(now, 1),
    });

    return this.subscriptionsRepo.save(subscription);
  }

  async incrementInspectionsUsed(subscriptionId: string): Promise<void> {
    const sub = await this.subscriptionsRepo.findOne({ where: { id: subscriptionId }, relations: ['plan'] });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.inspectionsUsed >= sub.plan.inspectionsPerYear) {
      throw new BadRequestException('No inspections remaining on this subscription');
    }
    await this.subscriptionsRepo.increment({ id: subscriptionId }, 'inspectionsUsed', 1);
  }

  async cancelSubscription(customerId: string): Promise<CustomerSubscription> {
    const sub = await this.getActiveSubscription(customerId);
    if (!sub) throw new NotFoundException('No active subscription found');
    sub.status = SubscriptionStatus.CANCELLED;
    return this.subscriptionsRepo.save(sub);
  }

  async changePlan(customerId: string, newPlanId: string): Promise<CustomerSubscription> {
    const sub = await this.getActiveSubscription(customerId);
    if (!sub) throw new NotFoundException('No active subscription found');
    const plan = await this.plansRepo.findOne({ where: { id: newPlanId } });
    if (!plan) throw new NotFoundException('Plan not found');
    sub.planId = newPlanId;
    sub.plan = plan;
    return this.subscriptionsRepo.save(sub);
  }

  async updatePlan(planId: string, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    await this.plansRepo.update(planId, data);
    return this.plansRepo.findOne({ where: { id: planId } });
  }
}
