/**
 * Aplica db/migrations/*.sql, en orden, sobre una base vacía y comprueba que el
 * esquema queda con las 15 tablas del modelo y con las reglas que de verdad
 * importan:
 *
 *   - `ux_guardia_solape` existe y es un `EXCLUDE USING gist` (RN-04).
 *   - El CHECK de `guardia.origen` rechaza un `urgente` con `cuadrante_id`.
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

    // 4. Las reglas que el motor tiene que hacer cumplir.
    await comprobarSolape(cliente);
    await comprobarUrgenteConCuadrante(cliente);
  } finally {
    await cliente.end();
  }

  // 5. Limpieza: la base de la comprobación no se queda por ahí.
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
