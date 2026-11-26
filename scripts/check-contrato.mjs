/**
 * Comprueba que el contrato generado desde NestJS (apps/api/openapi.json)
 * no se sale de lo entregado en entregables/Backend/openapi.yaml.
 *
 * Falla si el código implementa un endpoint que no está en el contrato:
 * el contrato aprobado manda, no el código.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const raiz = process.cwd();
const generado = JSON.parse(readFileSync(join(raiz, 'apps/api/openapi.json'), 'utf8'));
const contrato = parse(readFileSync(join(raiz, 'entregables/Backend/openapi.yaml'), 'utf8'));

const rutasContrato = new Set(Object.keys(contrato.paths ?? {}));
const rutasCodigo = Object.keys(generado.paths ?? {});

const fueraDeContrato = rutasCodigo.filter((ruta) => !rutasContrato.has(ruta));
const pendientes = [...rutasContrato].filter((ruta) => !rutasCodigo.includes(ruta));

if (fueraDeContrato.length > 0) {
  console.error('Endpoints implementados que NO están en el contrato entregado:');
  for (const ruta of fueraDeContrato) {
    console.error(`  - ${ruta}`);
  }
  console.error('Añádelos primero a entregables/Backend/openapi.yaml (y a su entregable en PDF).');
  process.exit(1);
}

console.log(
  `Contrato: ${rutasCodigo.length} endpoint(s) implementados, todos dentro del contrato.`,
);
console.log(
  `Pendientes de implementar (${pendientes.length}): ${pendientes.join(', ') || 'ninguno'}`,
);
