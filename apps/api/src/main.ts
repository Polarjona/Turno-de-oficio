import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // La web (Next en :3000) llama a la API desde el navegador con el token del
  // usuario; sin esto el navegador bloquea las peticiones por CORS.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });

  const config = new DocumentBuilder()
    .setTitle('Turno de Oficio · API')
    .setDescription(
      'Contrato generado desde el código (entregables/Backend/openapi.yaml es la referencia)',
    )
    .setVersion('0.1.0')
    // Sin esto, @ApiBearerAuth() deja en el JSON un `security: [{ bearer: [] }]`
    // que apunta a un esquema que nadie declara: el documento no es válido y
    // Swagger UI no ofrece el botón de autorizar.
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(Number(process.env.PORT ?? 3101));
}

void main();
