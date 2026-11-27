/**
 * Traduce el token de Keycloak al usuario que usa la API.
 *
 * Keycloak entrega los roles del realm en `realm_access.roles`; de ahí salen los
 * cuatro del contrato (entregables/Backend/openapi.yaml, x-roles): `letrado`,
 * `coordinacion`, `junta` y `admin`.
 */
import { UnauthorizedException } from '@nestjs/common';
import { RolSchema, type Rol } from '@turno/shared';

/** Claims del access token que nos interesan. */
export interface TokenKeycloak {
  sub: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  colegiado?: string;
  /** Id del registro `abogado`, para que un letrado solo vea lo suyo. */
  abogado_id?: string;
  realm_access?: { roles?: string[] };
}

/** Usuario ya resuelto, tal como lo ven el guard de roles y los controladores. */
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  colegiado: string;
  /** Correo del token: es la dirección a la que salen los avisos. */
  email?: string | undefined;
  /** Nulo si el token no lo trae (usuario de demo sin registro de abogado). */
  abogadoId?: string | undefined;
  rol: Rol;
  roles: Rol[];
}

export function usuarioDesdeToken(payload: TokenKeycloak): UsuarioAutenticado {
  const roles = (payload.realm_access?.roles ?? []).filter(
    (candidato): candidato is Rol => RolSchema.safeParse(candidato).success,
  );
  const [rol] = roles;

  if (!rol) {
    throw new UnauthorizedException(
      'El token no trae ningún rol del Turno de Oficio (letrado, coordinacion, junta, admin)',
    );
  }

  return {
    id: payload.sub,
    nombre: payload.name ?? payload.preferred_username ?? payload.sub,
    colegiado: payload.colegiado ?? payload.preferred_username ?? '',
    email: payload.email,
    abogadoId: payload.abogado_id,
    rol,
    roles,
  };
}
