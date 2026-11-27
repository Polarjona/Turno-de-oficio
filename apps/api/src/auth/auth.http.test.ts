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

/** Token con el claim `abogado_id`, como el que emite el realm real. */
const claimsConAbogado = (
  abogadoId: string,
  ...roles: string[]
): TokenKeycloak & { exp: number } => ({
  ...claims(...roles),
  abogado_id: abogadoId,
});

const ABOGADO_DEMO = '00000000-0000-4000-8000-000000000201';

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
    // Estos tests corren contra el repositorio en memoria aunque haya una base
    // de datos configurada (la CI la define para los tests de integración).
    delete process.env.DATABASE_URL;

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

  it('un letrado lee sus guardias y /me devuelve los datos de su token', async () => {
    const cabeceras = {
      authorization: `Bearer ${token(claimsConAbogado(ABOGADO_DEMO, 'letrado'))}`,
    };
    expect((await pedir('/guardias', cabeceras)).status).toBe(200);

    const yo = await pedir('/me', cabeceras);
    expect(yo.status).toBe(200);
    expect(await yo.json()).toMatchObject({ rol: 'letrado', colegiado: 'ICAT-0101' });
  });

  it('403 si el token del letrado no identifica a su abogado', async () => {
    // Antes se dejaba pasar y el letrado veía las guardias de todos.
    expect((await pedir('/guardias', conToken('letrado'))).status).toBe(403);
  });

  it('401 con la firma manipulada', async () => {
    const roto = `${token(claims('coordinacion')).slice(0, -4)}aaaa`;
    expect((await pedir('/guardias', { authorization: `Bearer ${roto}` })).status).toBe(401);
  });

  it('401 con un token sin rol del Turno de Oficio', async () => {
    const sinRol = token({ ...claims(), realm_access: { roles: ['offline_access'] } });
    expect((await pedir('/guardias', { authorization: `Bearer ${sinRol}` })).status).toBe(401);
  });

  describe('GET /guardias', () => {
    it('devuelve una página con data y page', async () => {
      const respuesta = await pedir('/guardias', conToken('coordinacion'));
      expect(respuesta.status).toBe(200);

      const pagina = (await respuesta.json()) as {
        data: { fecha: string }[];
        page: { has_more: boolean; size: number; next_cursor: string | null };
      };
      expect(pagina.data.length).toBeGreaterThan(0);
      expect(pagina.page).toMatchObject({ has_more: false, size: pagina.data.length });
    });

    it('aplica desde, estado y orden', async () => {
      const respuesta = await pedir(
        '/guardias?desde=2026-12-01&estado=publicada&estado=propuesta&orden=fecha_desc',
        conToken('coordinacion'),
      );
      expect(respuesta.status).toBe(200);

      const pagina = (await respuesta.json()) as { data: { fecha: string }[] };
      expect(pagina.data).toHaveLength(1);
      expect(pagina.data[0]!.fecha).toBe('2026-12-01');
    });

    it('filtra por especialidad, tipo y descubiertas', async () => {
      const especialidad = '00000000-0000-4000-8000-000000000401';
      const tipo = '00000000-0000-4000-8000-000000000301';

      const porEspecialidad = await pedir(
        `/guardias?especialidad_id=${especialidad}&tipo_guardia_id=${tipo}`,
        conToken('coordinacion'),
      );
      expect(porEspecialidad.status).toBe(200);
      expect(((await porEspecialidad.json()) as { data: unknown[] }).data).toHaveLength(2);

      const descubiertas = await pedir(
        '/guardias?solo_descubiertas=true',
        conToken('coordinacion'),
      );
      expect(((await descubiertas.json()) as { data: unknown[] }).data).toHaveLength(0);

      const detenido = await pedir('/guardias?solo_detenido=true', conToken('coordinacion'));
      expect(((await detenido.json()) as { data: unknown[] }).data).toHaveLength(0);
    });

    it('pagina con limit y expone X-Total-Estimado', async () => {
      const respuesta = await pedir('/guardias?limit=1', conToken('coordinacion'));
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('x-total-estimado')).toBe('2');

      const pagina = (await respuesta.json()) as {
        data: unknown[];
        page: { has_more: boolean };
      };
      expect(pagina.data).toHaveLength(1);
      expect(pagina.page.has_more).toBe(true);
    });

    it('un letrado solo ve sus propias guardias', async () => {
      const cabeceras = {
        authorization: `Bearer ${token(claimsConAbogado(ABOGADO_DEMO, 'letrado'))}`,
      };
      const respuesta = await pedir('/guardias', cabeceras);
      expect(respuesta.status).toBe(200);

      const pagina = (await respuesta.json()) as { data: { abogado_id: string | null }[] };
      expect(pagina.data).toHaveLength(1);
      expect(pagina.data.every((guardia) => guardia.abogado_id === ABOGADO_DEMO)).toBe(true);
    });

    it('403 si un letrado pide las guardias de otro abogado', async () => {
      const cabeceras = {
        authorization: `Bearer ${token(claimsConAbogado(ABOGADO_DEMO, 'letrado'))}`,
      };
      const respuesta = await pedir(
        '/guardias?abogado_id=00000000-0000-4000-8000-000000000999',
        cabeceras,
      );
      expect(respuesta.status).toBe(403);
    });

    it('400 con un filtro mal formado', async () => {
      expect((await pedir('/guardias?desde=03/12/2026', conToken('coordinacion'))).status).toBe(
        400,
      );
      expect((await pedir('/guardias?orden=reciente', conToken('coordinacion'))).status).toBe(400);
      expect((await pedir('/guardias?cursor=basura', conToken('coordinacion'))).status).toBe(400);
    });

    it('el detalle devuelve el ETag de la versión', async () => {
      const lista = (await (await pedir('/guardias', conToken('coordinacion'))).json()) as {
        data: { id: string; version: number }[];
      };
      const primera = lista.data[0]!;

      const detalle = await pedir(`/guardias/${primera.id}`, conToken('coordinacion'));
      expect(detalle.status).toBe(200);
      expect(detalle.headers.get('etag')).toBe(`"${primera.version}"`);
    });
  });

  describe('POST /guardias', () => {
    const cuerpo = (fecha: string) => ({
      tipo_guardia_id: '00000000-0000-4000-8000-000000000301',
      especialidad_id: '00000000-0000-4000-8000-000000000401',
      fecha,
      hora_inicio: '09:00',
      hora_fin: '20:00',
    });

    const crear = (fecha: string, ...roles: string[]): Promise<Response> =>
      fetch(`${base}/guardias`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...conToken(...roles) },
        body: JSON.stringify(cuerpo(fecha)),
      });

    it('201 con coordinación, en estado planificada y con Location', async () => {
      const respuesta = await crear('2026-12-03', 'coordinacion');
      expect(respuesta.status).toBe(201);

      const guardia = (await respuesta.json()) as { id: string; estado: string; abogado_id: null };
      expect(guardia).toMatchObject({ estado: 'planificada', abogado_id: null });
      expect(respuesta.headers.get('location')).toBe(`/guardias/${guardia.id}`);
    });

    it('201 también para admin', async () => {
      expect((await crear('2026-12-07', 'admin')).status).toBe(201);
    });

    it('403 si lo intenta un letrado', async () => {
      expect((await crear('2026-12-08', 'letrado')).status).toBe(403);
    });

    it('401 sin token', async () => {
      const respuesta = await fetch(`${base}/guardias`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo('2026-12-09')),
      });
      expect(respuesta.status).toBe(401);
    });

    it('400 si el cuerpo no cumple el contrato', async () => {
      const respuesta = await fetch(`${base}/guardias`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...conToken('coordinacion') },
        body: JSON.stringify({ ...cuerpo('2026-12-10'), hora_inicio: '25:00' }),
      });
      expect(respuesta.status).toBe(400);
    });

    it('409 si la franja ya existe', async () => {
      expect((await crear('2026-12-11', 'coordinacion')).status).toBe(201);
      expect((await crear('2026-12-11', 'coordinacion')).status).toBe(409);
    });

    it('con la misma Idempotency-Key devuelve la misma guardia', async () => {
      const enviar = (): Promise<Response> =>
        fetch(`${base}/guardias`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'reintento-de-prueba-0001',
            ...conToken('coordinacion'),
          },
          body: JSON.stringify(cuerpo('2026-12-12')),
        });

      const primera = (await (await enviar()).json()) as { id: string };
      const segunda = (await (await enviar()).json()) as { id: string };
      expect(segunda.id).toBe(primera.id);
    });
  });
});
