/**
 * Genera apps/api/openapi.json desde los controladores de NestJS.
 * La CI compara el fichero generado con el versionado: si el código cambia
 * el contrato y no se commitea la regeneración, el job falla.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Turno de Oficio · API')
    .setDescription('Contrato generado desde el código')
    .setVersion('0.1.0')
    .build();

  const documento = SwaggerModule.createDocument(app, config);
  await app.close();

  const ordenado = {
    openapi: documento.openapi,
    info: documento.info,
    paths: Object.fromEntries(
      Object.entries(documento.paths).sort(([a], [b]) => a.localeCompare(b)),
    ),
    components: documento.components,
  };

  const destino = join(__dirname, '..', 'openapi.json');
  writeFileSync(destino, `${JSON.stringify(ordenado, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI generado en ${destino}`);
}

void main();
