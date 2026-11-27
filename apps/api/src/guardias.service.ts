import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FiltrosGuardias, Guardia, GuardiaRequest, PaginaGuardias } from '@turno/shared';

import { GUARDIAS_REPOSITORIO, type GuardiasRepository } from './guardias.repository';

/**
 * Reglas de las guardias sobre el repositorio inyectado.
 *
 * Con `DATABASE_URL` el repositorio es Postgres (`guardias.postgres.ts`); sin
 * ella, memoria. El controlador no lo sabe: solo ve esta clase.
 */
@Injectable()
export class GuardiasService {
  constructor(@Inject(GUARDIAS_REPOSITORIO) private readonly repositorio: GuardiasRepository) {}

  listar(filtros: Partial<FiltrosGuardias> = {}): Promise<PaginaGuardias> {
    return this.repositorio.listar(filtros);
  }

  contar(filtros: Partial<FiltrosGuardias> = {}): Promise<number> {
    return this.repositorio.contar(filtros);
  }

  async detalle(id: string): Promise<Guardia> {
    const guardia = await this.repositorio.detalle(id);
    if (!guardia) {
      throw new NotFoundException('Guardia no encontrada');
    }
    return guardia;
  }

  crear(
    datos: GuardiaRequest,
    claveIdempotencia?: string,
  ): Promise<{ guardia: Guardia; creada: boolean }> {
    return this.repositorio.crear(datos, claveIdempotencia);
  }
}
