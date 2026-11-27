import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { FiltrosGuardias, Guardia, GuardiaRequest, PaginaGuardias } from '@turno/shared';
import { Pool } from 'pg';

import { codificarCursor, decodificarCursor, type GuardiasRepository } from './guardias.repository';

/**
 * Columnas del contrato `Guardia` sobre la tabla `guardia` de la migración
 * `0001_init.sql`.
 *
 * La tabla guarda `fecha` como DATE y las horas como TIME; el contrato las pide
 * como `AAAA-MM-DD` y `HH:MM`, así que se formatean en la consulta. `inicio_en`
 * y `fin_en` son columnas generadas para el EXCLUDE de RN-04 y no salen al DTO.
 */
const COLUMNAS = `
  id,
  cuadrante_id,
  tipo_guardia_id,
  especialidad_id,
  abogado_id,
  to_char(fecha, 'YYYY-MM-DD')       as fecha,
  to_char(hora_inicio, 'HH24:MI')    as hora_inicio,
  to_char(hora_fin, 'HH24:MI')       as hora_fin,
  estado,
  origen,
  motivo_asignacion,
  es_detenido,
  version,
  creado_en,
  modificado_en
`;

interface FilaGuardia {
  id: string;
  cuadrante_id: string | null;
  tipo_guardia_id: string;
  especialidad_id: string;
  abogado_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: Guardia['estado'];
  origen: Guardia['origen'];
  motivo_asignacion: string | null;
  es_detenido: boolean;
  version: number;
  creado_en: Date;
  modificado_en: Date;
}

function filaAGuardia(fila: FilaGuardia): Guardia {
  return {
    id: fila.id,
    cuadrante_id: fila.cuadrante_id,
    tipo_guardia_id: fila.tipo_guardia_id,
    especialidad_id: fila.especialidad_id,
    abogado_id: fila.abogado_id,
    fecha: fila.fecha,
    hora_inicio: fila.hora_inicio,
    hora_fin: fila.hora_fin,
    estado: fila.estado,
    origen: fila.origen,
    motivo_asignacion: fila.motivo_asignacion,
    es_detenido: fila.es_detenido,
    version: Number(fila.version),
    creado_en: fila.creado_en.toISOString(),
    modificado_en: fila.modificado_en.toISOString(),
  };
}

/**
 * Guardias en Postgres (migración `0001_init.sql`).
 *
 * Los filtros se traducen a SQL con parámetros: nada se concatena con valores
 * del cliente. El cursor sigue siendo un desplazamiento opaco, el mismo que
 * devuelve `page.next_cursor`.
 */
@Injectable()
export class PostgresGuardiasRepository implements GuardiasRepository {
  private readonly pool: Pool;

  constructor(cadenaConexion: string) {
    this.pool = new Pool({ connectionString: cadenaConexion, max: 10 });
  }

  /** Convierte los filtros en un `where` con parámetros numerados. */
  private condiciones(filtros: Partial<FiltrosGuardias>): {
    texto: string;
    valores: unknown[];
  } {
    const partes: string[] = [];
    const valores: unknown[] = [];

    const agregar = (fragmento: (indice: number) => string, valor: unknown): void => {
      valores.push(valor);
      partes.push(fragmento(valores.length));
    };

    if (filtros.desde) agregar((n) => `fecha >= $${n}::date`, filtros.desde);
    if (filtros.hasta) agregar((n) => `fecha <= $${n}::date`, filtros.hasta);
    if (filtros.estado && filtros.estado.length > 0) {
      agregar((n) => `estado = any($${n}::text[])`, filtros.estado);
    }
    if (filtros.especialidad_id) {
      agregar((n) => `especialidad_id = $${n}::uuid`, filtros.especialidad_id);
    }
    if (filtros.tipo_guardia_id) {
      agregar((n) => `tipo_guardia_id = $${n}::uuid`, filtros.tipo_guardia_id);
    }
    if (filtros.abogado_id) agregar((n) => `abogado_id = $${n}::uuid`, filtros.abogado_id);
    if (filtros.solo_descubiertas) partes.push(`estado = 'descubierta'`);
    if (filtros.solo_detenido) partes.push('es_detenido');

    return {
      texto: partes.length > 0 ? `where ${partes.join(' and ')}` : '',
      valores,
    };
  }

