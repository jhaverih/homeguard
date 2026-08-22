import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { AnalyticsFinding, FindingStatus } from './entities/analytics-finding.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { UserRole, PlanTier } from '../common/enums/role.enum';
import { SensorRole, SENSOR_ROLE_META } from '../common/enums/sensor-role.enum';
import { RULE_DEFINITIONS, evaluateRuleAvailability } from './rule-definitions';
import { AnalyticsEngineService } from './analytics-engine.service';
import { ComponentHealthService } from './component-health.service';
import { TelemetryService } from './telemetry.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

// Sensor roles a CarePlus customer can see findings/coverage for — CarePlus
// gets low/high indoor temp + the HVAC condensate sensor only (never the
// washer's own leak sensor — that's a different equipment/rule group
// entirely, always excluded from this HVAC-scoped feed regardless of tier).
const CAREPLUS_SENSOR_ROLES = new Set([SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.HVAC_DRAIN_WATER]);

// Every sensor role any HVAC-analytics rule actually cares about — derived
// from the rule catalog itself so the admin "Sensor Coverage" table never
// lists roles from unrelated domains (washer, water heater, plumbing,
// freezer/fridge) that this page was never meant to show.
const HVAC_RELEVANT_ROLES: SensorRole[] = Array.from(new Set(RULE_DEFINITIONS.flatMap((r) => r.applicableSensorRoles)));

interface AssignedSensor { device: DeviceRegistry; assignment: SensorAssignment; equipment: Equipment | null }

// The public-facing facade — composes DeviceRegistryService/ClassificationService/
// TelemetryService/AnalyticsEngineService into the same surface the
// controller (and, historically, YolinkService) called against, so the
// mobile Analytics page and admin Analytics page's response shapes never
// change even though the model underneath was fully rebuilt.
@Injectable()
export class IotAnalyticsService {
  private readonly logger = new Logger(IotAnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(DeviceRegistry) private deviceRegistryRepo: Repository<DeviceRegistry>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
    private analyticsEngine: AnalyticsEngineService,
    private componentHealthService: ComponentHealthService,
    private telemetryService: TelemetryService,
    private notificationsService: NotificationsService,
  ) {}

  // Same active-subscription + family-sharing lookup as
  // SubscriptionsService.getActiveSubscription, duplicated here rather than
  // imported to avoid a module cycle (SubscriptionsModule → YolinkModule →
  // IotAnalyticsModule) — same convention this codebase already uses for
  // other small cross-module lookups.
  private async getActiveSubscription(customerId: string): Promise<CustomerSubscription | null> {
    const user = await this.usersRepo.findOne({ where: { id: customerId } });
    const ownerId = user?.parentUserId ?? customerId;
    return this.subscriptionsRepo.findOne({ where: { customerId: ownerId, status: SubscriptionStatus.ACTIVE } });
  }

  isHvacAnalyticsRelevant(assignment: SensorAssignment, equipment: Equipment | null): boolean {
    return assignment.sensorRole === SensorRole.INDOOR_AMBIENT_TEMP || equipment?.equipmentCode === 'HVAC-01';
  }

  private async getAssignedSensorsForCustomer(customerId: string): Promise<AssignedSensor[]> {
    const yolinkHomes = await this.yolinkHomesRepo.find({ where: { customerId, isActive: true } });
    const homeIds = yolinkHomes.map((h) => h.homeId).filter((id): id is string => !!id);
    if (homeIds.length === 0) return [];
    const devices = await this.deviceRegistryRepo.find({ where: { homeId: In(homeIds) } });
    if (devices.length === 0) return [];
    const deviceIds = devices.map((d) => d.id);
    const assignments = await this.assignmentsRepo.find({ where: { deviceRegistryId: In(deviceIds) } });
    const equipmentIds = assignments.map((a) => a.equipmentId).filter((id): id is string => !!id);
    const equipmentRows = equipmentIds.length ? await this.equipmentRepo.find({ where: { id: In(equipmentIds) } }) : [];
    const equipmentById = new Map(equipmentRows.map((e) => [e.id, e]));
    const deviceById = new Map(devices.map((d) => [d.id, d]));
    return assignments
      .map((assignment) => {
        const device = deviceById.get(assignment.deviceRegistryId);
        if (!device) return null;
        return { device, assignment, equipment: assignment.equipmentId ? equipmentById.get(assignment.equipmentId) ?? null : null };
      })
      .filter((s): s is AssignedSensor => !!s);
  }

  // ── Customer-facing summary (tier-gated) ─────────────────────────────────

