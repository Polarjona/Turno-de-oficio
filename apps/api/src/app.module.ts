import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { RolesGuard } from './auth/roles.guard';
import { GuardiasController } from './guardias.controller';
import { PostgresGuardiasRepository } from './guardias.postgres';
import { GUARDIAS_REPOSITORIO, MemoriaGuardiasRepository } from './guardias.repository';
import { GuardiasService } from './guardias.service';
import { MeController } from './me.controller';

/**
 * Los dos guards son globales a propósito: una ruta nueva nace protegida y hay
 * que abrirla a propósito con @Roles, nunca al revés.
 *
 * La persistencia se elige aquí y en un solo sitio: con `DATABASE_URL` las
 * guardias viven en Postgres (migración `0001_init.sql`); sin ella, en memoria,
 * que es lo que usan los tests y el arranque rápido.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MeController, GuardiasController],
  providers: [
    GuardiasService,
    {
      provide: GUARDIAS_REPOSITORIO,
      useFactory: () => {
        const cadenaConexion = process.env.DATABASE_URL;
        return cadenaConexion
          ? new PostgresGuardiasRepository(cadenaConexion)
          : new MemoriaGuardiasRepository();
      },
    },
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
