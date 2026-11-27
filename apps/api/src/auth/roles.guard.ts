import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@turno/shared';

import type { UsuarioAutenticado } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * Comprueba el rol en el servidor, nunca en el frontend. Se ejecuta después del
 * guard de sesión, así que `request.user` ya existe (401 si no).
 *
 * 403 cuando hay token válido pero el rol no está entre los declarados con @Roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requeridos || requeridos.length === 0) {
      return true;
    }

    const peticion = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    const roles = peticion.user?.roles ?? [];

    if (!requeridos.some((rol) => roles.includes(rol))) {
      throw new ForbiddenException(
        `Esta operación requiere uno de estos roles: ${requeridos.join(', ')}`,
      );
    }

    return true;
  }
}
