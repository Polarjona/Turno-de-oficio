import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { USUARIO_DEMO, type Usuario } from '@turno/shared';

@ApiTags('sesion')
@Controller('me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Usuario de la sesión' })
  @ApiOkResponse({ description: 'Datos del usuario autenticado' })
  actual(): Usuario {
    return USUARIO_DEMO;
  }
}
