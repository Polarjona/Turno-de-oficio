import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GUARDIAS_DEMO, type Guardia, type GuardiaRequest } from '@turno/shared';

import { randomUUID } from 'node:crypto';

/**
 * Guardias en memoria mientras el DDL completo (14 entidades) no está migrado.
 *
 * Sustituir esto por el repositorio de Postgres es cambiar esta clase: el
 * controlador no sabe de dónde salen los datos. Las reglas de fecha y tipo ya
 * se aplican aquí para que la interfaz no cambie.
 */
@Injectable()
export class GuardiasService {
  private readonly guardias: Guardia[] = GUARDIAS_DEMO.map((guardia) => ({ ...guardia }));

  /** Clave de idempotencia -> id de la guardia creada con ella. */
  private readonly idempotencia = new Map<string, string>();

  listar(): Guardia[] {
    return [...this.guardias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  detalle(id: string): Guardia {
    const guardia = this.guardias.find((candidata) => candidata.id === id);
    if (!guardia) {
      throw new NotFoundException('Guardia no encontrada');
    }
    return guardia;
  }

  /**
   * Crea una franja sin titular en estado `planificada` (RN-01).
   *
   * - Una franja repetida (misma fecha y tipo) devuelve 409: el contrato lo
   *   marca como conflicto y el DDL ya tiene `unique (fecha, tipo)`.
   * - Si llega `Idempotency-Key`, el reintento devuelve la misma guardia en vez
   *   de crear otra.
   */
  crear(datos: GuardiaRequest, claveIdempotencia?: string): { guardia: Guardia; creada: boolean } {
    if (claveIdempotencia) {
      const idPrevio = this.idempotencia.get(claveIdempotencia);
      if (idPrevio) {
        return { guardia: this.detalle(idPrevio), creada: false };
      }
    }

    const repetida = this.guardias.find(
      (guardia) =>
        guardia.fecha === datos.fecha && guardia.tipo_guardia_id === datos.tipo_guardia_id,
    );
    if (repetida) {
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
}
