import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@turno/shared';

export const ROLES_KEY = 'roles';

/**
 * Declara qué roles pueden llamar a una operación, igual que `x-roles` en el
 * contrato. Sin decorador, basta con estar autenticado.
 *
 *   @Roles('coordinacion', 'admin')
 *   @Post('guardias')
 *   crear() { ... }
 */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
