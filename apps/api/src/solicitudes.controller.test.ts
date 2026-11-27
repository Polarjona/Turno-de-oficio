import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ResolucionRequestSchema, SolicitudRequestSchema } from '@turno/shared';
import { describe, expect, it } from 'vitest';

import type { UsuarioAutenticado } from './auth/auth.types';
import { MemoriaSolicitudesRepository } from './solicitudes.repository';
import { SolicitudesService, esExtemporanea } from './solicitudes.service';

const GUARDIA_PEN = {
  id: '00000000-0000-4000-8000-000000000101',
  fecha: '2027-01-10',
  especialidadCodigo: 'PEN',
  abogadoId: '00000000-0000-4000-8000-000000000201',
};

const GUARDIA_EXT = {
  id: '00000000-0000-4000-8000-000000000102',
  fecha: '2027-01-10',
  especialidadCodigo: 'EXT',
  abogadoId: null,
};

const LETRADO: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-000000000901',
  nombre: 'Lucía Demostración',
  colegiado: 'ICAT-0101',
  abogadoId: '00000000-0000-4000-8000-000000000201',
  rol: 'letrado',
  roles: ['letrado'],
};

const COORDINACION: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-000000000902',
  nombre: 'Marta Demostración',
  colegiado: 'ICAT-0001',
  abogadoId: '00000000-0000-4000-8000-000000000202',
  rol: 'coordinacion',
  roles: ['coordinacion'],
};

const nueva = {
  guardia_id: GUARDIA_PEN.id,
  tipo: 'excusa' as const,
  motivo: 'enfermedad' as const,
  detalle: 'Ingreso hospitalario documentado',
  sobrevenida: false,
};

const crearServicio = (): SolicitudesService =>
  new SolicitudesService(new MemoriaSolicitudesRepository([GUARDIA_PEN, GUARDIA_EXT]));

describe('SolicitudesService', () => {
  describe('POST /solicitudes', () => {
    it('registra la solicitud en estado comunicada y con el letrado del token', async () => {
      const solicitud = await crearServicio().crear({ ...nueva }, LETRADO);

      expect(solicitud).toMatchObject({
        guardia_id: GUARDIA_PEN.id,
        tipo: 'excusa',
        motivo: 'enfermedad',
        estado: 'comunicada',
        solicitante_id: LETRADO.abogadoId,
        sustituto_id: null,
        extemporanea: false,
        sobrevenida: false,
      });
      expect(solicitud.fecha_limite_resolucion).not.toBeNull();
    });

    it('devuelve 409 si la guardia ya tiene una solicitud abierta', async () => {
      const servicio = crearServicio();
      await servicio.crear({ ...nueva }, LETRADO);

      await expect(servicio.crear({ ...nueva, motivo: 'otro' }, LETRADO)).rejects.toThrow(
        ConflictException,
      );
    });

    it('devuelve 422 si la excusa no es de una materia admitida (RN-36)', async () => {
      await expect(
        crearServicio().crear({ ...nueva, guardia_id: GUARDIA_EXT.id }, LETRADO),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('devuelve 404 si la guardia no existe', async () => {
      await expect(
        crearServicio().crear(
          { ...nueva, guardia_id: '00000000-0000-4000-8000-000000000999' },
          LETRADO,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('registra la extemporaneidad en vez de ocultarla (RN-12)', async () => {
      const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
      const servicio = new SolicitudesService(
        new MemoriaSolicitudesRepository([{ ...GUARDIA_PEN, fecha: manana }]),
      );

      const solicitud = await servicio.crear({ ...nueva }, LETRADO);
      expect(solicitud.extemporanea).toBe(true);
    });
  });

  describe('POST /solicitudes/{id}/resolucion', () => {
    it('estima con el motivo en la propia solicitud', async () => {
      const servicio = crearServicio();
      const creada = await servicio.crear({ ...nueva }, LETRADO);

      const resuelta = await servicio.resolver(
        creada.id,
        {
          decision: 'estimar',
          motivo_resolucion: 'Documentación acreditada (RN-13)',
          justificar_hueco: false,
        },
        COORDINACION,
      );

      expect(resuelta).toMatchObject({
        estado: 'estimada',
        resuelta_por: COORDINACION.id,
        motivo_resolucion: 'Documentación acreditada (RN-13)',
      });
      expect(resuelta.fecha_resolucion).not.toBeNull();
    });

    it('desestima y deja la guardia con su titular', async () => {
      const servicio = crearServicio();
      const creada = await servicio.crear({ ...nueva }, LETRADO);

      const resuelta = await servicio.resolver(
        creada.id,
        {
          decision: 'desestimar',
          motivo_resolucion: 'No se acredita el supuesto',
          justificar_hueco: false,
        },
        COORDINACION,
      );

      expect(resuelta.estado).toBe('desestimada');
    });

    it('devuelve 409 si ya estaba resuelta', async () => {
      const servicio = crearServicio();
      const creada = await servicio.crear({ ...nueva }, LETRADO);
      const resolucion = {
        decision: 'estimar' as const,
        motivo_resolucion: 'Procede',
        justificar_hueco: false,
      };

      await servicio.resolver(creada.id, resolucion, COORDINACION);
      await expect(servicio.resolver(creada.id, resolucion, COORDINACION)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('esquemas del contrato', () => {
    it('sin motivo de resolución el cuerpo no valida', () => {
      expect(
        ResolucionRequestSchema.safeParse({ decision: 'estimar', motivo_resolucion: '   ' })
          .success,
      ).toBe(false);
    });

    it('una permuta exige sustituto propuesto', () => {
      expect(SolicitudRequestSchema.safeParse({ ...nueva, tipo: 'permuta' }).success).toBe(false);
      expect(
        SolicitudRequestSchema.safeParse({
          ...nueva,
          tipo: 'permuta',
          sustituto_propuesto_id: '00000000-0000-4000-8000-000000000201',
        }).success,
      ).toBe(true);
    });
  });
});

describe('esExtemporanea', () => {
  it('es extemporánea con menos de tres días de antelación', () => {
    const ahora = new Date('2026-11-27T00:00:00Z');
    expect(esExtemporanea('2026-11-28', ahora)).toBe(true);
    expect(esExtemporanea('2026-12-07', ahora)).toBe(false);
  });
});
