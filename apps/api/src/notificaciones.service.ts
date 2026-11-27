import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { POOL_POSTGRES } from './db';

interface NotificacionPendiente {
  id: string;
  usuario_id: string;
  tipo: string;
  referencia_tipo: string;
  referencia_id: string | null;
  email: string;
}

/**
 * Outbox de notificaciones.
 *
 * La fila se escribe en la misma transacción que la resolución (así no se
 * pierde el aviso si el envío falla) y este servicio la manda después. En
 * desarrollo el destino es Mailpit, que expone un envío por HTTP; en producción
 * sería el SMTP del Colegio, sin tocar el resto del flujo.
 */
@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);
  private readonly urlMailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  private intervalo?: NodeJS.Timeout;

  constructor(@Inject(POOL_POSTGRES) private readonly pool: Pool | null) {}

  onModuleInit(): void {
    if (!this.pool || !process.env.MAILPIT_URL) {
      // Sin base o sin Mailpit configurado no se arranca el worker: en los
      // tests no queremos un temporizador enviando correos.
      return;
    }
    this.intervalo = setInterval(() => void this.procesarPendientes(), 5000);
    this.intervalo.unref?.();
  }

  /** Envía las notificaciones pendientes y devuelve cuántas han salido. */
  async procesarPendientes(limite = 20): Promise<number> {
    if (!this.pool) return 0;

    const { rows } = await this.pool.query<NotificacionPendiente>(
      `
        select n.id, n.usuario_id, n.tipo, n.referencia_tipo, n.referencia_id, u.email
        from notificacion n
        join usuario u on u.id = n.usuario_id
        where n.estado_entrega = 'pendiente' and n.canal = 'email'
        order by n.creado_en
        limit $1
      `,
      [limite],
    );

    let enviadas = 0;
    for (const aviso of rows) {
      try {
        await this.enviar(aviso);
        await this.pool.query(
          `update notificacion set estado_entrega = 'enviada', fecha_envio = now()
           where id = $1 and estado_entrega = 'pendiente'`,
          [aviso.id],
        );
        enviadas += 1;
      } catch (error) {
        this.logger.warn(`No se pudo enviar la notificación ${aviso.id}: ${String(error)}`);
        await this.pool.query(`update notificacion set estado_entrega = 'error' where id = $1`, [
          aviso.id,
        ]);
      }
    }

    return enviadas;
  }

  private async enviar(aviso: NotificacionPendiente): Promise<void> {
    const respuesta = await fetch(`${this.urlMailpit}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: 'no-reply@turno-oficio.test', Name: 'Turno de Oficio' },
        To: [{ Email: aviso.email }],
        Subject: `Turno de Oficio · ${aviso.tipo}`,
        Text: `Aviso sobre ${aviso.referencia_tipo} ${aviso.referencia_id ?? ''}.`.trim(),
      }),
    });

    if (!respuesta.ok) {
      throw new Error(`Mailpit respondió ${respuesta.status}`);
    }
  }
}
