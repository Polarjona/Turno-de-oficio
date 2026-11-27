import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
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

import { Roles } from './auth/roles.decorator';
import { GuardiasService } from './guardias.service';
import { ZodPipe } from './zod.pipe';

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
    name: 'orden',
    required: false,
    schema: { type: 'string', enum: ['fecha_asc', 'fecha_desc'], default: 'fecha_asc' },
  })
  @ApiQuery({ name: 'limite', required: false, schema: { type: 'integer', default: 20 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor opaco de la página anterior' })
  @ApiOkResponse({ description: 'Página de guardias' })
  @ApiBadRequestResponse({ description: 'Filtro o cursor inválido' })
  listar(@Query(new ZodPipe(GuardiasQuerySchema)) filtros: FiltrosGuardias): PaginaGuardias {
    return this.guardias.listar(filtros);
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
