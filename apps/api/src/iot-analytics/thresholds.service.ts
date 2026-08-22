import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AnalyticsThreshold } from './entities/analytics-threshold.entity';
import { THRESHOLD_DEFINITIONS } from './threshold-definitions';

export interface ThresholdAdminRow {
  key: string;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  platformValue: number;
  customerValue: number | null;
  ruleIds: string[];
}

const CACHE_TTL_MS = 60_000;

// Every numeric threshold an analytics rule evaluates against is resolved
// through here — never a literal inside the rule's own evaluation code
// (see analytics-engine.service.ts). Resolution order: per-customer
// override > platform-wide value (both DB-backed) > THRESHOLD_DEFINITIONS'
// defaultValue (only ever reached before the platform row is seeded).
@Injectable()
export class ThresholdsService implements OnModuleInit {
  private readonly logger = new Logger(ThresholdsService.name);
  private readonly cache = new Map<string, { value: number; expiresAt: number }>();

  constructor(@InjectRepository(AnalyticsThreshold) private repo: Repository<AnalyticsThreshold>) {}

  // Idempotent — same pattern as ClassificationService's seed-on-boot, so
  // a fresh environment always has a real platform row for every known
  // threshold key without a manual migration/data script.
  async onModuleInit(): Promise<void> {
    for (const def of THRESHOLD_DEFINITIONS) {
      const existing = await this.repo.findOne({ where: { key: def.key, customerId: IsNull() } });
      if (!existing) {
        await this.repo.save(this.repo.create({ key: def.key, customerId: null, value: def.defaultValue }));
        this.logger.log(`Seeded platform analytics threshold ${def.key} = ${def.defaultValue}`);
      }
    }
  }

  // ── Read path — used by AnalyticsEngineService during rule evaluation ──

  async getValue(key: string, customerId?: string | null): Promise<number> {
    const def = THRESHOLD_DEFINITIONS.find((d) => d.key === key);
    if (!def) throw new Error(`Unknown analytics threshold key: ${key}`);

    if (customerId) {
      const cached = this.readCache(key, customerId);
      if (cached != null) return cached;
      const custom = await this.repo.findOne({ where: { key, customerId } });
      if (custom) {
        this.writeCache(key, customerId, custom.value);
        return custom.value;
      }
    }

    const cachedPlatform = this.readCache(key, null);
    if (cachedPlatform != null) return cachedPlatform;
    const platform = await this.repo.findOne({ where: { key, customerId: IsNull() } });
    const value = platform?.value ?? def.defaultValue;
    this.writeCache(key, null, value);
    return value;
  }

  private cacheKey(key: string, customerId: string | null): string {
    return `${key}:${customerId ?? 'PLATFORM'}`;
  }
  private readCache(key: string, customerId: string | null): number | null {
    const entry = this.cache.get(this.cacheKey(key, customerId));
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.value;
  }
  private writeCache(key: string, customerId: string | null, value: number): void {
    this.cache.set(this.cacheKey(key, customerId), { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  private invalidate(key: string, customerId: string | null): void {
    this.cache.delete(this.cacheKey(key, customerId));
  }

  // ── Admin read/write ──

  async getCatalogForAdmin(customerId?: string): Promise<ThresholdAdminRow[]> {
    const platformRows = await this.repo.find({ where: { customerId: IsNull() } });
    const platformByKey = new Map(platformRows.map((r) => [r.key, r.value]));

    let customerByKey = new Map<string, number>();
    if (customerId) {
      const customerRows = await this.repo.find({ where: { customerId } });
      customerByKey = new Map(customerRows.map((r) => [r.key, r.value]));
    }

    return THRESHOLD_DEFINITIONS.map((def) => ({
      key: def.key, label: def.label, description: def.description, unit: def.unit,
      min: def.min, max: def.max, defaultValue: def.defaultValue,
      platformValue: platformByKey.get(def.key) ?? def.defaultValue,
      customerValue: customerId ? customerByKey.get(def.key) ?? null : null,
      ruleIds: def.ruleIds,
    }));
  }

  async setPlatformValue(key: string, value: number): Promise<void> {
    this.validate(key, value);
    await this.upsert(key, null, value);
    this.invalidate(key, null);
  }

  async setCustomerValue(key: string, customerId: string, value: number): Promise<void> {
    this.validate(key, value);
    await this.upsert(key, customerId, value);
    this.invalidate(key, customerId);
  }

  async clearCustomerValue(key: string, customerId: string): Promise<void> {
    await this.repo.delete({ key, customerId });
    this.invalidate(key, customerId);
  }

  private validate(key: string, value: number): void {
    const def = THRESHOLD_DEFINITIONS.find((d) => d.key === key);
    if (!def) throw new BadRequestException(`Unknown analytics threshold key: ${key}`);
    if (typeof value !== 'number' || Number.isNaN(value)) throw new BadRequestException(`${def.label} must be a number`);
    if (value < def.min || value > def.max) throw new BadRequestException(`${def.label} must be between ${def.min} and ${def.max} ${def.unit}`);
  }

  private async upsert(key: string, customerId: string | null, value: number): Promise<void> {
    const where = customerId ? { key, customerId } : { key, customerId: IsNull() };
    const existing = await this.repo.findOne({ where });
    if (existing) {
      existing.value = value;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ key, customerId, value }));
    }
  }
}
