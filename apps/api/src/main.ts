import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Turno de Oficio · API')
    .setDescription(
      'Contrato generado desde el código (entregables/Backend/openapi.yaml es la referencia)',
    )
    .setVersion('0.1.0')
    .build();

  SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(Number(process.env.PORT ?? 3101));
}

void main();
