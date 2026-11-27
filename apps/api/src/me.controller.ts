import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Usuario } from '@turno/shared';

import type { UsuarioAutenticado } from './auth/auth.types';
import { UsuarioActual } from './auth/usuario-actual.decorator';

@ApiTags('sesion')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Usuario de la sesión' })
  @ApiOkResponse({ description: 'Datos del usuario autenticado' })
  actual(@UsuarioActual() usuario: UsuarioAutenticado): Usuario {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      colegiado: usuario.colegiado,
      rol: usuario.rol,
    };
  }
}
