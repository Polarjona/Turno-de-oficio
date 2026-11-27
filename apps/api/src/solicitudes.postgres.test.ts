import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { UsuarioAutenticado } from './auth/auth.types';
import { NotificacionesService } from './notificaciones.service';
import { PostgresSolicitudesRepository } from './solicitudes.postgres';

const url = process.env.DATABASE_URL;
const mailpit = process.env.MAILPIT_URL;

const USUARIO = '00000000-0000-4000-8000-0000000009b1';
const ABOGADO = '00000000-0000-4000-8000-0000000009b2';
const COORDINADOR = '00000000-0000-4000-8000-0000000009b3';
const ABOGADO_COORD = '00000000-0000-4000-8000-0000000009b4';
const ESPECIALIDAD = '00000000-0000-4000-8000-0000000009b5';
const TIPO = '00000000-0000-4000-8000-0000000009b6';
const CUADRANTE = '00000000-0000-4000-8000-0000000009b7';

const LETRADO: UsuarioAutenticado = {
  id: USUARIO,
  nombre: 'Lucía Prueba',
  colegiado: 'ICAT-9B01',
  abogadoId: ABOGADO,
  rol: 'letrado',
  roles: ['letrado'],
};

const COORDINACION: UsuarioAutenticado = {
  id: COORDINADOR,
  nombre: 'Marta Prueba',
  colegiado: 'ICAT-9B02',
  abogadoId: ABOGADO_COORD,
  rol: 'coordinacion',
  roles: ['coordinacion'],
};

/**
 * Vertical completo contra Postgres: alta de la solicitud, resolución en una
 * transacción, asiento de auditoría, aviso en el outbox y, si hay Mailpit, el
 * correo enviado. Se salta en local sin base de datos.
 */
