import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
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
  ApiTags,
} from '@nestjs/swagger';
import { GuardiaRequestSchema, type Guardia, type GuardiaRequest } from '@turno/shared';

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
  @ApiOperation({ summary: 'Lista las guardias del periodo' })
  @ApiOkResponse({ description: 'Guardias ordenadas por fecha' })
  listar(): Guardia[] {
    return this.guardias.listar();
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
  @ApiOkResponse({ description: 'Guardia encontrada' })
  @ApiNotFoundResponse({ description: 'La guardia no existe' })
  detalle(@Param('guardiaId') guardiaId: string): Guardia {
    return this.guardias.detalle(guardiaId);
  }
}
