import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { GuardiasController } from './guardias.controller';

describe('GuardiasController', () => {
  const controlador = new GuardiasController();

  it('devuelve las guardias ordenadas por fecha', () => {
    const guardias = controlador.listar();
    const fechas = guardias.map((g) => g.fecha);
    expect(fechas).toEqual([...fechas].sort());
  });

  it('devuelve la guardia pedida', () => {
    const [primera] = controlador.listar();
    expect(controlador.detalle(primera!.id)).toEqual(primera);
  });

  it('lanza NotFound si la guardia no existe', () => {
    expect(() => controlador.detalle('no-existe')).toThrow(NotFoundException);
  });
});
