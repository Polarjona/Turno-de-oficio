import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { Pool } from 'pg';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { RolesGuard } from './auth/roles.guard';
import { POOL_POSTGRES, PoolPostgres } from './db';
import { GuardiasController } from './guardias.controller';
import { PostgresGuardiasRepository } from './guardias.postgres';
import { GUARDIAS_REPOSITORIO, MemoriaGuardiasRepository } from './guardias.repository';
import { GuardiasService } from './guardias.service';
import { MeController } from './me.controller';
import { NotificacionesService } from './notificaciones.service';
import { SolicitudesController } from './solicitudes.controller';
import { PostgresSolicitudesRepository } from './solicitudes.postgres';
import { MemoriaSolicitudesRepository, SOLICITUDES_REPOSITORIO } from './solicitudes.repository';
import { SolicitudesService } from './solicitudes.service';

/**
 * Los dos guards son globales a propósito: una ruta nueva nace protegida y hay
 * que abrirla a propósito con @Roles, nunca al revés.
 *
 * La persistencia se elige aquí y en un solo sitio: con `DATABASE_URL` todo va
 * a Postgres (migración `0001_init.sql`); sin ella, a memoria, que es lo que
 * usan los tests y el arranque rápido.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MeController, GuardiasController, SolicitudesController],
  providers: [
    PoolPostgres,
    {
      provide: POOL_POSTGRES,
      useFactory: (poolPostgres: PoolPostgres) => poolPostgres.pool,
      inject: [PoolPostgres],
    },
    {
      provide: GUARDIAS_REPOSITORIO,
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresGuardiasRepository(pool) : new MemoriaGuardiasRepository(),
      inject: [POOL_POSTGRES],
    },
    {
      provide: SOLICITUDES_REPOSITORIO,
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSolicitudesRepository(pool) : new MemoriaSolicitudesRepository(),
      inject: [POOL_POSTGRES],
    },
    GuardiasService,
    SolicitudesService,
    NotificacionesService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
