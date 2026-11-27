import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  FiltrosSolicitudes,
  PaginaSolicitudes,
  ResolucionRequest,
  Solicitud,
} from '@turno/shared';
import type { Pool, PoolClient } from 'pg';

import type { UsuarioAutenticado } from './auth/auth.types';
import { codificarCursor, decodificarCursor } from './guardias.repository';
import {
  estaAbierta,
  type GuardiaParaSolicitud,
  type SolicitudNueva,
  type SolicitudesRepository,
} from './solicitudes.repository';

/**
 * Columnas del contrato `Solicitud`. `fecha_limite_resolucion` (RN-38) y
 * `plazo_vencido` no son columnas: se derivan al leer para que no puedan quedar
 * desfasadas.
 */
const COLUMNAS = `
  id,
  guardia_id,
  tipo,
  solicitante_id,
  sustituto_id,
  motivo,
  detalle,
  estado,
  extemporanea,
  sobrevenida,
  fecha_solicitud,
  fecha_solicitud + interval '5 days' as fecha_limite_resolucion,
  (estado in ('comunicada', 'en_revision', 'oferta_enviada', 'pendiente_validacion')
   and now() > fecha_solicitud + interval '5 days') as plazo_vencido,
  fecha_resolucion,
  resuelta_por,
  motivo_resolucion
`;

interface FilaSolicitud {
  id: string;
  guardia_id: string;
  tipo: Solicitud['tipo'];
  solicitante_id: string;
  sustituto_id: string | null;
  motivo: Solicitud['motivo'];
  detalle: string | null;
  estado: Solicitud['estado'];
  extemporanea: boolean;
  sobrevenida: boolean;
  fecha_solicitud: Date;
  fecha_limite_resolucion: Date;
  plazo_vencido: boolean;
  fecha_resolucion: Date | null;
  resuelta_por: string | null;
  motivo_resolucion: string | null;
}

function filaSolicitud(fila: FilaSolicitud): Solicitud {
  return {
    id: fila.id,
    guardia_id: fila.guardia_id,
    tipo: fila.tipo,
    solicitante_id: fila.solicitante_id,
    sustituto_id: fila.sustituto_id,
    motivo: fila.motivo,
    detalle: fila.detalle,
    estado: fila.estado,
    extemporanea: fila.extemporanea,
    sobrevenida: fila.sobrevenida,
    fecha_solicitud: fila.fecha_solicitud.toISOString(),
    fecha_limite_resolucion: fila.fecha_limite_resolucion.toISOString(),
    plazo_vencido: fila.plazo_vencido,
    fecha_resolucion: fila.fecha_resolucion?.toISOString() ?? null,
    resuelta_por: fila.resuelta_por,
    motivo_resolucion: fila.motivo_resolucion,
  };
}

