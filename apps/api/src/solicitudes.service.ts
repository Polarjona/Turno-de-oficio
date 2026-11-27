import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  FiltrosSolicitudes,
  PaginaSolicitudes,
  ResolucionRequest,
  Solicitud,
  SolicitudRequest,
} from '@turno/shared';

import type { UsuarioAutenticado } from './auth/auth.types';
import { SOLICITUDES_REPOSITORIO, type SolicitudesRepository } from './solicitudes.repository';

/** Materias en las que cabe la excusa del art. 31 de la Ley 1/1996 (RN-36). */
const MATERIAS_CON_EXCUSA = ['PEN', 'PENAL', 'VIOLENCIA', 'MENORES'];

/** Días naturales de antelación por debajo de los cuales la excusa es extemporánea. */
const DIAS_ANTELACION = 3;

@Injectable()
export class SolicitudesService {
  constructor(
    @Inject(SOLICITUDES_REPOSITORIO) private readonly repositorio: SolicitudesRepository,
  ) {}

  listar(filtros: Partial<FiltrosSolicitudes> = {}): Promise<PaginaSolicitudes> {
    return this.repositorio.listar(filtros);
  }

  async detalle(id: string): Promise<Solicitud> {
    const solicitud = await this.repositorio.detalle(id);
    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    return solicitud;
  }

  async crear(datos: SolicitudRequest, usuario: UsuarioAutenticado): Promise<Solicitud> {
    if (!usuario.abogadoId) {
      throw new ForbiddenException('El token no identifica al abogado que presenta la solicitud');
    }

    await this.repositorio.asegurarAbogado(usuario);

    const guardia = await this.repositorio.guardiaParaSolicitud(datos.guardia_id);
    if (!guardia) {
      throw new NotFoundException('Guardia no encontrada');
    }

    // RN-36: la excusa solo se admite en el orden penal (y materias asimiladas).
    if (
      datos.tipo === 'excusa' &&
      !MATERIAS_CON_EXCUSA.includes(guardia.especialidadCodigo.toUpperCase())
    ) {
      throw new UnprocessableEntityException({
        code: 'REGLA_NEGOCIO',
        regla: 'RN-36',
        title: 'La excusa solo cabe en el orden penal',
        detail: `La guardia es de ${guardia.especialidadCodigo}; el art. 31 de la Ley 1/1996 no ampara la excusa en esta materia.`,
      });
    }

    return this.repositorio.crear({
      ...datos,
      solicitante_id: usuario.abogadoId,
      extemporanea: esExtemporanea(guardia.fecha),
    });
  }

  async resolver(
    id: string,
    resolucion: ResolucionRequest,
    usuario: UsuarioAutenticado,
  ): Promise<Solicitud> {
    await this.repositorio.asegurarAbogado(usuario);
    return this.repositorio.resolver(id, resolucion, usuario.id);
  }
}

/** RN-12: se registra la extemporaneidad, no se oculta. */
export function esExtemporanea(fechaGuardia: string, ahora = new Date()): boolean {
  const fecha = new Date(`${fechaGuardia}T00:00:00Z`);
  const limite = new Date(ahora.getTime() + DIAS_ANTELACION * 24 * 3600 * 1000);
  return fecha < limite;
}
