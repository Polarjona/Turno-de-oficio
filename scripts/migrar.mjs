/**
 * Aplica db/migrations/*.sql, en orden, sobre la base de DATABASE_URL.
 *
 * Lo usan la CI antes de los tests de integración (el service container nace
 * vacío) y cualquiera en local cuando no quiere levantar el stack entero.
 * Las migraciones están escritas para poder repetirse, así que es idempotente.
 *
 *   DATABASE_URL=postgres://turno:turno@localhost:5432/turno npm run migrar
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const DIRECTORIO = fileURLToPath(new URL('../db/migrations/', import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('falta DATABASE_URL');
  }

  // Solo los .sql de primer nivel: `down/` es el reverso y no se aplica aquí.
  const ficheros = readdirSync(DIRECTORIO)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();

  if (ficheros.length === 0) {
    throw new Error(`no hay migraciones en ${DIRECTORIO}`);
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  try {
    for (const fichero of ficheros) {
      console.log(`  aplicando ${fichero}`);
      await cliente.query(readFileSync(join(DIRECTORIO, fichero), 'utf8'));
    }
  } finally {
    await cliente.end();
  }

  console.log(`${ficheros.length} migración(es) aplicadas.`);
}

main().catch((error) => {
  console.error(`No se pudieron aplicar las migraciones: ${error.message}`);
  process.exitCode = 1;
});
