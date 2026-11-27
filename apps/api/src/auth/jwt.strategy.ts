import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy, type StrategyOptions } from 'passport-jwt';

import { usuarioDesdeToken, type TokenKeycloak, type UsuarioAutenticado } from './auth.types';
import { keycloakConfig } from './keycloak.config';

/**
 * Valida el access token contra las claves públicas de Keycloak (JWKS).
 *
 * No hay secreto compartido ni introspección en cada petición: la clave se cachea
 * y se refresca sola cuando Keycloak rota el certificado. Se comprueban firma,
 * caducidad e `iss`; el rol se resuelve en `usuarioDesdeToken`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const { issuer, jwksUri } = keycloakConfig();

    const opciones: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
    };

    super(opciones);
  }

  validate(payload: TokenKeycloak): UsuarioAutenticado {
    return usuarioDesdeToken(payload);
  }
}
