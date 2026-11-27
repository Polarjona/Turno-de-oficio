import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  GUARDIAS_DEMO,
  type FiltrosSolicitudes,
  type PaginaSolicitudes,
  type ResolucionRequest,
  type Solicitud,
  type SolicitudRequest,
} from '@turno/shared';

import { randomUUID } from 'node:crypto';

import type { UsuarioAutenticado } from './auth/auth.types';
import { codificarCursor, decodificarCursor } from './guardias.repository';

/** Lo que el servicio necesita de la guardia para admitir una solicitud. */
export interface GuardiaParaSolicitud {
  id: string;
  fecha: string;
  especialidadCodigo: string;
  abogadoId: string | null;
}

/** Datos ya validados y completados por el servicio antes de insertar. */
export interface SolicitudNueva extends SolicitudRequest {
  solicitante_id: string;
  extemporanea: boolean;
}

export const SOLICITUDES_REPOSITORIO = 'SOLICITUDES_REPOSITORIO';

export interface SolicitudesRepository {
  /** Da de alta el usuario y el abogado del token si aún no están (puente JIT). */
  asegurarAbogado(usuario: UsuarioAutenticado): Promise<void>;
  guardiaParaSolicitud(guardiaId: string): Promise<GuardiaParaSolicitud | null>;
  crear(datos: SolicitudNueva): Promise<Solicitud>;
  listar(filtros: Partial<FiltrosSolicitudes>): Promise<PaginaSolicitudes>;
  detalle(id: string): Promise<Solicitud | null>;
  resolver(id: string, resolucion: ResolucionRequest, actorId: string): Promise<Solicitud>;
  cerrar(): Promise<void>;
}

const ABIERTAS = ['comunicada', 'en_revision', 'oferta_enviada', 'pendiente_validacion'] as const;

export function estaAbierta(estado: Solicitud['estado']): boolean {
  return (ABIERTAS as readonly string[]).includes(estado);
}

/** Solicitudes en memoria: tests y arranque sin base de datos. */
export class MemoriaSolicitudesRepository implements SolicitudesRepository {
  private readonly solicitudes: Solicitud[] = [];

  constructor(
    private readonly guardias: GuardiaParaSolicitud[] = GUARDIAS_DEMO.map((guardia) => ({
      id: guardia.id,
      fecha: guardia.fecha,
      especialidadCodigo: 'PEN',
      abogadoId: guardia.abogado_id,
    })),
  ) {}

  async asegurarAbogado(): Promise<void> {
    // Sin base de datos no hay nada que registrar.
  }

  async guardiaParaSolicitud(guardiaId: string): Promise<GuardiaParaSolicitud | null> {
    return this.guardias.find((guardia) => guardia.id === guardiaId) ?? null;
  }

  async crear(datos: SolicitudNueva): Promise<Solicitud> {
    const activa = this.solicitudes.some(
      (solicitud) => solicitud.guardia_id === datos.guardia_id && estaAbierta(solicitud.estado),
    );
    if (activa) {
      throw new ConflictException('La guardia ya tiene una solicitud abierta');
    }

    const ahora = new Date();
    const solicitud: Solicitud = {
      id: randomUUID(),
      guardia_id: datos.guardia_id,
      tipo: datos.tipo,
      solicitante_id: datos.solicitante_id,
      sustituto_id: datos.sustituto_propuesto_id ?? null,
      motivo: datos.motivo,
      detalle: datos.detalle ?? null,
      estado: 'comunicada',
      extemporanea: datos.extemporanea,
      sobrevenida: datos.sobrevenida,
      fecha_solicitud: ahora.toISOString(),
      fecha_limite_resolucion: new Date(ahora.getTime() + 5 * 24 * 3600 * 1000).toISOString(),
      plazo_vencido: false,
      fecha_resolucion: null,
      resuelta_por: null,
      motivo_resolucion: null,
    };

    this.solicitudes.push(solicitud);
    return solicitud;
  }

  async listar(filtros: Partial<FiltrosSolicitudes> = {}): Promise<PaginaSolicitudes> {
    const filtradas = this.solicitudes.filter((solicitud) => {
      if (filtros.estado?.length && !filtros.estado.includes(solicitud.estado)) return false;
      if (filtros.tipo && solicitud.tipo !== filtros.tipo) return false;
      if (filtros.guardia_id && solicitud.guardia_id !== filtros.guardia_id) return false;
      if (filtros.solicitante_id && solicitud.solicitante_id !== filtros.solicitante_id) {
        return false;
      }
      if (filtros.solo_vencidas && !solicitud.plazo_vencido) return false;
      return true;
    });

    const tamano = filtros.limit ?? 20;
    const inicio = filtros.cursor ? decodificarCursor(filtros.cursor) : 0;
    const pagina = filtradas.slice(inicio, inicio + tamano);
    const siguiente = inicio + pagina.length;
    const hayMas = siguiente < filtradas.length;

    return {
      data: pagina,
      page: {
        next_cursor: hayMas ? codificarCursor(siguiente) : null,
        has_more: hayMas,
        size: pagina.length,
      },
    };
  }

  async detalle(id: string): Promise<Solicitud | null> {
    return this.solicitudes.find((solicitud) => solicitud.id === id) ?? null;
  }

  async resolver(id: string, resolucion: ResolucionRequest, actorId: string): Promise<Solicitud> {
    const solicitud = await this.detalle(id);
    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (!estaAbierta(solicitud.estado)) {
      throw new ConflictException('La solicitud ya está resuelta');
    }

    solicitud.estado = resolucion.decision === 'estimar' ? 'estimada' : 'desestimada';
    solicitud.fecha_resolucion = new Date().toISOString();
    solicitud.resuelta_por = actorId;
    solicitud.motivo_resolucion = resolucion.motivo_resolucion;
    solicitud.sustituto_id = resolucion.sustituto_id ?? solicitud.sustituto_id;
    return solicitud;
  }

  async cerrar(): Promise<void> {
    // Nada que cerrar.
  }
}