  async getMyAnalytics(customerId: string) {
    const sub = await this.getActiveSubscription(customerId);
    const tier = sub?.plan?.tier ?? null;
    const isProactivePlus = tier === PlanTier.STANDARD || tier === PlanTier.PREMIUM;

    const sensors = await this.getAssignedSensorsForCustomer(customerId);
    const hvacSensors = sensors.filter((s) => this.isHvacAnalyticsRelevant(s.assignment, s.equipment));
    const visible = isProactivePlus ? hvacSensors : hvacSensors.filter((s) => CAREPLUS_SENSOR_ROLES.has(s.assignment.sensorRole));
    const taggedRoleSet = new Set(visible.map((s) => s.assignment.sensorRole));
    const visibleDeviceIds = new Set(visible.map((s) => s.device.id));

    const allFindings = sensors.length
      ? await this.findingsRepo.find({ where: { customerId, status: FindingStatus.ACTIVE }, order: { detectedAt: 'DESC' } })
      : [];
    const allowedRuleIds = new Set(RULE_DEFINITIONS.filter((r) => isProactivePlus || r.careplusEligible).map((r) => r.ruleId));
    const visibleFindings = allFindings.filter((f) => allowedRuleIds.has(f.ruleId) && f.deviceRegistryId && visibleDeviceIds.has(f.deviceRegistryId));

    const coverageRoles: SensorRole[] = isProactivePlus
      ? [SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.HVAC_DRAIN_WATER, SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP]
      : [SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.HVAC_DRAIN_WATER];
    const sensorCoverage = coverageRoles.map((role) => {
      const devs = visible.filter((s) => s.assignment.sensorRole === role);
      return { role, label: SENSOR_ROLE_META[role].label, connected: devs.length > 0, deviceNames: devs.map((s) => s.device.currentProviderName ?? '') };
    });

    const hasFullHvacTempSensors = taggedRoleSet.has(SensorRole.HVAC_RETURN_TEMP) && taggedRoleSet.has(SensorRole.HVAC_SUPPLY_TEMP);

    return {
      tier: tier ?? 'FREE',
      isProactivePlus,
      healthState: !isProactivePlus ? 'NOT_INCLUDED' : hasFullHvacTempSensors ? 'LEARNING' : 'AWAITING_SENSORS',
      findings: visibleFindings.map((f) => this.analyticsEngine.toFindingDto(f)),
      sensorCoverage,
      componentHealth: this.componentHealthService.computeComponentHealth(taggedRoleSet, visibleFindings),
    };
  }

  async resolveFinding(customerId: string, findingId: string, status: FindingStatus.RESOLVED | FindingStatus.DISMISSED): Promise<void> {
    await this.analyticsEngine.resolveFinding(customerId, findingId, status);
  }

  async snoozeFinding(customerId: string, findingId: string, minutes: number) {
    return this.analyticsEngine.snoozeFinding(customerId, findingId, minutes);
  }

  // "Request HVAC Contractor Visit" — notifies admins now; creating a real
  // assigned work order is separate follow-on backend work (not this pass).
  async requestContractorVisit(customerId: string): Promise<{ ok: boolean }> {
    const customer = await this.usersRepo.findOne({ where: { id: customerId } });
    await this.notificationsService.notifyUserWithEmail(
      customerId, NotificationType.NEW_REQUEST,
      'HVAC Contractor Visit Requested', "We've received your request — an Attenteve specialist will be in touch shortly.",
      { screen: 'hvac-analytics' },
    ).catch(() => {});
    this.logger.log(`HVAC contractor visit requested by customer ${customer?.email ?? customerId}`);
    return { ok: true };
  }

  // ── Admin-facing ──────────────────────────────────────────────────────────

  // With no query, returns every customer (alphabetical) so the admin
  // picker can list everyone the moment it's opened; the frontend then
  // filters that list client-side as the admin types, matching a standard
  // "browse or search" dropdown rather than requiring 2+ characters before
  // showing anything. A query still filters server-side too (kept for any
  // future caller that wants a scoped search instead of the full list).
  async searchCustomers(query?: string) {
    const trimmed = query?.trim() ?? '';
    const where = trimmed.length >= 2
      ? [{ firstName: ILike(`%${trimmed}%`) }, { lastName: ILike(`%${trimmed}%`) }, { email: ILike(`%${trimmed}%`) }]
      : undefined;
    const users = await this.usersRepo.find({ where, take: 500 });
    return users
      .filter((u) => u.roles?.includes(UserRole.CUSTOMER))
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAdminAnalytics(customerId: string) {
    const sensors = await this.getAssignedSensorsForCustomer(customerId);
    const hvacSensors = sensors.filter((s) => this.isHvacAnalyticsRelevant(s.assignment, s.equipment));
    const taggedRoleSet = new Set(hvacSensors.map((s) => s.assignment.sensorRole));
    const taggedDeviceIds = new Set(hvacSensors.map((s) => s.device.id));

    const allFindings = await this.findingsRepo.find({ where: { customerId }, order: { detectedAt: 'DESC' }, take: 50 });
    const findings = allFindings.filter((f) => f.deviceRegistryId && taggedDeviceIds.has(f.deviceRegistryId));

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deviceById = new Map(hvacSensors.map((s) => [s.device.id, s]));
    const telemetry = await this.telemetryService.getRecentSeries(Array.from(taggedDeviceIds), since);
    const series = telemetry
      .filter((t) => t.numericValue != null)
      .map((t) => ({
        analyticsRole: deviceById.get(t.deviceRegistryId)?.assignment.analyticsRole ?? t.sensorRole,
        deviceName: deviceById.get(t.deviceRegistryId)?.device.currentProviderName ?? '',
        value: Number(t.numericValue), recordedAt: t.observedAt,
      }));

    const ruleAvailability = evaluateRuleAvailability(taggedRoleSet, false);

    const sensorCoverage = HVAC_RELEVANT_ROLES.map((role) => {
      const devs = hvacSensors.filter((s) => s.assignment.sensorRole === role);
      return { role, label: SENSOR_ROLE_META[role].label, connected: devs.length > 0, deviceNames: devs.map((s) => s.device.currentProviderName ?? '') };
    });

    const activeFindings = findings.filter((f) => f.status === FindingStatus.ACTIVE);

    return {
      findings: findings.map((f) => this.analyticsEngine.toFindingDto(f)),
      series,
      ruleAvailability,
      sensorCoverage,
      componentHealth: this.componentHealthService.computeComponentHealth(taggedRoleSet, activeFindings),
    };
  }
}
