// Full controlled sensor-role catalog — replaces the earlier HVAC-only
// enum. Provider-agnostic: nothing here is Yolink-specific, so a future
// Home Assistant/Zigbee/Matter/Z-Wave device gets tagged with the same
// roles. Grouped by equipment domain in the spec; kept as one flat enum
// since TypeORM enum columns don't nest, and nothing needs the grouping
// structurally (SensorClassificationRule.equipmentType carries that instead).
export enum SensorRole {
  // HVAC
  HVAC_DRAIN_WATER = 'HVAC_DRAIN_WATER',
  HVAC_RETURN_TEMP = 'HVAC_RETURN_TEMP',
  HVAC_SUPPLY_TEMP = 'HVAC_SUPPLY_TEMP',
  HVAC_RETURN_HUMIDITY = 'HVAC_RETURN_HUMIDITY',
  HVAC_SUPPLY_HUMIDITY = 'HVAC_SUPPLY_HUMIDITY',
  HVAC_EQUIPMENT_TEMP = 'HVAC_EQUIPMENT_TEMP',
  HVAC_POWER = 'HVAC_POWER',
  HVAC_STATE = 'HVAC_STATE',
  HVAC_THERMOSTAT_SETPOINT = 'HVAC_THERMOSTAT_SETPOINT',
  // Indoor climate (whole-home, not equipment-specific)
  INDOOR_AMBIENT_TEMP = 'INDOOR_AMBIENT_TEMP',
  INDOOR_AMBIENT_HUMIDITY = 'INDOOR_AMBIENT_HUMIDITY',
  // Washer
  WASHER_DRAIN_WATER = 'WASHER_DRAIN_WATER',
  WASHER_LEAK_WATER = 'WASHER_LEAK_WATER',
  // Water heater
  WATERHEATER_PAN_WATER = 'WATERHEATER_PAN_WATER',
  WATERHEATER_LEAK_WATER = 'WATERHEATER_LEAK_WATER',
  // Plumbing
  KITCHEN_SINK_WATER = 'KITCHEN_SINK_WATER',
  BATHROOM_SINK_WATER = 'BATHROOM_SINK_WATER',
  TOILET_WATER = 'TOILET_WATER',
  // Other
  SUMP_WATER = 'SUMP_WATER',
  FREEZER_TEMP = 'FREEZER_TEMP',
  FRIDGE_TEMP = 'FRIDGE_TEMP',
  GENERAL_LEAK = 'GENERAL_LEAK',
}

// Friendly labels for the (unchanged) mobile/admin UI, which just displays
// whatever label comes back — an installer-facing tagging UI would use the
// same map, not built this pass.
export const SENSOR_ROLE_META: Record<SensorRole, { label: string }> = {
  [SensorRole.HVAC_DRAIN_WATER]: { label: 'HVAC Drain Pan' },
  [SensorRole.HVAC_RETURN_TEMP]: { label: 'Return Air Temperature' },
  [SensorRole.HVAC_SUPPLY_TEMP]: { label: 'Supply Air Temperature' },
  [SensorRole.HVAC_RETURN_HUMIDITY]: { label: 'Return Air Humidity' },
  [SensorRole.HVAC_SUPPLY_HUMIDITY]: { label: 'Supply Air Humidity' },
  [SensorRole.HVAC_EQUIPMENT_TEMP]: { label: 'HVAC Equipment Temperature' },
  [SensorRole.HVAC_POWER]: { label: 'HVAC Power' },
  [SensorRole.HVAC_STATE]: { label: 'HVAC State' },
  [SensorRole.HVAC_THERMOSTAT_SETPOINT]: { label: 'Thermostat Setpoint' },
  [SensorRole.INDOOR_AMBIENT_TEMP]: { label: 'Indoor Temperature' },
  [SensorRole.INDOOR_AMBIENT_HUMIDITY]: { label: 'Indoor Humidity' },
  [SensorRole.WASHER_DRAIN_WATER]: { label: 'Washer Drain Pan' },
  [SensorRole.WASHER_LEAK_WATER]: { label: 'Washer Leak Sensor' },
  [SensorRole.WATERHEATER_PAN_WATER]: { label: 'Water Heater Pan' },
  [SensorRole.WATERHEATER_LEAK_WATER]: { label: 'Water Heater Leak Sensor' },
  [SensorRole.KITCHEN_SINK_WATER]: { label: 'Kitchen Sink Leak Sensor' },
  [SensorRole.BATHROOM_SINK_WATER]: { label: 'Bathroom Sink Leak Sensor' },
  [SensorRole.TOILET_WATER]: { label: 'Toilet Leak Sensor' },
  [SensorRole.SUMP_WATER]: { label: 'Sump Pump Leak Sensor' },
  [SensorRole.FREEZER_TEMP]: { label: 'Freezer Temperature' },
  [SensorRole.FRIDGE_TEMP]: { label: 'Refrigerator Temperature' },
  [SensorRole.GENERAL_LEAK]: { label: 'General Leak Sensor' },
};

export enum EquipmentType {
  HVAC = 'HVAC',
  WASHER = 'WASHER',
  WATERHEATER = 'WATERHEATER',
  SUMP = 'SUMP',
  FREEZER = 'FREEZER',
  FRIDGE = 'FRIDGE',
  PLUMBING = 'PLUMBING',
  // Pseudo-equipment for whole-home sensors (e.g. indoor temperature) that
  // aren't tied to one physical appliance — matches the spec's own MVP
  // table, which lists "HOME" as indoor temperature's equipment.
  HOME = 'HOME',
}

export enum MeasurementType {
  TEMPERATURE = 'TEMPERATURE',
  HUMIDITY = 'HUMIDITY',
  WATER = 'WATER',
  BATTERY = 'BATTERY',
  POWER = 'POWER',
  ENERGY = 'ENERGY',
  HVAC_STATE = 'HVAC_STATE',
  THERMOSTAT_SETPOINT = 'THERMOSTAT_SETPOINT',
}

export enum ClassificationStatus {
  AUTO_CONFIRMED = 'AUTO_CONFIRMED',
  NEEDS_CONFIRMATION = 'NEEDS_CONFIRMATION',
  MANUALLY_SET = 'MANUALLY_SET',
}
