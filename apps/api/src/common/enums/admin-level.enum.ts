export enum AdminLevel {
  SUPER_USER = 'SUPER_USER',
  ADMIN = 'ADMIN',
  VIEW_ONLY = 'VIEW_ONLY',
}

export const ADMIN_LEVEL_RANK: Record<AdminLevel, number> = {
  [AdminLevel.SUPER_USER]: 3,
  [AdminLevel.ADMIN]: 2,
  [AdminLevel.VIEW_ONLY]: 1,
};
