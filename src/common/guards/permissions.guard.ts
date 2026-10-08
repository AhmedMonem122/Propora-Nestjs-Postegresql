import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../rbac/rbac.service.js';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '../decorators/require-permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Platform admins operate above tenancy: full access, no org roles needed.
    if (user?.isPlatformAdmin && user?.platformAdminId) {
      return true;
    }

    if (!user?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const mode = this.reflector.getAllAndOverride<string>(PERMISSIONS_MODE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const granted = await this.rbacService.getUserPermissions(user.userId);
    const missing = requiredPermissions.filter((permission) => !granted.has(permission));

    const denied =
      mode === 'any' ? missing.length === requiredPermissions.length : missing.length > 0;

    if (denied) {
      throw new ForbiddenException(
        `Access denied. Missing required permission(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
