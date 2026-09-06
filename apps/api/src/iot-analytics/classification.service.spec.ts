import { ClassificationService } from './classification.service';
import { SensorClassificationRule } from './entities/sensor-classification-rule.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { DeviceRegistry, DeviceRegistryStatus } from './entities/device-registry.entity';
import { ClassificationStatus, EquipmentType, MeasurementType, SensorRole } from '../common/enums/sensor-role.enum';

// Lightweight fake repositories — ClassificationService only ever calls
// find/findOne/create/save on its three injected repos, so a plain object
// implementing just those (backed by an in-memory array) is a real unit
// test of the classification logic without needing TypeORM, a database, or
// @nestjs/testing's module-bootstrapping ceremony.
function fakeRepo<T extends { id?: string }>(seed: T[] = []) {
  const rows = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => {
      if (!opts?.where) return rows;
      return rows.filter((r: any) => Object.entries(opts.where).every(([k, v]) => r[k] === v));
    }),
    findOne: jest.fn(async (opts?: any) => {
      if (!opts?.where) return rows[0] ?? null;
      return rows.find((r: any) => Object.entries(opts.where).every(([k, v]) => r[k] === v)) ?? null;
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      const withId = { id: data.id ?? `generated-${rows.length + 1}`, ...data };
      rows.push(withId);
      return withId;
    }),
  };
}

