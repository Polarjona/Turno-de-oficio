import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GUARDIAS_DEMO,
  type FiltrosGuardias,
  type Guardia,
  type GuardiaRequest,
  type PaginaGuardias,
} from '@turno/shared';

import { randomUUID } from 'node:crypto';

/** El cursor es opaco para el cliente: aquí guarda la posición en la lista. */
function codificarCursor(posicion: number): string {
  return Buffer.from(String(posicion), 'utf8').toString('base64url');
}

function decodificarCursor(cursor: string): number {
  const posicion = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isInteger(posicion) || posicion < 0) {
    throw new BadRequestException('Cursor inválido');
  }
  return posicion;
}

/**
 * Guardias en memoria mientras el DDL completo (14 entidades) no está migrado.
 *
 * Sustituir esto por el repositorio de Postgres es cambiar esta clase: el
 * controlador no sabe de dónde salen los datos. Los filtros y el cursor ya se
 * aplican aquí para que la interfaz no cambie.
 */
@Injectable()
export class GuardiasService {
  private readonly guardias: Guardia[] = GUARDIAS_DEMO.map((guardia) => ({ ...guardia }));

  /** Clave de idempotencia -> id de la guardia creada con ella. */
  private readonly idempotencia = new Map<string, string>();

  /**
   * Aplica los filtros del contrato y ordena por fecha. Lo comparten `listar` y
   * `contar` para que la cabecera `X-Total-Estimado` hable del mismo conjunto.
   */
  private filtrar(filtros: Partial<FiltrosGuardias> = {}): Guardia[] {
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

    const filtradas = this.guardias.filter((guardia) => {
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
    filtradas.sort(
      (a, b) => sentido * (a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id)),
    );

    return filtradas;
  }

  /**
   * Página de guardias (`Pagina` en el contrato).
   *
   * Filtra según el contrato, ordena por fecha y devuelve un cursor opaco
   * mientras queden elementos.
   */
  listar(filtros: Partial<FiltrosGuardias> = {}): PaginaGuardias {
    const filtradas = this.filtrar(filtros);

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

  /** Total de guardias que cumplen los filtros, para `X-Total-Estimado`. */
  contar(filtros: Partial<FiltrosGuardias> = {}): number {
    return this.filtrar(filtros).length;
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
