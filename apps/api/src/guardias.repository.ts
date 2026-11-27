import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  GUARDIAS_DEMO,
  type FiltrosGuardias,
  type Guardia,
  type GuardiaRequest,
  type PaginaGuardias,
} from '@turno/shared';

import { randomUUID } from 'node:crypto';

/**
 * Puerto de persistencia de las guardias.
 *
 * El controlador y el servicio no saben si detrás hay Postgres o un array; los
 * tests usan la implementación en memoria y la aplicación la de Postgres
 * (`guardias.postgres.ts`) en cuanto hay `DATABASE_URL`.
 */
export interface GuardiasRepository {
  listar(filtros: Partial<FiltrosGuardias>): Promise<PaginaGuardias>;
  contar(filtros: Partial<FiltrosGuardias>): Promise<number>;
  detalle(id: string): Promise<Guardia | null>;
  crear(
    datos: GuardiaRequest,
    claveIdempotencia?: string,
  ): Promise<{ guardia: Guardia; creada: boolean }>;
  cerrar(): Promise<void>;
}

export const GUARDIAS_REPOSITORIO = 'GUARDIAS_REPOSITORIO';

/** El cursor es opaco para el cliente: aquí guarda la posición en la lista. */
export function codificarCursor(posicion: number): string {
  return Buffer.from(String(posicion), 'utf8').toString('base64url');
}

export function decodificarCursor(cursor: string): number {
  const posicion = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isInteger(posicion) || posicion < 0) {
    throw new BadRequestException('Cursor inválido');
  }
  return posicion;
}

/**
 * Aplica los filtros del contrato y ordena por fecha. Las dos implementaciones
 * comparten estas reglas para que no puedan divergir.
 */
export function filtrarGuardias(
  guardias: readonly Guardia[],
  filtros: Partial<FiltrosGuardias> = {},
): Guardia[] {
  const {
    desde,
    hasta,
    estado,
    especialidad_id,
    tipo_guardia_id,
    abogado_id,
    solo_descubiertas,
    solo_detenido,
    orden,
  } = filtros;

  const filtradas = guardias.filter((guardia) => {
    if (desde && guardia.fecha < desde) return false;
    if (hasta && guardia.fecha > hasta) return false;
    if (estado && estado.length > 0 && !estado.includes(guardia.estado)) return false;
    if (especialidad_id && guardia.especialidad_id !== especialidad_id) return false;
    if (tipo_guardia_id && guardia.tipo_guardia_id !== tipo_guardia_id) return false;
    if (abogado_id && guardia.abogado_id !== abogado_id) return false;
    if (solo_descubiertas && guardia.estado !== 'descubierta') return false;
    if (solo_detenido && !guardia.es_detenido) return false;
    return true;
  });

  const sentido = orden === 'fecha_desc' ? -1 : 1;
  filtradas.sort((a, b) => sentido * (a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id)));

  return filtradas;
}

/** Guardias en memoria: tests y arranque sin base de datos. */
export class MemoriaGuardiasRepository implements GuardiasRepository {
  private readonly guardias: Guardia[] = GUARDIAS_DEMO.map((guardia) => ({ ...guardia }));

  /** Clave de idempotencia -> id de la guardia creada con ella. */
  private readonly idempotencia = new Map<string, string>();

  async listar(filtros: Partial<FiltrosGuardias> = {}): Promise<PaginaGuardias> {
    const filtradas = filtrarGuardias(this.guardias, filtros);

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

  async contar(filtros: Partial<FiltrosGuardias> = {}): Promise<number> {
    return filtrarGuardias(this.guardias, filtros).length;
  }

  async detalle(id: string): Promise<Guardia | null> {
    return this.guardias.find((candidata) => candidata.id === id) ?? null;
  }

  async crear(
    datos: GuardiaRequest,
    claveIdempotencia?: string,
  ): Promise<{ guardia: Guardia; creada: boolean }> {
    if (claveIdempotencia) {
      const idPrevio = this.idempotencia.get(claveIdempotencia);
      if (idPrevio) {
        const previa = await this.detalle(idPrevio);
        if (previa) return { guardia: previa, creada: false };
      }
    }

    const repetida = this.guardias.find(
      (guardia) =>
        guardia.fecha === datos.fecha && guardia.tipo_guardia_id === datos.tipo_guardia_id,
    );
    if (repetida) {
      // El contrato marca la franja repetida como conflicto; la base lo impone
      // con `ux_guardia_fecha_tipo`.
      throw new ConflictException(
        `Ya existe una guardia de ese tipo el ${datos.fecha} (${repetida.id})`,
      );
    }

    const ahora = new Date().toISOString();
    const guardia: Guardia = {
      id: randomUUID(),
      cuadrante_id: null,
      tipo_guardia_id: datos.tipo_guardia_id,
      especialidad_id: datos.especialidad_id,
      abogado_id: null,
      fecha: datos.fecha,
      hora_inicio: datos.hora_inicio,
      hora_fin: datos.hora_fin,
      estado: 'planificada',
      origen: 'planificacion',
      motivo_asignacion: null,
      es_detenido: datos.es_detenido,
      version: 1,
      creado_en: ahora,
      modificado_en: ahora,
    };

    this.guardias.push(guardia);
    if (claveIdempotencia) {
      this.idempotencia.set(claveIdempotencia, guardia.id);
    }

    return { guardia, creada: true };
  }

  async cerrar(): Promise<void> {
    // Nada que cerrar.
  }
}
