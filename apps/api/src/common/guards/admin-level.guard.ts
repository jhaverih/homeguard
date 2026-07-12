import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_LEVEL_RANK, AdminLevel } from '../enums/admin-level.enum';
import { MIN_ADMIN_LEVEL_KEY } from '../decorators/min-admin-level.decorator';

@Injectable()
export class AdminLevelGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredLevel = this.reflector.getAllAndOverride<AdminLevel>(MIN_ADMIN_LEVEL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredLevel) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.adminLevel) return false;
    return ADMIN_LEVEL_RANK[user.adminLevel as AdminLevel] >= ADMIN_LEVEL_RANK[requiredLevel];
  }
}