describe.skipIf(!url)('Solicitudes en Postgres', () => {
  let pool: Pool;
  let repositorio: PostgresSolicitudesRepository;
  let guardiaId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    repositorio = new PostgresSolicitudesRepository(pool);

    await repositorio.asegurarAbogado(LETRADO);
    await repositorio.asegurarAbogado(COORDINACION);

    await pool.query(
      `insert into especialidad (id, codigo, nombre)
       values ($1, 'PRUEBA-SOL', 'Penal (prueba de solicitudes)')
       on conflict (id) do nothing`,
      [ESPECIALIDAD],
    );
    await pool.query(
      `insert into tipo_guardia (id, codigo, especialidad_id, modalidad, hora_inicio, hora_fin)
       values ($1, 'PRUEBA-SOL-DIA', $2, 'presencial', '09:00', '20:00')
       on conflict (id) do nothing`,
      [TIPO, ESPECIALIDAD],
    );

    // Una guardia publicada exige cuadrante (RN-39); sin él no puede pasar de
    // `planificada` y la resolución no podría dejarla descubierta.
    await pool.query(
      `insert into cuadrante (id, anio, periodo, estado)
       values ($1, 2027, '06', 'publicado')
       on conflict (id) do nothing`,
      [CUADRANTE],
    );

    const { rows } = await pool.query<{ id: string }>(
      `insert into guardia (tipo_guardia_id, especialidad_id, abogado_id, cuadrante_id, fecha, hora_inicio, hora_fin, estado, origen)
       values ($1, $2, $3, $4, '2027-06-15', '09:00', '20:00', 'publicada', 'planificacion')
       returning id`,
      [TIPO, ESPECIALIDAD, ABOGADO, CUADRANTE],
    );
    guardiaId = rows[0]!.id;
  });

  afterAll(async () => {
    if (!pool) return;
    // Por destinatario y actor, no solo por referencia: un test borra la
    // solicitud a mitad y su aviso se quedaría huérfano.
    await pool.query('delete from notificacion where usuario_id = any($1::uuid[])', [
      [USUARIO, COORDINADOR],
    ]);
    await pool.query('delete from auditoria where actor_id = any($1::uuid[])', [
      [USUARIO, COORDINADOR],
    ]);
    await pool.query(
      'delete from notificacion where referencia_id in (select id from solicitud where guardia_id = $1)',
      [guardiaId],
    );
    await pool.query(
      'delete from auditoria where entidad_id in (select id from solicitud where guardia_id = $1)',
      [guardiaId],
    );
    await pool.query('delete from solicitud where guardia_id = $1', [guardiaId]);
    await pool.query('delete from guardia where id = $1', [guardiaId]);
    await pool.query('delete from cuadrante where id = $1', [CUADRANTE]);
    await pool.query('delete from tipo_guardia where id = $1', [TIPO]);
    await pool.query('delete from especialidad where id = $1', [ESPECIALIDAD]);
    await pool.query('delete from abogado where id = any($1::uuid[])', [[ABOGADO, ABOGADO_COORD]]);
    await pool.query('delete from usuario where id = any($1::uuid[])', [[USUARIO, COORDINADOR]]);
    await pool.end();
  });

  it('registra la solicitud, la resuelve y deja el aviso en el outbox', async () => {
    const solicitud = await repositorio.crear({
      guardia_id: guardiaId,
      tipo: 'excusa',
      motivo: 'enfermedad',
      detalle: 'Documento aportado',
      sobrevenida: false,
      solicitante_id: ABOGADO,
      extemporanea: false,
    });

    expect(solicitud).toMatchObject({
      estado: 'comunicada',
      solicitante_id: ABOGADO,
      extemporanea: false,
    });

    const resuelta = await repositorio.resolver(
      solicitud.id,
      {
        decision: 'estimar',
        motivo_resolucion: 'Se acredita el supuesto (RN-13)',
        justificar_hueco: false,
      },
      COORDINADOR,
    );

    expect(resuelta).toMatchObject({
      estado: 'estimada',
      resuelta_por: COORDINADOR,
      motivo_resolucion: 'Se acredita el supuesto (RN-13)',
    });

    // La guardia se queda descubierta: se estimó sin sustituto (RN-17).
    const { rows: guardias } = await pool.query<{ estado: string; version: number }>(
      'select estado, version from guardia where id = $1',
      [guardiaId],
    );
    expect(guardias[0]!.estado).toBe('descubierta');
    expect(guardias[0]!.version).toBe(2);

    const { rows: auditoria } = await pool.query(
      `select accion, estado_anterior, estado_nuevo from auditoria where entidad_id = $1`,
      [solicitud.id],
    );
    expect(auditoria[0]).toMatchObject({
      accion: 'resolver',
      estado_anterior: 'comunicada',
      estado_nuevo: 'estimada',
    });

    const { rows: avisos } = await pool.query<{ estado_entrega: string; canal: string }>(
      'select estado_entrega, canal from notificacion where referencia_id = $1',
      [solicitud.id],
    );
    expect(avisos[0]).toMatchObject({ estado_entrega: 'pendiente', canal: 'email' });

    // Con Mailpit levantado, el worker lo envía de verdad.
    if (mailpit) {
      const notificaciones = new NotificacionesService(pool);
      const enviadas = await notificaciones.procesarPendientes();
      expect(enviadas).toBeGreaterThan(0);

      const { rows: despues } = await pool.query<{ estado_entrega: string }>(
        'select estado_entrega from notificacion where referencia_id = $1',
        [solicitud.id],
      );
      expect(despues[0]!.estado_entrega).toBe('enviada');

      const respuesta = await fetch(`${mailpit}/api/v1/messages?limit=50`);
      const cuerpo = (await respuesta.json()) as {
        messages?: { Subject?: string; To?: { Address?: string }[] }[];
      };
      const enMailpit = (cuerpo.messages ?? []).some((mensaje) =>
        (mensaje.Subject ?? '').includes('cambio'),
      );
      expect(enMailpit).toBe(true);
    }
  });

  it('no admite una segunda solicitud abierta para la misma guardia', async () => {
    await pool.query(
      'delete from notificacion where referencia_id in (select id from solicitud where guardia_id = $1)',
      [guardiaId],
    );
    await pool.query(
      'delete from auditoria where entidad_id in (select id from solicitud where guardia_id = $1)',
      [guardiaId],
    );
    await pool.query('delete from solicitud where guardia_id = $1', [guardiaId]);

    const datos = {
      guardia_id: guardiaId,
      tipo: 'excusa' as const,
      motivo: 'otro' as const,
      sobrevenida: false,
      solicitante_id: ABOGADO,
      extemporanea: false,
    };

    await repositorio.crear(datos);
    await expect(repositorio.crear({ ...datos, motivo: 'fuerza_mayor' })).rejects.toThrow(
      'ya tiene una solicitud abierta',
    );
  });
});
