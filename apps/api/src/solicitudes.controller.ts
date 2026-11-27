import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  ResolucionRequestSchema,
  SolicitudesQuerySchema,
  type FiltrosSolicitudes,
  type PaginaSolicitudes,
  type ResolucionRequest,
  type Solicitud,
  type SolicitudRequest,
} from '@turno/shared';
import { SolicitudRequestSchema } from '@turno/shared';

import type { UsuarioAutenticado } from './auth/auth.types';
import { Roles } from './auth/roles.decorator';
import { UsuarioActual } from './auth/usuario-actual.decorator';
import { SolicitudesService } from './solicitudes.service';
import { ZodPipe } from './zod.pipe';

interface RespuestaConCabeceras {
  setHeader(nombre: string, valor: string): void;
}

@ApiTags('solicitudes')
@ApiBearerAuth()
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Get()
  @ApiOperation({ summary: 'Excusas, permutas y sustituciones' })
  @ApiQuery({
    name: 'estado',
    required: false,
    description: 'Repetible: estado=comunicada&estado=en_revision',
    schema: { type: 'array', items: { type: 'string' } },
  })
  @ApiQuery({
    name: 'tipo',
    required: false,
    schema: { type: 'string', enum: ['excusa', 'permuta', 'sustitucion'] },
  })
  @ApiQuery({ name: 'guardia_id', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'solicitante_id',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({ name: 'solo_vencidas', required: false, schema: { type: 'boolean', default: false } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor opaco de la página anterior' })
  @ApiOkResponse({ description: 'Página de solicitudes' })
  listar(
    @Query(new ZodPipe(SolicitudesQuerySchema)) filtros: FiltrosSolicitudes,
  ): Promise<PaginaSolicitudes> {
    return this.solicitudes.listar(filtros);
  }

  @Post()
  @Roles('letrado')
  @ApiOperation({ summary: 'Registra excusa, permuta o sustitución' })
  @ApiCreatedResponse({ description: 'Solicitud registrada' })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple SolicitudRequest' })
  @ApiForbiddenResponse({ description: 'Solo el letrado titular presenta solicitudes' })
  @ApiNotFoundResponse({ description: 'La guardia no existe' })
  @ApiConflictResponse({ description: 'La guardia ya tiene una solicitud abierta' })
  @ApiUnprocessableEntityResponse({ description: 'Regla de negocio: excusa fuera del orden penal' })
  async crear(
    @Body(new ZodPipe(SolicitudRequestSchema)) datos: SolicitudRequest,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ): Promise<Solicitud> {
    const solicitud = await this.solicitudes.crear(datos, usuario);
    respuesta.setHeader('Location', `/solicitudes/${solicitud.id}`);
    return solicitud;
  }

  @Get(':solicitudId')
  @ApiOperation({ summary: 'Detalle de una solicitud' })
  @ApiParam({ name: 'solicitudId', description: 'Identificador de la solicitud' })
  @ApiOkResponse({ description: 'Solicitud encontrada' })
  @ApiNotFoundResponse({ description: 'La solicitud no existe' })
  detalle(@Param('solicitudId') solicitudId: string): Promise<Solicitud> {
    return this.solicitudes.detalle(solicitudId);
  }

  @Post(':solicitudId/resolucion')
  @Roles('coordinacion', 'junta', 'admin')
  @ApiOperation({ summary: 'Resuelve la solicitud con motivación obligatoria' })
  @ApiParam({ name: 'solicitudId', description: 'Identificador de la solicitud' })
  @ApiOkResponse({ description: 'Solicitud resuelta' })
  @ApiBadRequestResponse({ description: 'Falta la decisión o el motivo de la resolución' })
  @ApiForbiddenResponse({ description: 'El rol no puede resolver solicitudes' })
  @ApiConflictResponse({ description: 'La solicitud ya estaba resuelta' })
  resolver(
    @Param('solicitudId') solicitudId: string,
    @Body(new ZodPipe(ResolucionRequestSchema)) resolucion: ResolucionRequest,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<Solicitud> {
    return this.solicitudes.resolver(solicitudId, resolucion, usuario);
  }
}
