/**
 * Aplica db/migrations/0001_init.sql sobre una base vacía y comprueba que el
 * esquema queda con las 15 tablas del modelo.
 *
 * Existe porque la migración solo se probaba a mano: una futura que no aplique
 * (una FK mal puesta, un CHECK que no compila, un orden de tablas roto) se
 * llevaría por delante el arranque del entorno sin que la CI se enterase.
 *
 *   DATABASE_URL=postgres://turno:turno@localhost:5432/turno npm run check:ddl
 *
 * Usa una base aparte (`ddl_check`) para no tocar la de los tests, y la borra al
 * terminar. Se ejecuta con el cliente `pg` y no con `psql` para no depender de
 * que el runner lo traiga instalado.
 */
import { readFileSync } from 'node:fs';

import { Client } from 'pg';

const TABLAS_ESPERADAS = 15;
const BASE_DE_PRUEBA = 'ddl_check';
const MIGRACION = new URL('../db/migrations/0001_init.sql', import.meta.url);

const url = new URL(process.env.DATABASE_URL ?? 'postgres://turno:turno@localhost:5432/turno');

/** Misma conexión, apuntando a otra base. */
function conBase(anterior, base) {
  const copia = new URL(anterior.toString());
  copia.pathname = `/${base}`;
  return copia.toString();
}

async function conectar(cadena) {
  const cliente = new Client({ connectionString: cadena });
  await cliente.connect();
  return cliente;
}

async function main() {
  // 1. Base limpia. `drop database` no puede ir dentro de una transacción.
  const admin = await conectar(url.toString());
  try {
    await admin.query(`drop database if exists ${BASE_DE_PRUEBA}`);
    await admin.query(`create database ${BASE_DE_PRUEBA}`);
  } finally {
    await admin.end();
  }

  const cliente = await conectar(conBase(url, BASE_DE_PRUEBA));

  try {
    // 2. La migración, tal cual está versionada.
    const sql = readFileSync(MIGRACION, 'utf8');
    await cliente.query(sql);

    // 3. ¿Están las 15 tablas?
    const { rows } = await cliente.query(
      `select table_name
         from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    const tablas = rows.map((fila) => fila.table_name);

    if (tablas.length !== TABLAS_ESPERADAS) {
      console.error(
        `Tablas creadas: ${tablas.length} · esperadas: ${TABLAS_ESPERADAS}\n  ${tablas.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(`DDL: ${tablas.length} tablas desde una base vacía.`);
    console.log(`  ${tablas.join(', ')}`);
  } finally {
    await cliente.end();
  }

  // 4. Limpieza: la base de la comprobación no se queda por ahí.
  const limpieza = await conectar(url.toString());
  try {
    await limpieza.query(`drop database if exists ${BASE_DE_PRUEBA}`);
  } finally {
    await limpieza.end();
  }
}

main().catch((error) => {
  console.error(`El DDL no se pudo aplicar: ${error.message}`);
  process.exitCode = 1;
});
