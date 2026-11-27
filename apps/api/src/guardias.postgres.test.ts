import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresGuardiasRepository } from './guardias.postgres';

const url = process.env.DATABASE_URL;

const ESPECIALIDAD = '00000000-0000-4000-8000-0000000008a1';
const TIPO = '00000000-0000-4000-8000-0000000008a2';

/**
 * Integración real contra la migración `0001_init.sql`.
 *
 * En local no hay Postgres y el bloque se salta; en la CI corre contra el
 * service container que ya tiene la migración aplicada.
 */
describe.skipIf(!url)('Guardias en Postgres', () => {
  let pool: Pool;
  let repositorio: PostgresGuardiasRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(
      `insert into especialidad (id, codigo, nombre)
       values ($1, 'PRUEBA-PEN', 'Penal (prueba)')
       on conflict (id) do nothing`,
      [ESPECIALIDAD],
    );
    await pool.query(
      `insert into tipo_guardia (id, codigo, especialidad_id, modalidad, hora_inicio, hora_fin)
       values ($1, 'PRUEBA-PEN-DIA', $2, 'presencial', '09:00', '20:00')
       on conflict (id) do nothing`,
      [TIPO, ESPECIALIDAD],
    );
    repositorio = new PostgresGuardiasRepository(url!);
  });

  afterAll(async () => {
    await repositorio?.cerrar();
    await pool?.query('delete from guardia where tipo_guardia_id = $1', [TIPO]);
    await pool?.end();
  });

  it('crea una franja planificada y la devuelve por detalle', async () => {
    const { guardia, creada } = await repositorio.crear({
      tipo_guardia_id: TIPO,
      especialidad_id: ESPECIALIDAD,
      fecha: '2027-03-01',
      hora_inicio: '09:00',
      hora_fin: '20:00',
      es_detenido: false,
    });

    expect(creada).toBe(true);
    expect(guardia).toMatchObject({
      estado: 'planificada',
      origen: 'planificacion',
      abogado_id: null,
      fecha: '2027-03-01',
      hora_inicio: '09:00',
      hora_fin: '20:00',
    });

    expect(await repositorio.detalle(guardia.id)).toEqual(guardia);
  });

  it('devuelve 409 al repetir la franja', async () => {
    await expect(
      repositorio.crear({
        tipo_guardia_id: TIPO,
        especialidad_id: ESPECIALIDAD,
        fecha: '2027-03-01',
        hora_inicio: '10:00',
        hora_fin: '21:00',
        es_detenido: false,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('la misma Idempotency-Key devuelve la guardia ya creada', async () => {
    const datos = {
      tipo_guardia_id: TIPO,
      especialidad_id: ESPECIALIDAD,
      fecha: '2027-03-02',
      hora_inicio: '09:00',
      hora_fin: '20:00',
      es_detenido: false,
    };

    const primera = await repositorio.crear(datos, 'prueba-idempotencia-0001');
    const segunda = await repositorio.crear(datos, 'prueba-idempotencia-0001');

    expect(primera.creada).toBe(true);
    expect(segunda.creada).toBe(false);
    expect(segunda.guardia.id).toBe(primera.guardia.id);
    await pool.query('delete from idempotencia_guardia where clave = $1', [
      'prueba-idempotencia-0001',
    ]);
  });

  it('filtra por tipo, estado y abogado, y cuenta igual que la página', async () => {
    const filtros = { tipo_guardia_id: TIPO, estado: ['planificada' as const] };
    const pagina = await repositorio.listar(filtros);

    expect(pagina.data.length).toBeGreaterThan(0);
    expect(await repositorio.contar(filtros)).toBe(pagina.data.length);
    expect(await repositorio.listar({ ...filtros, abogado_id: ESPECIALIDAD })).toMatchObject({
      data: [],
    });
  });
});
