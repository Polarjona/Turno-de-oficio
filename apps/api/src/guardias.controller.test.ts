import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { FiltrosGuardias } from '@turno/shared';
import { describe, expect, it } from 'vitest';

import type { UsuarioAutenticado } from './auth/auth.types';
import { GuardiasController, filtrosParaUsuario } from './guardias.controller';
import { MemoriaGuardiasRepository } from './guardias.repository';
import { GuardiasService } from './guardias.service';

const ESPECIALIDAD = '00000000-0000-4000-8000-000000000401';
const TIPO = '00000000-0000-4000-8000-000000000301';
const ABOGADO = '00000000-0000-4000-8000-000000000201';

const nueva = {
  tipo_guardia_id: TIPO,
  especialidad_id: ESPECIALIDAD,
  fecha: '2026-12-03',
  hora_inicio: '09:00',
  hora_fin: '20:00',
  es_detenido: false,
};

const respuesta = { setHeader: () => undefined };

const COORDINACION: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-000000000901',
  nombre: 'Coordinación de prueba',
  colegiado: 'ICAT-0001',
  abogadoId: '00000000-0000-4000-8000-000000000202',
  rol: 'coordinacion',
  roles: ['coordinacion'],
};

const LETRADO: UsuarioAutenticado = {
  ...COORDINACION,
  rol: 'letrado',
  roles: ['letrado'],
  abogadoId: ABOGADO,
  colegiado: 'ICAT-0101',
};

/** Lo que deja el ZodPipe cuando la query llega vacía. */
const QUERY_VACIA = {
  solo_descubiertas: false,
  solo_detenido: false,
  orden: 'fecha_asc' as const,
  limit: 20,
};

