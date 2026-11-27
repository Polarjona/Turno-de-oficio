/**
 * Dónde está Keycloak. Se configura con KEYCLOAK_URL y KEYCLOAK_REALM
 * (ver .env.example); sin variables usa el Keycloak del compose local.
 */
const URL_POR_DEFECTO = 'http://localhost:8081';
const REALM_POR_DEFECTO = 'tof';

export interface ConfiguracionKeycloak {
  realm: string;
  issuer: string;
  jwksUri: string;
  tokenEndpoint: string;
}

export function keycloakConfig(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionKeycloak {
  const url = (entorno.KEYCLOAK_URL ?? URL_POR_DEFECTO).replace(/\/+$/, '');
  const realm = entorno.KEYCLOAK_REALM ?? REALM_POR_DEFECTO;
  const base = `${url}/realms/${realm}`;

  return {
    realm,
    issuer: base,
    jwksUri: `${base}/protocol/openid-connect/certs`,
    tokenEndpoint: `${base}/protocol/openid-connect/token`,
  };
}
