import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { UsuarioAutenticado } from './auth.types';

/** Inyecta el usuario que dejó el guard de sesión en la petición. */
export const UsuarioActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const peticion = contexto.switchToHttp().getRequest<{ user: UsuarioAutenticado }>();
    return peticion.user;
  },
);
