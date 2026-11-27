import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * Vitest 5 (Vite 8 con Oxc) no transforma la sintaxis `@decorador` en los ficheros
 * de prueba, así que aquí se aplican llamándolos como funciones: es exactamente lo
 * que hacen por dentro (guardar metadatos con Reflect).
 */
class RutaDeCoordinacion {
  resumen(): string {
    return 'ok';
  }
}

class RutaAbierta {
  listar(): string {
    return 'ok';
  }
}

const descriptor = (clase: object, metodo: string): PropertyDescriptor =>
  Object.getOwnPropertyDescriptor(clase, metodo) as PropertyDescriptor;

Roles('coordinacion', 'admin')(
  RutaDeCoordinacion.prototype,
  'resumen',
  descriptor(RutaDeCoordinacion.prototype, 'resumen'),
);

function contexto(manejador: () => unknown, clase: new () => unknown, roles?: string[]) {
  return {
    getHandler: () => manejador,
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const deCoordinacion = (roles: string[]): ExecutionContext =>
    contexto(RutaDeCoordinacion.prototype.resumen, RutaDeCoordinacion, roles);

  it('deja pasar a coordinación', () => {
    expect(guard.canActivate(deCoordinacion(['coordinacion']))).toBe(true);
  });

  it('deja pasar a admin', () => {
    expect(guard.canActivate(deCoordinacion(['admin']))).toBe(true);
  });

  it('devuelve 403 a un letrado', () => {
    expect(() => guard.canActivate(deCoordinacion(['letrado']))).toThrow(ForbiddenException);
  });

  it('devuelve 403 si el token no trae rol', () => {
    expect(() => guard.canActivate(deCoordinacion([]))).toThrow(ForbiddenException);
  });

  it('no limita las rutas sin @Roles', () => {
    const abierta = contexto(RutaAbierta.prototype.listar, RutaAbierta, ['letrado']);
    expect(guard.canActivate(abierta)).toBe(true);
  });
});
