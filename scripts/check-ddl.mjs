/**
 * Aplica db/migrations/*.sql, en orden, sobre una base vacía y comprueba que el
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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const TABLAS_ESPERADAS = 15;
const BASE_DE_PRUEBA = 'ddl_check';
const MIGRACIONES = fileURLToPath(new URL('../db/migrations/', import.meta.url));

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
    // 2. Las migraciones, en orden y tal cual están versionadas. Solo los .sql de
    //    primer nivel: `down/` es el reverso y no debe aplicarse aquí.
    const ficheros = readdirSync(MIGRACIONES)
      .filter((nombre) => nombre.endsWith('.sql'))
      .sort();

    if (ficheros.length === 0) {
      throw new Error(`no hay migraciones en ${MIGRACIONES}`);
    }

    for (const fichero of ficheros) {
      console.log(`  aplicando ${fichero}`);
      await cliente.query(readFileSync(join(MIGRACIONES, fichero), 'utf8'));
    }

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
