import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

/** Token del pool compartido. Es `null` cuando no hay `DATABASE_URL`. */
export const POOL_POSTGRES = 'POOL_POSTGRES';

/**
 * Un solo pool para toda la API. Sin `DATABASE_URL` vale `null` y los
 * repositorios caen a memoria.
 */
@Injectable()
export class PoolPostgres implements OnModuleDestroy {
  readonly pool: Pool | null;

  constructor() {
    const cadenaConexion = process.env.DATABASE_URL;
    this.pool = cadenaConexion ? new Pool({ connectionString: cadenaConexion, max: 10 }) : null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
