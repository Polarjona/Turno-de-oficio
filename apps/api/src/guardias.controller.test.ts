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
  const crearControlador = (): GuardiasController => new GuardiasController(new GuardiasService());

  const listar = (
    controlador: GuardiasController,
    filtros: Partial<FiltrosGuardias> = {},
    usuario: UsuarioAutenticado = COORDINACION,
  ) => controlador.listar({ ...QUERY_VACIA, ...filtros }, usuario, respuesta);

  describe('GET /guardias', () => {
    it('devuelve una página con data y page', () => {
      const pagina = listar(crearControlador());

      expect(pagina.data).toHaveLength(2);
      expect(pagina.page).toEqual({ next_cursor: null, has_more: false, size: 2 });
      const fechas = pagina.data.map((guardia) => guardia.fecha);
      expect(fechas).toEqual([...fechas].sort());
    });

    it('filtra por desde y hasta, extremos incluidos', () => {
      const controlador = crearControlador();

      expect(listar(controlador, { desde: '2026-12-01' }).data.map((g) => g.fecha)).toEqual([
        '2026-12-01',
      ]);
      expect(listar(controlador, { hasta: '2026-11-30' }).data.map((g) => g.fecha)).toEqual([
        '2026-11-30',
      ]);
      expect(listar(controlador, { desde: '2026-11-30', hasta: '2026-12-01' }).data).toHaveLength(
        2,
      );
    });

    it('filtra por uno o varios estados', () => {
      const controlador = crearControlador();

      expect(listar(controlador, { estado: ['publicada'] }).data).toHaveLength(1);
      expect(listar(controlador, { estado: ['publicada', 'propuesta'] }).data).toHaveLength(2);
      expect(listar(controlador, { estado: ['planificada'] }).data).toHaveLength(0);
    });

    it('filtra por especialidad, tipo de guardia y abogado', () => {
      const controlador = crearControlador();

      expect(listar(controlador, { especialidad_id: ESPECIALIDAD }).data).toHaveLength(2);
      expect(listar(controlador, { tipo_guardia_id: TIPO }).data).toHaveLength(2);
      expect(listar(controlador, { abogado_id: ABOGADO }).data.map((g) => g.abogado_id)).toEqual([
        ABOGADO,
      ]);
      expect(
        listar(controlador, { especialidad_id: '00000000-0000-4000-8000-000000000999' }).data,
      ).toHaveLength(0);
    });

    it('filtra las descubiertas y las de detenido', () => {
      const controlador = crearControlador();

      // Los datos de demo no traen ninguna descubierta ni de detenido.
      expect(listar(controlador, { solo_descubiertas: true }).data).toHaveLength(0);
      expect(listar(controlador, { solo_detenido: true }).data).toHaveLength(0);
      expect(listar(controlador, { solo_detenido: false }).data).toHaveLength(2);
    });

    it('ordena por fecha en los dos sentidos', () => {
      const controlador = crearControlador();

      const asc = listar(controlador, { orden: 'fecha_asc' }).data.map((g) => g.fecha);
      const desc = listar(controlador, { orden: 'fecha_desc' }).data.map((g) => g.fecha);

      expect(asc).toEqual([...asc].sort());
      expect(desc).toEqual([...asc].reverse());
    });

    it('pagina con limit y devuelve un cursor para la siguiente', () => {
      const controlador = crearControlador();

      const primera = listar(controlador, { limit: 1 });
      expect(primera.data).toHaveLength(1);
      expect(primera.page).toMatchObject({ has_more: true, size: 1 });
      expect(primera.page.next_cursor).not.toBeNull();

      const segunda = listar(controlador, { limit: 1, cursor: primera.page.next_cursor! });
      expect(segunda.data).toHaveLength(1);
      expect(segunda.data[0]!.id).not.toBe(primera.data[0]!.id);
      expect(segunda.page.has_more).toBe(false);
    });

    it('cuenta las guardias que cumplen los filtros para X-Total-Estimado', () => {
      const servicio = new GuardiasService();

      expect(servicio.contar({})).toBe(2);
      expect(servicio.contar({ estado: ['publicada'] })).toBe(1);
    });

    it('devuelve 400 con un cursor que no es suyo', () => {
      expect(() => listar(crearControlador(), { cursor: 'esto-no-es-un-cursor' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('filtros según el rol', () => {
    it('fuerza el abogado propio cuando el rol es letrado', () => {
      const pagina = listar(crearControlador(), {}, LETRADO);

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

    it('sin abogado en el token no se fuerza nada', () => {
      const sinAbogado: UsuarioAutenticado = { ...LETRADO, abogadoId: undefined };
      const filtros = filtrosParaUsuario({ ...QUERY_VACIA }, sinAbogado);

      expect(filtros.abogado_id).toBeUndefined();
    });
  });

  describe('GET /guardias/{guardiaId}', () => {
    it('devuelve la guardia pedida', () => {
      const controlador = crearControlador();
      const [primera] = listar(controlador).data;
      expect(controlador.detalle(primera!.id, respuesta)).toEqual(primera);
    });

    it('devuelve el ETag a partir de la versión', () => {
      const controlador = crearControlador();
      const [primera] = listar(controlador).data;
      let etag: string | undefined;
      const capturar = { setHeader: (nombre: string, valor: string) => (etag = valor) };

      controlador.detalle(primera!.id, capturar);
      expect(etag).toBe(`"${primera!.version}"`);
    });

    it('lanza NotFound si la guardia no existe', () => {
      expect(() => crearControlador().detalle('no-existe', respuesta)).toThrow(NotFoundException);
    });
  });

  describe('POST /guardias', () => {
    it('crea la franja en estado planificada y sin titular', () => {
      const controlador = crearControlador();
      const guardia = controlador.crear({ ...nueva }, undefined, respuesta);

      expect(guardia).toMatchObject({
        estado: 'planificada',
        origen: 'planificacion',
        abogado_id: null,
        fecha: '2026-12-03',
        version: 1,
      });
      expect(listar(controlador).data).toHaveLength(3);
    });

    it('devuelve 409 si la franja ya existe', () => {
      const controlador = crearControlador();
      controlador.crear({ ...nueva }, undefined, respuesta);

      expect(() => controlador.crear({ ...nueva }, undefined, respuesta)).toThrow(
        ConflictException,
      );
    });

    it('con la misma Idempotency-Key no crea una segunda guardia', () => {
      const controlador = crearControlador();
      const primera = controlador.crear({ ...nueva }, 'clave-de-prueba-0001', respuesta);
      const segunda = controlador.crear(
        { ...nueva, fecha: '2026-12-04' },
        'clave-de-prueba-0001',
        respuesta,
      );

      expect(segunda.id).toBe(primera.id);
      expect(listar(controlador).data).toHaveLength(3);
    });
  });
});
