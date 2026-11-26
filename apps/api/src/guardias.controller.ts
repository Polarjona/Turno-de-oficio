import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GUARDIAS_DEMO, type Guardia } from '@turno/shared';

@ApiTags('guardias')
@Controller('guardias')
export class GuardiasController {
  @Get()
  @ApiOperation({ summary: 'Lista las guardias del periodo' })
  @ApiOkResponse({ description: 'Guardias ordenadas por fecha' })
  listar(): Guardia[] {
    return [...GUARDIAS_DEMO].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  @Get(':guardiaId')
  @ApiOperation({ summary: 'Detalle de una guardia' })
  @ApiParam({ name: 'guardiaId', description: 'Identificador de la guardia' })
  @ApiOkResponse({ description: 'Guardia encontrada' })
  @ApiNotFoundResponse({ description: 'La guardia no existe' })
  detalle(@Param('guardiaId') guardiaId: string): Guardia {
    const guardia = GUARDIAS_DEMO.find((g) => g.id === guardiaId);
    if (!guardia) {
      throw new NotFoundException('Guardia no encontrada');
    }
    return guardia;
  }
}
