/**
 * Cadena completa por HTTP: guard de sesión (401) y guard de rol (403).
 *
 * No hace falta un Keycloak levantado: en el módulo de prueba la estrategia real
 * (JWKS) se sustituye por una que firma con HS256, y el token se construye aquí
 * con los mismos claims que emite Keycloak.
 *
 * Vitest 5 (Vite 8 con Oxc) no transforma la sintaxis `@decorador` en los ficheros
 * de prueba: los decoradores de abajo se aplican llamándolos como funciones, que
 * es lo que hacen por dentro (guardar metadatos con Reflect).
 */
import { createHmac } from 'node:crypto';

import { Controller, Get, Injectable, type INestApplication, type Type } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { usuarioDesdeToken, type TokenKeycloak, type UsuarioAutenticado } from './auth.types';
import { JwtStrategy } from './jwt.strategy';
import { Roles } from './roles.decorator';

const SECRETO = 'secreto-solo-para-pruebas';

function token(payload: object): string {
  const base64 = (valor: object): string =>
    Buffer.from(JSON.stringify(valor)).toString('base64url');
  const cabecera = base64({ alg: 'HS256', typ: 'JWT' });
  const cuerpo = base64(payload);
  const firma = createHmac('sha256', SECRETO).update(`${cabecera}.${cuerpo}`).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

function claims(...roles: string[]): TokenKeycloak & { exp: number } {
  return {
    sub: '00000000-0000-4000-8000-000000000001',
    preferred_username: 'quien.sea',
    name: 'Quien Sea',
    colegiado: 'ICAT-0101',
    // Keycloak mete también los roles por defecto del realm.
    realm_access: { roles: ['offline_access', 'uma_authorization', ...roles] },
    exp: Math.floor(Date.now() / 1000) + 300,
  };
}

class EstrategiaDePrueba extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: SECRETO,
      ignoreExpiration: false,
      algorithms: ['HS256'],
    });
  }

  validate(payload: TokenKeycloak): UsuarioAutenticado {
    return usuarioDesdeToken(payload);
  }
}
Injectable()(EstrategiaDePrueba);

/** Ruta de coordinación que solo existe dentro de la prueba. */
class RutaDeCoordinacion {
  resumen(): { ok: boolean } {
    return { ok: true };
  }
}
const descriptor = Object.getOwnPropertyDescriptor(
  RutaDeCoordinacion.prototype,
  'resumen',
) as PropertyDescriptor;
Controller('_prueba')(RutaDeCoordinacion);
Get('coordinacion')(RutaDeCoordinacion.prototype, 'resumen', descriptor);
Roles('coordinacion', 'admin')(RutaDeCoordinacion.prototype, 'resumen', descriptor);

describe('Autenticación por HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RutaDeCoordinacion as unknown as Type<unknown>],
    })
      .overrideProvider(JwtStrategy)
      .useClass(EstrategiaDePrueba)
      .compile();

    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  const pedir = async (ruta: string, cabeceras: Record<string, string> = {}) =>
    fetch(`${base}${ruta}`, { headers: cabeceras });

  const conToken = (...roles: string[]): Record<string, string> => ({
    authorization: `Bearer ${token(claims(...roles))}`,
  });

  it('401 sin token', async () => {
    expect((await pedir('/guardias')).status).toBe(401);
    expect((await pedir('/_prueba/coordinacion')).status).toBe(401);
    expect((await pedir('/me')).status).toBe(401);
  });

  it('403 si un letrado llama a una ruta de coordinación', async () => {
    const respuesta = await pedir('/_prueba/coordinacion', conToken('letrado'));
    expect(respuesta.status).toBe(403);
  });

  it('200 si coordinación llama a su ruta', async () => {
    const respuesta = await pedir('/_prueba/coordinacion', conToken('coordinacion'));
    expect(respuesta.status).toBe(200);
  });

  it('un letrado lee las guardias y /me devuelve los datos de su token', async () => {
    const cabeceras = conToken('letrado');
    expect((await pedir('/guardias', cabeceras)).status).toBe(200);

    const yo = await pedir('/me', cabeceras);
    expect(yo.status).toBe(200);
    expect(await yo.json()).toMatchObject({ rol: 'letrado', colegiado: 'ICAT-0101' });
  });

  it('401 con la firma manipulada', async () => {
    const roto = `${token(claims('coordinacion')).slice(0, -4)}aaaa`;
    expect((await pedir('/guardias', { authorization: `Bearer ${roto}` })).status).toBe(401);
  });

  it('401 con un token sin rol del Turno de Oficio', async () => {
    const sinRol = token({ ...claims(), realm_access: { roles: ['offline_access'] } });
    expect((await pedir('/guardias', { authorization: `Bearer ${sinRol}` })).status).toBe(401);
  });
});
