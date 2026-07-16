export enum UnitLabel {
  HOUR = 'HOUR',
  SQ_FT = 'SQ_FT',
  BULB = 'BULB',
  SERVICE_TRIP = 'SERVICE_TRIP',
  AC_UNIT = 'AC_UNIT',
  HOLE = 'HOLE',
  LINEAR_FEET = 'LINEAR_FEET',
  UNIT = 'UNIT',
  NONE = 'NONE',
}

export const UNIT_LABEL_META: Record<UnitLabel, { label: string }> = {
  [UnitLabel.HOUR]: { label: 'Hour' },
  [UnitLabel.SQ_FT]: { label: 'SqFt' },
  [UnitLabel.BULB]: { label: 'Bulb' },
  [UnitLabel.SERVICE_TRIP]: { label: 'Service Trip' },
  [UnitLabel.AC_UNIT]: { label: 'AC Unit' },
  [UnitLabel.HOLE]: { label: 'Hole' },
  [UnitLabel.LINEAR_FEET]: { label: 'Linear Feet' },
  [UnitLabel.UNIT]: { label: 'Unit' },
  [UnitLabel.NONE]: { label: 'None' },
};
