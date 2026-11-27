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

  async listar(
    filtros: Partial<FiltrosSolicitudes>,
    usuario: UsuarioAutenticado,
  ): Promise<PaginaSolicitudes> {
    return this.repositorio.listar(acotarAlUsuario(filtros, usuario));
  }

  async detalle(id: string, usuario: UsuarioAutenticado): Promise<Solicitud> {
    const solicitud = await this.repositorio.detalle(id);
    // Un letrado no ve el expediente de otro: mismo 404 que si no existiera,
    // para no confirmar siquiera que está ahí.
    if (!solicitud || (usuario.rol === 'letrado' && !esSuya(solicitud, usuario))) {
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

    // Solo el titular se excusa de su propia guardia: nadie presenta por otro.
    if (guardia.abogadoId !== usuario.abogadoId) {
      throw new ForbiddenException('Solo el letrado titular puede presentar la solicitud');
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

/**
 * Un letrado solo ve sus propias solicitudes: el motivo es dato de salud y no
 * tiene por qué llegar al resto de la bolsa. Coordinación, junta y admin ven
 * todas.
 */
function acotarAlUsuario(
  filtros: Partial<FiltrosSolicitudes>,
  usuario: UsuarioAutenticado,
): Partial<FiltrosSolicitudes> {
  if (usuario.rol !== 'letrado') {
    return filtros;
  }
  if (!usuario.abogadoId) {
    throw new ForbiddenException('El token no identifica al abogado');
  }
  if (filtros.solicitante_id && filtros.solicitante_id !== usuario.abogadoId) {
    throw new ForbiddenException('Un letrado solo puede consultar sus propias solicitudes');
  }
  return { ...filtros, solicitante_id: usuario.abogadoId };
}

function esSuya(solicitud: Solicitud, usuario: UsuarioAutenticado): boolean {
  return solicitud.solicitante_id === usuario.abogadoId;
}

/** RN-12: se registra la extemporaneidad, no se oculta. */
export function esExtemporanea(fechaGuardia: string, ahora = new Date()): boolean {
  const fecha = new Date(`${fechaGuardia}T00:00:00Z`);
  const limite = new Date(ahora.getTime() + DIAS_ANTELACION * 24 * 3600 * 1000);
  return fecha < limite;
}
