import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Exige un access token válido de Keycloak. Sin token (o caducado, o de otro
 * realm) responde 401 antes de llegar al controlador.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
