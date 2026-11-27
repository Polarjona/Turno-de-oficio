import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('GuardiasController', () => {
  const crearControlador = (): GuardiasController => new GuardiasController(new GuardiasService());

  it('devuelve las guardias ordenadas por fecha', () => {
    const guardias = crearControlador().listar();
    const fechas = guardias.map((g) => g.fecha);
    expect(fechas).toEqual([...fechas].sort());
  });

  it('devuelve la guardia pedida', () => {
    const controlador = crearControlador();
    const [primera] = controlador.listar();
    expect(controlador.detalle(primera!.id)).toEqual(primera);
  });

  it('lanza NotFound si la guardia no existe', () => {
    expect(() => crearControlador().detalle('no-existe')).toThrow(NotFoundException);
  });

  it('crea la franja en estado planificada y sin titular', () => {
    const controlador = crearControlador();
    const respuesta = { setHeader: () => undefined };
    const guardia = controlador.crear({ ...nueva }, undefined, respuesta);

    expect(guardia).toMatchObject({
      estado: 'planificada',
      origen: 'planificacion',
      abogado_id: null,
      fecha: '2026-12-03',
      version: 1,
    });
    expect(controlador.listar()).toHaveLength(3);
  });

  it('devuelve 409 si la franja ya existe', () => {
    const controlador = crearControlador();
    const respuesta = { setHeader: () => undefined };
    controlador.crear({ ...nueva }, undefined, respuesta);

    expect(() => controlador.crear({ ...nueva }, undefined, respuesta)).toThrow(ConflictException);
  });

  it('con la misma Idempotency-Key no crea una segunda guardia', () => {
    const controlador = crearControlador();
    const respuesta = { setHeader: () => undefined };
    const primera = controlador.crear({ ...nueva }, 'clave-de-prueba-0001', respuesta);
    const segunda = controlador.crear(
      { ...nueva, fecha: '2026-12-04' },
      'clave-de-prueba-0001',
      respuesta,
    );

    expect(segunda.id).toBe(primera.id);
    expect(controlador.listar()).toHaveLength(3);
  });
});
