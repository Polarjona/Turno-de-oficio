import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { GuardiasController } from './guardias.controller';
import { GuardiasService } from './guardias.service';

const ESPECIALIDAD = '00000000-0000-4000-8000-000000000401';
const TIPO = '00000000-0000-4000-8000-000000000301';

const nueva = {
  tipo_guardia_id: TIPO,
  especialidad_id: ESPECIALIDAD,
  fecha: '2026-12-03',
  hora_inicio: '09:00',
  hora_fin: '20:00',
  es_detenido: false,
};

const respuesta = { setHeader: () => undefined };

describe('GuardiasController', () => {
  const crearControlador = (): GuardiasController => new GuardiasController(new GuardiasService());

  describe('GET /guardias', () => {
    it('devuelve una página con data y page', () => {
      const pagina = crearControlador().listar();

      expect(pagina.data).toHaveLength(2);
      expect(pagina.page).toEqual({ next_cursor: null, has_more: false, size: 2 });
      const fechas = pagina.data.map((guardia) => guardia.fecha);
      expect(fechas).toEqual([...fechas].sort());
    });

    it('filtra por desde y hasta, extremos incluidos', () => {
      const controlador = crearControlador();

      expect(controlador.listar({ desde: '2026-12-01' }).data.map((g) => g.fecha)).toEqual([
        '2026-12-01',
      ]);
      expect(controlador.listar({ hasta: '2026-11-30' }).data.map((g) => g.fecha)).toEqual([
        '2026-11-30',
      ]);
      expect(controlador.listar({ desde: '2026-11-30', hasta: '2026-12-01' }).data).toHaveLength(2);
    });

    it('filtra por uno o varios estados', () => {
      const controlador = crearControlador();

      expect(controlador.listar({ estado: ['publicada'] }).data).toHaveLength(1);
      expect(controlador.listar({ estado: ['publicada', 'propuesta'] }).data).toHaveLength(2);
      expect(controlador.listar({ estado: ['planificada'] }).data).toHaveLength(0);
    });

    it('ordena por fecha en los dos sentidos', () => {
      const controlador = crearControlador();

      const asc = controlador.listar({ orden: 'fecha_asc' }).data.map((g) => g.fecha);
      const desc = controlador.listar({ orden: 'fecha_desc' }).data.map((g) => g.fecha);

      expect(asc).toEqual([...asc].sort());
      expect(desc).toEqual([...asc].reverse());
    });

    it('pagina con limite y devuelve un cursor para la siguiente', () => {
      const controlador = crearControlador();

      const primera = controlador.listar({ limite: 1 });
      expect(primera.data).toHaveLength(1);
      expect(primera.page).toMatchObject({ has_more: true, size: 1 });
      expect(primera.page.next_cursor).not.toBeNull();

      const segunda = controlador.listar({ limite: 1, cursor: primera.page.next_cursor! });
      expect(segunda.data).toHaveLength(1);
      expect(segunda.data[0]!.id).not.toBe(primera.data[0]!.id);
      expect(segunda.page.has_more).toBe(false);
    });

    it('devuelve 400 con un cursor que no es suyo', () => {
      expect(() => crearControlador().listar({ cursor: 'esto-no-es-un-cursor' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('GET /guardias/{guardiaId}', () => {
    it('devuelve la guardia pedida', () => {
      const controlador = crearControlador();
      const [primera] = controlador.listar().data;
      expect(controlador.detalle(primera!.id, respuesta)).toEqual(primera);
    });

    it('devuelve el ETag a partir de la versión', () => {
      const controlador = crearControlador();
      const [primera] = controlador.listar().data;
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
      expect(controlador.listar().data).toHaveLength(3);
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
      expect(controlador.listar().data).toHaveLength(3);
    });
  });
});
