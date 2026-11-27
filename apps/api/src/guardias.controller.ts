import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
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
} from '@nestjs/swagger';
import {
  GuardiaRequestSchema,
  GuardiasQuerySchema,
  type FiltrosGuardias,
  type Guardia,
  type GuardiaRequest,
  type PaginaGuardias,
} from '@turno/shared';

import type { UsuarioAutenticado } from './auth/auth.types';
import { Roles } from './auth/roles.decorator';
import { UsuarioActual } from './auth/usuario-actual.decorator';
import { GuardiasService } from './guardias.service';
import { ZodPipe } from './zod.pipe';

/**
 * Un letrado solo ve sus guardias: el contrato fuerza `abogado_id` al propio
 * cuando el rol es `letrado`. El resto de roles filtra por quien quieran.
 *
 * Si el token no trae `abogado_id` (usuario sin registro de abogado) no se
 * fuerza nada: es mejor devolver la lista que romper la consulta.
 */
export function filtrosParaUsuario(
  filtros: FiltrosGuardias,
  usuario: UsuarioAutenticado,
): FiltrosGuardias {
  if (usuario.rol !== 'letrado' || !usuario.abogadoId) {
    return filtros;
  }

  if (filtros.abogado_id && filtros.abogado_id !== usuario.abogadoId) {
    throw new ForbiddenException('Un letrado solo puede consultar sus propias guardias');
  }

  return { ...filtros, abogado_id: usuario.abogadoId };
}

/** Lo mínimo que se usa de la respuesta de Express, sin atarse a sus tipos. */
interface RespuestaConCabeceras {
  setHeader(nombre: string, valor: string): void;
}

@ApiTags('guardias')
@ApiBearerAuth()
@Controller('guardias')
export class GuardiasController {
  constructor(private readonly guardias: GuardiasService) {}

  @Get()
  @ApiOperation({ summary: 'Guardias del periodo con filtros' })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha inicial inclusive (AAAA-MM-DD)' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha final inclusive (AAAA-MM-DD)' })
  @ApiQuery({
    name: 'estado',
    required: false,
    description: 'Repetible: estado=planificada&estado=publicada',
    schema: { type: 'array', items: { type: 'string' } },
  })
  @ApiQuery({
    name: 'especialidad_id',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'tipo_guardia_id',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'abogado_id',
    required: false,
    schema: { type: 'string', format: 'uuid' },
    description: 'Si no se indica y el rol es letrado, se fuerza al propio',
  })
  @ApiQuery({
    name: 'solo_descubiertas',
    required: false,
    schema: { type: 'boolean', default: false },
  })
  @ApiQuery({
    name: 'solo_detenido',
    required: false,
    schema: { type: 'boolean', default: false },
    description: 'Franjas de asistencia al detenido (RN-35)',
  })
  @ApiQuery({
    name: 'orden',
    required: false,
    schema: { type: 'string', enum: ['fecha_asc', 'fecha_desc'], default: 'fecha_asc' },
  })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor opaco de la página anterior' })
  @ApiOkResponse({
    description: 'Página de guardias',
    headers: {
      'X-Total-Estimado': {
        description: 'Guardias que cumplen los filtros',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Filtro o cursor inválido' })
  listar(
    @Query(new ZodPipe(GuardiasQuerySchema)) filtros: FiltrosGuardias,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ): PaginaGuardias {
    const efectivos = filtrosParaUsuario(filtros, usuario);
    respuesta.setHeader('X-Total-Estimado', String(this.guardias.contar(efectivos)));
    return this.guardias.listar(efectivos);
  }

  @Post()
  @Roles('coordinacion', 'admin')
  @ApiOperation({ summary: 'Crea una franja sin titular (estado planificada)' })
  @ApiCreatedResponse({ description: 'Guardia creada en estado planificada' })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple GuardiaRequest' })
  @ApiForbiddenResponse({ description: 'El rol no permite crear guardias' })
  @ApiConflictResponse({ description: 'Ya existe una guardia de ese tipo en esa fecha' })
  crear(
    @Body(new ZodPipe(GuardiaRequestSchema)) datos: GuardiaRequest,
    @Headers('idempotency-key') claveIdempotencia: string | undefined,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ): Guardia {
    const { guardia } = this.guardias.crear(datos, claveIdempotencia);
    respuesta.setHeader('Location', `/guardias/${guardia.id}`);
    return guardia;
  }

  @Get(':guardiaId')
  @ApiOperation({ summary: 'Detalle de una guardia' })
  @ApiParam({ name: 'guardiaId', description: 'Identificador de la guardia' })
  @ApiOkResponse({
    description: 'Guardia encontrada',
    headers: {
      ETag: { description: 'Versión del recurso', schema: { type: 'string' } },
    },
  })
  @ApiNotFoundResponse({ description: 'La guardia no existe' })
  detalle(
    @Param('guardiaId') guardiaId: string,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ): Guardia {
    const guardia = this.guardias.detalle(guardiaId);
    respuesta.setHeader('ETag', `"${guardia.version}"`);
    return guardia;
  }
}