  async listar(filtros: Partial<FiltrosGuardias> = {}): Promise<PaginaGuardias> {
    const { texto, valores } = this.condiciones(filtros);
    const sentido = filtros.orden === 'fecha_desc' ? 'desc' : 'asc';
    const limite = filtros.limit ?? 20;
    const desplazamiento = filtros.cursor ? decodificarCursor(filtros.cursor) : 0;

    // Se pide uno de más para saber si hay página siguiente.
    valores.push(limite + 1, desplazamiento);
    const consulta = `
      select ${COLUMNAS}
      from guardia
      ${texto}
      order by fecha ${sentido}, id ${sentido}
      limit $${valores.length - 1} offset $${valores.length}
    `;

    const { rows } = await this.pool.query<FilaGuardia>(consulta, valores);
    const hayMas = rows.length > limite;
    const pagina = rows.slice(0, limite).map(filaAGuardia);

    return {
      data: pagina,
      page: {
        next_cursor: hayMas ? codificarCursor(desplazamiento + pagina.length) : null,
        has_more: hayMas,
        size: pagina.length,
      },
    };
  }

  async contar(filtros: Partial<FiltrosGuardias> = {}): Promise<number> {
    const { texto, valores } = this.condiciones(filtros);
    const { rows } = await this.pool.query<{ total: number }>(
      `select count(*)::int as total from guardia ${texto}`,
      valores,
    );
    return rows[0]?.total ?? 0;
  }

  async detalle(id: string): Promise<Guardia | null> {
    const { rows } = await this.pool.query<FilaGuardia>(
      `select ${COLUMNAS} from guardia where id = $1::uuid`,
      [id],
    );
    return rows[0] ? filaAGuardia(rows[0]) : null;
  }

  async crear(
    datos: GuardiaRequest,
    claveIdempotencia?: string,
  ): Promise<{ guardia: Guardia; creada: boolean }> {
    if (claveIdempotencia) {
      const { rows } = await this.pool.query<{ guardia_id: string }>(
        'select guardia_id from idempotencia_guardia where clave = $1',
        [claveIdempotencia],
      );
      const previa = rows[0] ? await this.detalle(rows[0].guardia_id) : null;
      if (previa) return { guardia: previa, creada: false };
    }

    try {
      const { rows } = await this.pool.query<FilaGuardia>(
        `
          insert into guardia (
            tipo_guardia_id, especialidad_id, fecha, hora_inicio, hora_fin,
            es_detenido, estado, origen
          )
          values ($1::uuid, $2::uuid, $3::date, $4::time, $5::time, $6, 'planificada', 'planificacion')
          returning ${COLUMNAS}
        `,
        [
          datos.tipo_guardia_id,
          datos.especialidad_id,
          datos.fecha,
          datos.hora_inicio,
          datos.hora_fin,
          datos.es_detenido,
        ],
      );

      const guardia = filaAGuardia(rows[0]!);
      if (claveIdempotencia) {
        await this.pool.query(
          `insert into idempotencia_guardia (clave, guardia_id) values ($1, $2::uuid)
           on conflict (clave) do nothing`,
          [claveIdempotencia, guardia.id],
        );
      }
      return { guardia, creada: true };
    } catch (error) {
      const codigo = (error as { code?: string }).code;
      const restriccion = (error as { constraint?: string }).constraint;

      if (codigo === '23505' && restriccion === 'ux_guardia_fecha_tipo') {
        throw new ConflictException(`Ya existe una guardia de ese tipo el ${datos.fecha}`);
      }
      if (codigo === '23503') {
        throw new BadRequestException(
          'tipo_guardia_id o especialidad_id no existen en el catálogo',
        );
      }
      throw error;
    }
  }

  async cerrar(): Promise<void> {
    await this.pool.end();
  }

  /** Nest llama a este hook al cerrar la aplicación y suelta el pool. */
  async onModuleDestroy(): Promise<void> {
    await this.cerrar();
  }
}
