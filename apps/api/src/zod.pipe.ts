import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Valida el cuerpo con un esquema de `packages/shared` (los mismos que usa la
 * web) y devuelve 400 con el detalle de los campos mal puestos.
 *
 * Se instancia en el decorador: `@Body(new ZodPipe(GuardiaRequestSchema))`.
 */
export class ZodPipe implements PipeTransform {
  constructor(private readonly esquema: ZodTypeAny) {}

  transform(valor: unknown): unknown {
    const resultado = this.esquema.safeParse(valor);

    if (!resultado.success) {
      throw new BadRequestException({
        message: 'Cuerpo de la petición inválido',
        errores: resultado.error.issues.map(
          (problema) => `${problema.path.join('.') || '(raíz)'}: ${problema.message}`,
        ),
      });
    }

    return resultado.data;
  }
}
