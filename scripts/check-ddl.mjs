/**
 * Aplica db/migrations/*.sql, en orden, sobre una base vacía y comprueba que el
 * esquema queda con las 15 tablas del modelo y con las reglas que de verdad
 * importan:
 *
 *   - `ux_guardia_solape` existe y es un `EXCLUDE USING gist` (RN-04).
 *   - El CHECK de `guardia.origen` rechaza un `urgente` con `cuadrante_id`.
 *
 * Después hace el camino de vuelta: aplica los reversos de db/migrations/down/,
 * comprueba que no queda ninguna tabla y vuelve a subir, para que una migración
 * que no se pueda deshacer o que no se pueda reaplicar se vea en la CI y no al
 * levantar el entorno.
 *
 *   DATABASE_URL=postgres://turno:turno@localhost:5432/turno npm run check:ddl
 *
 * Usa una base aparte (`ddl_check`) para no tocar la de los tests, y la borra al
 * terminar. Se ejecuta con el cliente `pg` y no con `psql` para no depender de
 * que el runner lo traiga instalado.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const TABLAS_ESPERADAS = 15;
const BASE_DE_PRUEBA = 'ddl_check';
const MIGRACIONES = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const REVERSOS = join(MIGRACIONES, 'down');

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

/** Los .sql de un directorio, ordenados. `down/` se queda fuera por no ser .sql. */
function migraciones(directorio) {
  if (!existsSync(directorio)) {
    return [];
  }
  return readdirSync(directorio)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();
}

async function aplicar(cliente, directorio, ficheros) {
  for (const fichero of ficheros) {
    console.log(`  aplicando ${fichero}`);
    await cliente.query(readFileSync(join(directorio, fichero), 'utf8'));
  }
}

async function tablasDe(cliente) {
  const { rows } = await cliente.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return rows.map((fila) => fila.table_name);
}

/** RN-04: el solape lo tiene que impedir el motor, no una consulta de la API. */
async function comprobarSolape(cliente) {
  const { rows } = await cliente.query(
    `select contype, pg_get_constraintdef(oid) as definicion
       from pg_constraint
      where conname = 'ux_guardia_solape'
        and conrelid = 'guardia'::regclass`,
  );

  if (rows.length !== 1) {
    throw new Error('no existe la restricción ux_guardia_solape en la tabla guardia');
  }

  const [restriccion] = rows;
  const esExclude = restriccion.contype === 'x';
  const usaGist = /exclude using gist/i.test(restriccion.definicion);

  if (!esExclude || !usaGist) {
    throw new Error(`ux_guardia_solape no es un EXCLUDE USING gist: ${restriccion.definicion}`);
  }

  console.log(`  ux_guardia_solape: ${restriccion.definicion}`);
}

/**
 * Lo urgente va fuera de cuadrante y lo demás dentro. Se prueba de verdad: se
 * montan las filas mínimas y se intenta el INSERT que la regla debe rechazar.
 * Todo va en una transacción que se deshace, así que la base queda como estaba.
 */
async function comprobarUrgenteConCuadrante(cliente) {
  await cliente.query('begin');

  try {
    await cliente.query(`
      insert into especialidad (codigo, nombre) values ('CHECK', 'Comprobación');
      insert into usuario (nombre, apellidos, email, password_hash, rol)
        values ('Check', 'CI', 'check@example.test', 'x', 'coordinacion');
      insert into abogado (usuario_id, num_colegiado)
        select id, 'CI-0001' from usuario where email = 'check@example.test';
      insert into tipo_guardia (codigo, especialidad_id, modalidad, hora_inicio, hora_fin)
        select 'CI-ORD', id, 'presencial', '09:00', '20:00' from especialidad where codigo = 'CHECK';
      insert into cuadrante (anio, periodo) values (2026, 'CI');
    `);

    let rechazado = false;
    let mensaje = '';

    try {
      await cliente.query(`
        insert into guardia (tipo_guardia_id, especialidad_id, abogado_id, cuadrante_id,
                             fecha, hora_inicio, hora_fin, estado, origen)
        select t.id, t.especialidad_id, a.id, c.id, '2026-12-05', '09:00', '20:00',
               'planificada', 'urgente'
        from tipo_guardia t, abogado a, cuadrante c;
      `);
    } catch (error) {
      rechazado = error.code === '23514' || /check constraint/i.test(error.message);
      mensaje = error.message;
    }

    if (!rechazado) {
      throw new Error('el CHECK de guardia.origen ha aceptado un urgente con cuadrante_id');
    }

    console.log(
      `  CHECK guardia.origen: rechaza el urgente con cuadrante (${mensaje.split('\n')[0]})`,
    );
  } finally {
    await cliente.query('rollback');
  }
}