function makeRule(overrides: Partial<SensorClassificationRule>): SensorClassificationRule {
  return {
    id: 'rule-1', canonicalName: 'ATV HVAC Drain Pan', aliases: [], expectedProviderDeviceTypes: [],
    equipmentType: EquipmentType.HVAC, equipmentNumber: '01', sensorRole: SensorRole.HVAC_DRAIN_WATER,
    analyticsRole: 'HVAC_CONDENSATE', measurementType: MeasurementType.WATER, analyticsRuleGroups: ['HVAC_WATER'],
    isActive: true, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as SensorClassificationRule;
}

function makeDevice(overrides: Partial<DeviceRegistry>): DeviceRegistry {
  return {
    id: 'device-1', homeId: 'home-1', provider: 'yolink', providerDeviceId: 'eui-1',
    providerDeviceType: 'LeakSensor', providerModel: null, currentProviderName: 'ATV HVAC Drain Pan',
    currentProviderRoom: null, firstSeenAt: new Date(), lastSeenAt: new Date(),
    status: DeviceRegistryStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as DeviceRegistry;
}

describe('ClassificationService.classifyAndAssign', () => {
  let rulesRepo: ReturnType<typeof fakeRepo<SensorClassificationRule>>;
  let assignmentsRepo: ReturnType<typeof fakeRepo<SensorAssignment>>;
  let equipmentRepo: ReturnType<typeof fakeRepo<Equipment>>;
  let service: ClassificationService;

  beforeEach(() => {
    rulesRepo = fakeRepo<SensorClassificationRule>([makeRule({})]);
    assignmentsRepo = fakeRepo<SensorAssignment>([]);
    equipmentRepo = fakeRepo<Equipment>([]);
    service = new ClassificationService(rulesRepo as any, assignmentsRepo as any, equipmentRepo as any);
  });

  it('auto-confirms an exact name match at confidence 1.0', async () => {
    const device = makeDevice({ currentProviderName: 'ATV HVAC Drain Pan' });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).toHaveBeenCalledTimes(1);
    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.sensorRole).toBe(SensorRole.HVAC_DRAIN_WATER);
    expect(saved.classificationConfidence).toBe(1);
    expect(saved.classificationStatus).toBe(ClassificationStatus.AUTO_CONFIRMED);
  });

  it('auto-confirms a normalized match (different case/spacing/punctuation) at confidence 1.0', async () => {
    const device = makeDevice({ currentProviderName: '  atv   hvac drain pan!! ' });
    await service.classifyAndAssign(device);

    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.classificationConfidence).toBe(1);
    expect(saved.classificationStatus).toBe(ClassificationStatus.AUTO_CONFIRMED);
  });

  it('auto-confirms an alias match at confidence 1.0', async () => {
    rulesRepo = fakeRepo<SensorClassificationRule>([makeRule({ aliases: ['ATV HVAC Condensate Pan'] })]);
    service = new ClassificationService(rulesRepo as any, assignmentsRepo as any, equipmentRepo as any);
    const device = makeDevice({ currentProviderName: 'ATV HVAC Condensate Pan' });
    await service.classifyAndAssign(device);

    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.classificationConfidence).toBe(1);
    expect(saved.classificationStatus).toBe(ClassificationStatus.AUTO_CONFIRMED);
  });

  it('auto-confirms a near-exact fuzzy match (>= 0.95 similarity)', async () => {
    // 31-char canonical name, 1-character typo -> similarity = 1 - 1/31 ≈
    // 0.967, above the 0.95 gate. (Verified against the actual Levenshtein
    // implementation, not hand-computed — multi-word edit distances are
    // easy to get wrong by eye.)
    rulesRepo = fakeRepo<SensorClassificationRule>([makeRule({ canonicalName: 'ATV HVAC Drain Pan Sensor Unit' })]);
    service = new ClassificationService(rulesRepo as any, assignmentsRepo as any, equipmentRepo as any);
    const device = makeDevice({ currentProviderName: 'ATV HVAC Drain Pan Sensor Unix' });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).toHaveBeenCalledTimes(1);
    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.classificationStatus).toBe(ClassificationStatus.AUTO_CONFIRMED);
    expect(saved.classificationConfidence).toBeGreaterThanOrEqual(0.95);
    expect(saved.classificationConfidence).toBeLessThan(1);
  });

  it('flags a mid-confidence fuzzy match (0.80-0.949) for confirmation instead of auto-assigning', async () => {
    // 1-character typo against the 18-char default canonical name ->
    // similarity ≈ 0.944 — similar enough to be the best guess, not
    // similar enough to trust blindly.
    const device = makeDevice({ currentProviderName: 'ATV HVAC Drain Pab' });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).toHaveBeenCalledTimes(1);
    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.classificationStatus).toBe(ClassificationStatus.NEEDS_CONFIRMATION);
    expect(saved.classificationConfidence).toBeGreaterThanOrEqual(0.8);
    expect(saved.classificationConfidence).toBeLessThan(0.95);
  });

  it('leaves a device completely unclassified when the best match is below 0.80 similarity', async () => {
    const device = makeDevice({ currentProviderName: 'Living Room Thermostat' });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).not.toHaveBeenCalled();
  });

  it('downgrades even an exact name match to NEEDS_CONFIRMATION when the device type cannot plausibly expose that role', async () => {
    rulesRepo = fakeRepo<SensorClassificationRule>([makeRule({ expectedProviderDeviceTypes: ['LeakSensor'] })]);
    service = new ClassificationService(rulesRepo as any, assignmentsRepo as any, equipmentRepo as any);
    // Exact name match, but this device is a THSensor — physically can't detect water.
    const device = makeDevice({ currentProviderName: 'ATV HVAC Drain Pan', providerDeviceType: 'THSensor' });
    await service.classifyAndAssign(device);

    const saved = assignmentsRepo.rows[0] as any;
    expect(saved.classificationStatus).toBe(ClassificationStatus.NEEDS_CONFIRMATION);
    expect(saved.classificationConfidence).toBeLessThanOrEqual(0.94);
  });

  it('never re-classifies a device that already has a sensor assignment', async () => {
    assignmentsRepo = fakeRepo<SensorAssignment>([{ id: 'existing', deviceRegistryId: 'device-1' } as any]);
    service = new ClassificationService(rulesRepo as any, assignmentsRepo as any, equipmentRepo as any);
    const device = makeDevice({ id: 'device-1', currentProviderName: 'ATV HVAC Drain Pan' });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).not.toHaveBeenCalled();
  });

  it('does nothing for a device with no provider name yet', async () => {
    const device = makeDevice({ currentProviderName: null });
    await service.classifyAndAssign(device);

    expect(assignmentsRepo.save).not.toHaveBeenCalled();
  });

  it('creates the equipment row (or reuses an existing one) via the correct equipment code', async () => {
    const device = makeDevice({ homeId: 'home-42', currentProviderName: 'ATV HVAC Drain Pan' });
    await service.classifyAndAssign(device);

    expect(equipmentRepo.save).toHaveBeenCalledTimes(1);
    const equipment = equipmentRepo.rows[0] as any;
    expect(equipment.equipmentCode).toBe('HVAC-01');
    expect(equipment.homeId).toBe('home-42');
  });
});
