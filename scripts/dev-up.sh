#!/usr/bin/env bash
# Levanta el stack local, espera a que Postgres responda y aplica las migraciones.
#   scripts/dev-up.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# El .env es opcional: los valores por defecto están en el propio compose.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

usuario="${POSTGRES_USER:-turno}"
base="${POSTGRES_DB:-turno}"
compose=(docker compose -f docker/docker-compose.yml)

echo '==> Levantando servicios'
"${compose[@]}" up -d

echo '==> Esperando a Postgres'
for intento in $(seq 1 60); do
  if "${compose[@]}" exec -T postgres pg_isready -U "$usuario" -d "$base" >/dev/null 2>&1; then
    echo '    listo'
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo '    Postgres no responde; revisa: docker compose -f docker/docker-compose.yml logs postgres'
    exit 1
  fi
  sleep 2
done

echo '==> Aplicando migraciones'
for fichero in db/migrations/*.sql; do
  echo "    $fichero"
  "${compose[@]}" exec -T postgres \
    psql -q -v ON_ERROR_STOP=1 -U "$usuario" -d "$base" <"$fichero"
done

echo '==> Comprobando la conexión a través de PgBouncer'
# Se conecta desde el contenedor de Postgres al puerto de PgBouncer: es el mismo
# camino que usará la API con DATABASE_URL.
"${compose[@]}" exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-turno}" postgres \
  psql -q -h pgbouncer -p 5432 -U "$usuario" -d "$base" \
  -c 'select 1' \
  -c "select count(*) as tablas from information_schema.tables where table_schema = 'public'"
echo '    ok'

cat <<EOF

Entorno levantado:
  API          npm run dev:api        http://localhost:3101
  Web          npm run dev:web        http://localhost:3000
  Keycloak                            http://localhost:${KEYCLOAK_PORT:-8081}
  Mailpit                             http://localhost:${MAILPIT_PORT:-8025}
  MinIO (consola)                     http://localhost:${MINIO_CONSOLE_PORT:-9001}
  Prometheus                          http://localhost:${PROMETHEUS_PORT:-9090}
  Grafana                             http://localhost:${GRAFANA_PORT:-3300}

Parar sin perder datos:  docker compose -f docker/docker-compose.yml down
Borrar también los datos: docker compose -f docker/docker-compose.yml down -v
EOF