/**
 * El reverso tiene que deshacer todo y la migración tiene que poder volver a
 * aplicarse. Se exige un `.down.sql` por migración: una que no se pueda deshacer
 * es un problema, no una comodidad.
 */
async function comprobarReverso(cliente, ficheros) {
  const disponibles = new Set(migraciones(REVERSOS));
  const pasos = [...ficheros].reverse().map((fichero) => ({
    subida: fichero,
    reverso: fichero.replace(/\.sql$/, '.down.sql'),
  }));

  const sinReverso = pasos.filter((paso) => !disponibles.has(paso.reverso));
  if (sinReverso.length > 0) {
    throw new Error(
      `falta el reverso en db/migrations/down/: ${sinReverso.map((paso) => paso.reverso).join(', ')}`,
    );
  }

  for (const paso of pasos) {
    console.log(`  revirtiendo con ${paso.reverso}`);
    await cliente.query(readFileSync(join(REVERSOS, paso.reverso), 'utf8'));
  }

  const trasBajar = await tablasDe(cliente);
  if (trasBajar.length !== 0) {
    throw new Error(
      `el reverso deja ${trasBajar.length} tabla(s): ${trasBajar.join(', ') || 'ninguna'}`,
    );
  }
  console.log('  reverso: 0 tablas');

  await aplicar(cliente, MIGRACIONES, ficheros);
  const trasSubir = await tablasDe(cliente);
  if (trasSubir.length !== TABLAS_ESPERADAS) {
    throw new Error(
      `al reaplicar quedan ${trasSubir.length} tabla(s) y se esperaban ${TABLAS_ESPERADAS}`,
    );
  }
  console.log(`  reaplicado: ${trasSubir.length} tablas`);
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
    // 2. Las migraciones, en orden y tal cual están versionadas.
    const ficheros = migraciones(MIGRACIONES);

    if (ficheros.length === 0) {
      throw new Error(`no hay migraciones en ${MIGRACIONES}`);
    }

    await aplicar(cliente, MIGRACIONES, ficheros);

    // 3. ¿Están las 15 tablas?
    const tablas = await tablasDe(cliente);

    if (tablas.length !== TABLAS_ESPERADAS) {
      console.error(
        `Tablas creadas: ${tablas.length} · esperadas: ${TABLAS_ESPERADAS}\n  ${tablas.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(`DDL: ${tablas.length} tablas desde una base vacía.`);
    console.log(`  ${tablas.join(', ')}`);

    // 4. Las reglas que el motor tiene que hacer cumplir.
    await comprobarSolape(cliente);
    await comprobarUrgenteConCuadrante(cliente);

    // 5. Y el camino de vuelta.
    await comprobarReverso(cliente, ficheros);
  } finally {
    await cliente.end();
  }

  // 6. Limpieza: la base de la comprobación no se queda por ahí.
  const limpieza = await conectar(url.toString());
  try {
    await limpieza.query(`drop database if exists ${BASE_DE_PRUEBA}`);
  } finally {
    await limpieza.end();
  }
}

main().catch((error) => {
  console.error(`Fallo la comprobación del DDL: ${error.message}`);
  process.exitCode = 1;
});
