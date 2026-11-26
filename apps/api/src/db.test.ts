import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;

// En local no hay Postgres: la prueba se salta. En la CI corre contra el
// service container de Postgres 16.
describe.skipIf(!url)('conexión con Postgres', () => {
  it('responde a una consulta trivial', async () => {
    const cliente = new Client({ connectionString: url });
    await cliente.connect();
    const resultado = await cliente.query<{ uno: number }>('select 1 as uno');
    await cliente.end();
    expect(resultado.rows[0]).toEqual({ uno: 1 });
  });
});
