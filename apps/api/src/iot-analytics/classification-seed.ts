import { EquipmentType, SensorRole, MeasurementType } from '../common/enums/sensor-role.enum';

export interface ClassificationSeedRow {
  canonicalName: string;
  aliases: string[];
  expectedProviderDeviceTypes: string[];
  equipmentType: EquipmentType;
  equipmentNumber: string;
  sensorRole: SensorRole;
  analyticsRole: string;
  measurementType: MeasurementType;
  analyticsRuleGroups: string[];
}

// The Attenteve installer naming convention ("ATV [Equipment] [Location or
// Function]") mapped to the semantic model — centrally managed here per
// spec section 10, seeded into SensorClassificationRule at startup
// (ClassificationService.onModuleInit) and editable afterward without a
// code change. Today's live MVP set is the first 3 rows; the Return/Supply
// Air rows are the near-term next installs (not live yet, but the naming
// convention already accounts for them).
export const CLASSIFICATION_SEED: ClassificationSeedRow[] = [
  {
    canonicalName: 'ATV HVAC Drain Pan', aliases: ['ATV HVAC Condensate Pan', 'HVAC Drain Pan', 'ATV HVAC Basin Pan'],
    expectedProviderDeviceTypes: ['LeakSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_DRAIN_WATER, analyticsRole: 'HVAC_CONDENSATE', measurementType: MeasurementType.WATER,
    analyticsRuleGroups: ['HVAC_WATER'],
  },
  {
    canonicalName: 'ATV Washer Drain Pan', aliases: ['ATV Washing Machine Drain Pan', 'Washer Drain Pan', 'ATV Laundry Basin Pan'],
    expectedProviderDeviceTypes: ['LeakSensor'], equipmentType: EquipmentType.WASHER, equipmentNumber: '01',
    sensorRole: SensorRole.WASHER_DRAIN_WATER, analyticsRole: 'WASHER_LEAK', measurementType: MeasurementType.WATER,
    analyticsRuleGroups: ['WASHER_WATER'],
  },
  {
    canonicalName: 'ATV Indoor Temperature', aliases: ['ATV Indoor Climate', 'Indoor Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HOME, equipmentNumber: '01',
    sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, analyticsRole: 'INDOOR_CLIMATE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['INDOOR_CLIMATE'],
  },
  {
    canonicalName: 'ATV HVAC Return Air', aliases: ['ATV HVAC Return Air Temp', 'HVAC Return Air', 'ATV HVAC Return Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_RETURN_TEMP, analyticsRole: 'HVAC_RETURN_AIR_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['HVAC_PERFORMANCE'],
  },
  {
    canonicalName: 'ATV HVAC Supply Air', aliases: ['ATV HVAC Supply Air Temp', 'HVAC Supply Air', 'ATV HVAC Supply Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_SUPPLY_TEMP, analyticsRole: 'HVAC_SUPPLY_AIR_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['HVAC_PERFORMANCE'],
  },
  // ── Phase 2-5 sensors (not live yet) — seeded ahead of install per the
  // Attenteve naming-convention addendum, so each activates automatically
  // the moment it's installed and classified, with no code change needed. ──
  {
    canonicalName: 'ATV Outdoor Temperature', aliases: ['ATV HVAC Outdoor Temperature', 'Outdoor Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_OUTDOOR_TEMP, analyticsRole: 'HVAC_OUTDOOR_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['HVAC_PERFORMANCE'],
  },
  {
    canonicalName: 'ATV HVAC Power', aliases: ['HVAC Power'],
    expectedProviderDeviceTypes: ['PowerMeter', 'Outlet'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_POWER, analyticsRole: 'HVAC_ELECTRICAL_POWER', measurementType: MeasurementType.POWER,
    analyticsRuleGroups: ['HVAC_ELECTRICAL'],
  },
  {
    canonicalName: 'ATV HVAC Compressor Power', aliases: ['HVAC Compressor Power'],
    expectedProviderDeviceTypes: ['PowerMeter', 'Outlet'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_COMPRESSOR_POWER, analyticsRole: 'HVAC_COMPRESSOR_POWER', measurementType: MeasurementType.POWER,
    analyticsRuleGroups: ['HVAC_COMPRESSOR'],
  },
  {
    canonicalName: 'ATV HVAC Blower Power', aliases: ['HVAC Blower Power'],
    expectedProviderDeviceTypes: ['PowerMeter', 'Outlet'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_BLOWER_POWER, analyticsRole: 'HVAC_BLOWER_POWER', measurementType: MeasurementType.POWER,
    analyticsRuleGroups: ['HVAC_BLOWER'],
  },
  {
    canonicalName: 'ATV HVAC Suction Line Temperature', aliases: ['HVAC Suction Line Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_SUCTION_LINE_TEMP, analyticsRole: 'HVAC_SUCTION_LINE_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['HVAC_REFRIGERANT'],
  },
  {
    canonicalName: 'ATV HVAC Liquid Line Temperature', aliases: ['HVAC Liquid Line Temperature'],
    expectedProviderDeviceTypes: ['THSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_LIQUID_LINE_TEMP, analyticsRole: 'HVAC_LIQUID_LINE_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
    analyticsRuleGroups: ['HVAC_REFRIGERANT'],
  },
  {
    canonicalName: 'ATV HVAC Static Pressure', aliases: ['ATV HVAC Duct Static Pressure', 'HVAC Static Pressure'],
    expectedProviderDeviceTypes: ['PressureSensor'], equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    sensorRole: SensorRole.HVAC_STATIC_PRESSURE, analyticsRole: 'HVAC_STATIC_PRESSURE', measurementType: MeasurementType.PRESSURE,
    analyticsRuleGroups: ['HVAC_AIRFLOW'],
  },
];

// `HOME` equipment (whole-house sensors with no single physical appliance)
// uses the bare type as its code per your instruction — every other
// equipment type gets a numbered code (e.g. "HVAC-01").
export function equipmentCodeFor(equipmentType: EquipmentType, equipmentNumber: string): string {
  return equipmentType === EquipmentType.HOME ? 'HOME' : `${equipmentType}-${equipmentNumber}`;
}
