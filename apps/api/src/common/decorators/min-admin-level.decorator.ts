import { SetMetadata } from '@nestjs/common';
import { AdminLevel } from '../enums/admin-level.enum';

export const MIN_ADMIN_LEVEL_KEY = 'minAdminLevel';
export const MinAdminLevel = (level: AdminLevel) => SetMetadata(MIN_ADMIN_LEVEL_KEY, level);