@Injectable()
export class PostgresSolicitudesRepository implements SolicitudesRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Puente mientras no exista el ETL de usuarios: el primer acceso de un token
   * crea su fila en `usuario` y en `abogado` para que las claves ajenas de
   * `solicitud` y `auditoria` se sostengan.
   */
  async asegurarAbogado(usuario: UsuarioAutenticado): Promise<void> {
    await this.pool.query(
      `
        insert into usuario (id, nombre, apellidos, email, password_hash, rol)
        values ($1::uuid, $2, '', $3, '-', $4)
        on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol
      `,
      [usuario.id, usuario.nombre, usuario.email ?? `${usuario.id}@turno-oficio.test`, usuario.rol],
    );

    if (usuario.abogadoId) {
      await this.pool.query(
        `
          insert into abogado (id, usuario_id, num_colegiado)
          values ($1::uuid, $2::uuid, $3)
          on conflict (id) do nothing
        `,
        [usuario.abogadoId, usuario.id, usuario.colegiado || usuario.abogadoId],
      );
    }
  }

  async guardiaParaSolicitud(guardiaId: string): Promise<GuardiaParaSolicitud | null> {
    const { rows } = await this.pool.query<{
      id: string;
      fecha: string;
      especialidad_codigo: string;
      abogado_id: string | null;
    }>(
      `
        select g.id, to_char(g.fecha, 'YYYY-MM-DD') as fecha,
               e.codigo as especialidad_codigo, g.abogado_id
        from guardia g
        join especialidad e on e.id = g.especialidad_id
        where g.id = $1::uuid
      `,
      [guardiaId],
    );

    const fila = rows[0];
    if (!fila) return null;
    return {
      id: fila.id,
      fecha: fila.fecha,
      especialidadCodigo: fila.especialidad_codigo,
      abogadoId: fila.abogado_id,
    };
  }

  async crear(datos: SolicitudNueva): Promise<Solicitud> {
    try {
      const { rows } = await this.pool.query<FilaSolicitud>(
        `
          insert into solicitud (
            guardia_id, tipo, solicitante_id, sustituto_id, motivo, detalle,
            estado, extemporanea, sobrevenida
          )
          values ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, 'comunicada', $7, $8)
          returning ${COLUMNAS}
        `,
        [
          datos.guardia_id,
          datos.tipo,
          datos.solicitante_id,
          datos.sustituto_propuesto_id ?? null,
          datos.motivo,
          datos.detalle ?? null,
          datos.extemporanea,
          datos.sobrevenida,
        ],
      );
      return filaSolicitud(rows[0]!);
    } catch (error) {
      const codigo = (error as { code?: string }).code;
      const restriccion = (error as { constraint?: string }).constraint;
      if (codigo === '23505' && restriccion === 'ux_solicitud_activa') {
        throw new ConflictException('La guardia ya tiene una solicitud abierta');
      }
      if (codigo === '23503') {
        throw new BadRequestException('guardia_id o sustituto_propuesto_id no existen');
      }
      throw error;
    }
  }

  private condiciones(filtros: Partial<FiltrosSolicitudes>): {
    texto: string;
    valores: unknown[];
  } {
    const partes: string[] = [];
    const valores: unknown[] = [];

    const agregar = (fragmento: (indice: number) => string, valor: unknown): void => {
      valores.push(valor);
      partes.push(fragmento(valores.length));
    };

    if (filtros.estado?.length) agregar((n) => `estado = any($${n}::text[])`, filtros.estado);
    if (filtros.tipo) agregar((n) => `tipo = $${n}`, filtros.tipo);
    if (filtros.guardia_id) agregar((n) => `guardia_id = $${n}::uuid`, filtros.guardia_id);
    if (filtros.solicitante_id) {
      agregar((n) => `solicitante_id = $${n}::uuid`, filtros.solicitante_id);
    }
    if (filtros.solo_vencidas) {
      partes.push(
        `estado in ('comunicada', 'en_revision', 'oferta_enviada', 'pendiente_validacion')
         and now() > fecha_solicitud + interval '5 days'`,
      );
    }

    return { texto: partes.length ? `where ${partes.join(' and ')}` : '', valores };
  }

  async listar(filtros: Partial<FiltrosSolicitudes> = {}): Promise<PaginaSolicitudes> {
    const { texto, valores } = this.condiciones(filtros);
    const limite = filtros.limit ?? 20;
    const desplazamiento = filtros.cursor ? decodificarCursor(filtros.cursor) : 0;

    valores.push(limite + 1, desplazamiento);
    const { rows } = await this.pool.query<FilaSolicitud>(
      `
        select ${COLUMNAS}
        from solicitud
        ${texto}
        order by fecha_solicitud desc, id desc
        limit $${valores.length - 1} offset $${valores.length}
      `,
      valores,
    );

    const hayMas = rows.length > limite;
    const pagina = rows.slice(0, limite).map(filaSolicitud);

    return {
      data: pagina,
      page: {
        next_cursor: hayMas ? codificarCursor(desplazamiento + pagina.length) : null,
        has_more: hayMas,
        size: pagina.length,
      },
    };
  }

  async detalle(id: string): Promise<Solicitud | null> {
    const { rows } = await this.pool.query<FilaSolicitud>(
      `select ${COLUMNAS} from solicitud where id = $1::uuid`,
      [id],
    );
    return rows[0] ? filaSolicitud(rows[0]) : null;
  }

  /**
   * Resolución en una transacción: estado de la solicitud, guardia, asiento de
   * auditoría y aviso en el outbox. Si algo falla no queda nada a medias.
   */
  async resolver(id: string, resolucion: ResolucionRequest, actorId: string): Promise<Solicitud> {
    const cliente: PoolClient = await this.pool.connect();

    try {
      await cliente.query('begin');

      const { rows } = await cliente.query<{
        guardia_id: string;
        estado: Solicitud['estado'];
        solicitante_id: string;
      }>(
        `select guardia_id, estado, solicitante_id from solicitud where id = $1::uuid for update`,
        [id],
      );

      const previa = rows[0];
      if (!previa) {
        throw new NotFoundException('Solicitud no encontrada');
      }
      if (!estaAbierta(previa.estado)) {
        throw new ConflictException('La solicitud ya está resuelta');
      }

      const sustituto = resolucion.sustituto_id ?? null;
      const estadoSolicitud = resolucion.decision === 'estimar' ? 'estimada' : 'desestimada';

      await cliente.query(
        `
          update solicitud
          set estado = $2, sustituto_id = coalesce($3::uuid, sustituto_id),
              fecha_resolucion = now(), resuelta_por = $4::uuid, motivo_resolucion = $5,
              version = version + 1, modificado_en = now()
          where id = $1::uuid
        `,
        [id, estadoSolicitud, sustituto, actorId, resolucion.motivo_resolucion],
      );

      // RN-17: estimar sin sustituto deja la guardia descubierta; con sustituto
      // cambia el titular. Desestimar la devuelve al titular.
      const estadoGuardia =
        resolucion.decision === 'estimar'
          ? sustituto
            ? 'confirmada'
            : 'descubierta'
          : 'publicada';

      await cliente.query(
        `
          update guardia
          set abogado_id = coalesce($2::uuid, abogado_id), estado = $3,
              version = version + 1, modificado_en = now()
          where id = $1::uuid
        `,
        [previa.guardia_id, sustituto, estadoGuardia],
      );

      await cliente.query(
        `
          insert into auditoria (entidad, entidad_id, accion, estado_anterior, estado_nuevo, motivo, actor_id)
          values ('solicitud', $1::uuid, 'resolver', $2, $3, $4, $5::uuid)
        `,
        [id, previa.estado, estadoSolicitud, resolucion.motivo_resolucion, actorId],
      );

      // Outbox: el aviso al solicitante sale en la misma transacción.
      await cliente.query(
        `
          insert into notificacion (usuario_id, tipo, referencia_tipo, referencia_id, canal, estado_entrega)
          select a.usuario_id, 'cambio', 'solicitud', $1::uuid, 'email', 'pendiente'
          from abogado a
          where a.id = $2::uuid
          on conflict (referencia_tipo, referencia_id, usuario_id, canal) do nothing
        `,
        [id, previa.solicitante_id],
      );

      await cliente.query('commit');

      const resuelta = await this.detalle(id);
      if (!resuelta) {
        throw new NotFoundException('Solicitud no encontrada');
      }
      return resuelta;
    } catch (error) {
      await cliente.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }

  async cerrar(): Promise<void> {
    // El pool lo cierra `PoolPostgres`.
  }
}
