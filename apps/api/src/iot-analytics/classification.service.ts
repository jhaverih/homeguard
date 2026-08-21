import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorClassificationRule } from './entities/sensor-classification-rule.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { ClassificationStatus, EquipmentType } from '../common/enums/sensor-role.enum';
import { CLASSIFICATION_SEED, equipmentCodeFor } from './classification-seed';

type MatchType = 'EXACT' | 'NORMALIZED' | 'ALIAS' | 'FUZZY';
interface ClassificationMatch { rule: SensorClassificationRule; confidence: number; matchType: MatchType }

// Runs the 4-priority classification pipeline (spec section 9) whenever
// DeviceRegistryService sees a device that has no SensorAssignment yet:
// exact name → normalized name → alias → confidence-scored fuzzy match,
// with an explicit confidence gate (>=0.95 auto-assign, 0.80-0.949 assign
// but flag for confirmation, <0.80 leave unclassified) and a capability
// check that downgrades any match against an implausible device type.
// Runs ONCE per device — like the tagging engine it replaces, renaming the
// device in the Yolink app afterward never retriggers this (identity/
// classification hang off deviceRegistryId, never the live name).
@Injectable()
export class ClassificationService implements OnModuleInit {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    @InjectRepository(SensorClassificationRule) private rulesRepo: Repository<SensorClassificationRule>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
  ) {}

  async onModuleInit() {
    for (const row of CLASSIFICATION_SEED) {
      const existing = await this.rulesRepo.findOne({ where: { canonicalName: row.canonicalName } });
      if (!existing) await this.rulesRepo.save(this.rulesRepo.create(row));
    }
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }

  private similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - this.levenshtein(a, b) / maxLen;
  }

  private normalize(name: string): string {
    return name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }

  private findBestMatch(deviceName: string, rules: SensorClassificationRule[]): ClassificationMatch | null {
    const normDevice = this.normalize(deviceName);
    let best: ClassificationMatch | null = null;
    for (const rule of rules) {
      const variants: { text: string; isAlias: boolean }[] = [
        { text: rule.canonicalName, isAlias: false },
        ...rule.aliases.map((a) => ({ text: a, isAlias: true })),
      ];
      for (const v of variants) {
        let match: ClassificationMatch;
        if (deviceName === v.text) {
          match = { rule, confidence: 1, matchType: v.isAlias ? 'ALIAS' : 'EXACT' };
        } else if (normDevice === this.normalize(v.text)) {
          match = { rule, confidence: 1, matchType: v.isAlias ? 'ALIAS' : 'NORMALIZED' };
        } else {
          match = { rule, confidence: this.similarity(normDevice, this.normalize(v.text)), matchType: 'FUZZY' };
        }
        if (!best || match.confidence > best.confidence) best = match;
      }
    }
    return best;
  }

  async ensureEquipment(homeId: string, equipmentType: EquipmentType, equipmentNumber: string): Promise<string> {
    const equipmentCode = equipmentCodeFor(equipmentType, equipmentNumber);
    const existing = await this.equipmentRepo.findOne({ where: { homeId, equipmentCode } });
    if (existing) return existing.id;
    const saved = await this.equipmentRepo.save(this.equipmentRepo.create({
      homeId, equipmentType, equipmentNumber, equipmentCode, displayName: null, metadata: null,
    }));
    return saved.id;
  }

  // Called by DeviceRegistryService right after a device row is
  // created/upserted. A no-op if the device already carries a
  // SensorAssignment — classification never runs twice for the same
  // physical device.
  async classifyAndAssign(device: DeviceRegistry): Promise<void> {
    const existing = await this.assignmentsRepo.findOne({ where: { deviceRegistryId: device.id } });
    if (existing) return;
    if (!device.currentProviderName) return;

    const rules = await this.rulesRepo.find({ where: { isActive: true } });
    const match = this.findBestMatch(device.currentProviderName, rules);
    if (!match) return;

    let confidence = match.confidence;
    let status: ClassificationStatus;
    if (match.matchType === 'FUZZY') {
      if (confidence < 0.8) {
        this.logger.log(`No confident classification for "${device.currentProviderName}" (best match "${match.rule.canonicalName}" @ ${confidence.toFixed(2)}) — left unclassified.`);
        return;
      }
      status = confidence >= 0.95 ? ClassificationStatus.AUTO_CONFIRMED : ClassificationStatus.NEEDS_CONFIRMATION;
    } else {
      status = ClassificationStatus.AUTO_CONFIRMED;
    }

    // Capability validation — never assign a sensor role to a device type
    // that can't plausibly expose it, even on a name-exact match (e.g. a
    // rule renamed and re-installed on the wrong physical sensor type).
    const expected = match.rule.expectedProviderDeviceTypes;
    if (expected.length > 0 && device.providerDeviceType && !expected.includes(device.providerDeviceType)) {
      status = ClassificationStatus.NEEDS_CONFIRMATION;
      confidence = Math.min(confidence, 0.94);
      this.logger.warn(`"${device.currentProviderName}" (${device.providerDeviceType}) matched sensor role ${match.rule.sensorRole} by name, but that role expects [${expected.join(', ')}] — flagged for confirmation instead of auto-assigning.`);
    }

    const equipmentId = await this.ensureEquipment(device.homeId, match.rule.equipmentType, match.rule.equipmentNumber);
    await this.assignmentsRepo.save(this.assignmentsRepo.create({
      deviceRegistryId: device.id, equipmentId, sensorRole: match.rule.sensorRole, analyticsRole: match.rule.analyticsRole,
      measurementType: match.rule.measurementType, classificationConfidence: confidence, classificationStatus: status,
    }));
    this.logger.log(`Classified "${device.currentProviderName}" (${device.id}) as ${match.rule.sensorRole} [${status}, confidence ${confidence.toFixed(2)}, match ${match.matchType}]`);
  }
}