describe('GuardiasController', () => {
  const crearControlador = (): GuardiasController =>
    new GuardiasController(new GuardiasService(new MemoriaGuardiasRepository()));

  const listar = (
    controlador: GuardiasController,
    filtros: Partial<FiltrosGuardias> = {},
    usuario: UsuarioAutenticado = COORDINACION,
  ) => controlador.listar({ ...QUERY_VACIA, ...filtros }, usuario, respuesta);

  describe('GET /guardias', () => {
    it('devuelve una página con data y page', async () => {
      const pagina = await listar(crearControlador());

      expect(pagina.data).toHaveLength(2);
      expect(pagina.page).toEqual({ next_cursor: null, has_more: false, size: 2 });
      const fechas = pagina.data.map((guardia) => guardia.fecha);
      expect(fechas).toEqual([...fechas].sort());
    });

    it('filtra por desde y hasta, extremos incluidos', async () => {
      const controlador = crearControlador();

      expect((await listar(controlador, { desde: '2026-12-01' })).data.map((g) => g.fecha)).toEqual(
        ['2026-12-01'],
      );
      expect((await listar(controlador, { hasta: '2026-11-30' })).data.map((g) => g.fecha)).toEqual(
        ['2026-11-30'],
      );
      expect(
        (await listar(controlador, { desde: '2026-11-30', hasta: '2026-12-01' })).data,
      ).toHaveLength(2);
    });

    it('filtra por uno o varios estados', async () => {
      const controlador = crearControlador();

      expect((await listar(controlador, { estado: ['publicada'] })).data).toHaveLength(1);
      expect((await listar(controlador, { estado: ['publicada', 'propuesta'] })).data).toHaveLength(
        2,
      );
      expect((await listar(controlador, { estado: ['planificada'] })).data).toHaveLength(0);
    });

    it('filtra por especialidad, tipo de guardia y abogado', async () => {
      const controlador = crearControlador();

      expect((await listar(controlador, { especialidad_id: ESPECIALIDAD })).data).toHaveLength(2);
      expect((await listar(controlador, { tipo_guardia_id: TIPO })).data).toHaveLength(2);
      expect(
        (await listar(controlador, { abogado_id: ABOGADO })).data.map((g) => g.abogado_id),
      ).toEqual([ABOGADO]);
      expect(
        (
          await listar(controlador, {
            especialidad_id: '00000000-0000-4000-8000-000000000999',
          })
        ).data,
      ).toHaveLength(0);
    });

    it('filtra las descubiertas y las de detenido', async () => {
      const controlador = crearControlador();

      // Los datos de demo no traen ninguna descubierta ni de detenido.
      expect((await listar(controlador, { solo_descubiertas: true })).data).toHaveLength(0);
      expect((await listar(controlador, { solo_detenido: true })).data).toHaveLength(0);
      expect((await listar(controlador, { solo_detenido: false })).data).toHaveLength(2);
    });

    it('ordena por fecha en los dos sentidos', async () => {
      const controlador = crearControlador();

      const asc = (await listar(controlador, { orden: 'fecha_asc' })).data.map((g) => g.fecha);
      const desc = (await listar(controlador, { orden: 'fecha_desc' })).data.map((g) => g.fecha);

      expect(asc).toEqual([...asc].sort());
      expect(desc).toEqual([...asc].reverse());
    });

    it('pagina con limit y devuelve un cursor para la siguiente', async () => {
      const controlador = crearControlador();

      const primera = await listar(controlador, { limit: 1 });
      expect(primera.data).toHaveLength(1);
      expect(primera.page).toMatchObject({ has_more: true, size: 1 });
      expect(primera.page.next_cursor).not.toBeNull();

      const segunda = await listar(controlador, {
        limit: 1,
        cursor: primera.page.next_cursor!,
      });
      expect(segunda.data).toHaveLength(1);
      expect(segunda.data[0]!.id).not.toBe(primera.data[0]!.id);
      expect(segunda.page.has_more).toBe(false);
    });

    it('cuenta las guardias que cumplen los filtros para X-Total-Estimado', async () => {
      const servicio = new GuardiasService(new MemoriaGuardiasRepository());

      expect(await servicio.contar({})).toBe(2);
      expect(await servicio.contar({ estado: ['publicada'] })).toBe(1);
    });

    it('devuelve 400 con un cursor que no es suyo', async () => {
      await expect(listar(crearControlador(), { cursor: 'esto-no-es-un-cursor' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('filtros según el rol', () => {
    it('fuerza el abogado propio cuando el rol es letrado', async () => {
      const pagina = await listar(crearControlador(), {}, LETRADO);

      expect(pagina.data.map((guardia) => guardia.abogado_id)).toEqual([ABOGADO]);
    });

    it('un letrado no puede pedir las guardias de otro', () => {
      expect(() =>
        filtrosParaUsuario(
          { ...QUERY_VACIA, abogado_id: '00000000-0000-4000-8000-000000000999' },
          LETRADO,
        ),
      ).toThrow(ForbiddenException);
    });

    it('un letrado sin abogado en el token recibe 403 en vez de verlo todo', () => {
      const sinAbogado: UsuarioAutenticado = { ...LETRADO, abogadoId: undefined };

      expect(() => filtrosParaUsuario({ ...QUERY_VACIA }, sinAbogado)).toThrow(ForbiddenException);
    });
  });

  describe('GET /guardias/{guardiaId}', () => {
    it('devuelve la guardia pedida', async () => {
      const controlador = crearControlador();
      const [primera] = (await listar(controlador)).data;
      expect(await controlador.detalle(primera!.id, respuesta)).toEqual(primera);
    });

    it('devuelve el ETag a partir de la versión', async () => {
      const controlador = crearControlador();
      const [primera] = (await listar(controlador)).data;
      let etag: string | undefined;
      const capturar = { setHeader: (nombre: string, valor: string) => (etag = valor) };

      await controlador.detalle(primera!.id, capturar);
      expect(etag).toBe(`"${primera!.version}"`);
    });

    it('lanza NotFound si la guardia no existe', async () => {
      await expect(crearControlador().detalle('no-existe', respuesta)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /guardias', () => {
    it('crea la franja en estado planificada y sin titular', async () => {
      const controlador = crearControlador();
      const guardia = await controlador.crear({ ...nueva }, undefined, respuesta);

      expect(guardia).toMatchObject({
        estado: 'planificada',
        origen: 'planificacion',
        abogado_id: null,
        fecha: '2026-12-03',
        version: 1,
      });
      expect((await listar(controlador)).data).toHaveLength(3);
    });

    it('devuelve 409 si la franja ya existe', async () => {
      const controlador = crearControlador();
      await controlador.crear({ ...nueva }, undefined, respuesta);

      await expect(controlador.crear({ ...nueva }, undefined, respuesta)).rejects.toThrow(
        ConflictException,
      );
    });

    it('con la misma Idempotency-Key no crea una segunda guardia', async () => {
      const controlador = crearControlador();
      const primera = await controlador.crear({ ...nueva }, 'clave-de-prueba-0001', respuesta);
      const segunda = await controlador.crear(
        { ...nueva, fecha: '2026-12-04' },
        'clave-de-prueba-0001',
        respuesta,
      );

      expect(segunda.id).toBe(primera.id);
      expect((await listar(controlador)).data).toHaveLength(3);
    });
  });
});
