# Turno de Oficio · Gestión de guardias

Plataforma de planificación, cobertura y control de las guardias del servicio de asistencia
jurídica gratuita. Documentación y entregables del proyecto de ejercicio de la
**Propuesta y diseño funcional** (TOF-2026-001 / TOF-2026-002).

## Estructura del repositorio

```
├── README.md, CONTRIBUTING.md
├── .github/
│   ├── ISSUE_TEMPLATE/tarjeta.md    Plantilla de issue = tarjeta de Trello
│   └── workflows/ci.yml             CI: lint, tipos, pruebas, contrato y build web
├── apps/
│   ├── api/                         NestJS 11 · contrato en http://localhost:3101/api-docs
│   └── web/                         Next.js 15
├── packages/shared/                 Tipos y esquemas Zod que usan api y web
├── db/migrations/                   Esquema físico v0 (0001_init.sql); el reverso, en down/
├── etl/                             Validación del cuadrante histórico antes de cargarlo
├── docker/                          Stack local: Postgres, PgBouncer, Keycloak, Mailpit, MinIO, Prometheus y Grafana
├── scripts/                         Comprobación del contrato OpenAPI
├── fuentes/                         Encargos originales del Colegio
│   ├── Propuesta_Funcional_...pdf   (TOF-2026-001)
│   └── Diseno_Funcional_...pdf      (TOF-2026-002)
├── doc/
│   ├── entregables/      Fuentes HTML de los entregables breves
│   ├── parts/            Capítulos de la Propuesta (se ensamblan con build.py)
│   ├── compacto/         Variante resumida de la Propuesta
│   ├── plantilla/        Plantillas corporativas Inetum 2026 (Word / PowerPoint)
│   ├── fonts/, assets/   Tipografía y recursos de marca
│   ├── _extraido/        Texto plano de las fuentes de partida
│   └── *.py              Maquetación y render a PDF (ver abajo)
└── entregables/          PDFs generados, listos para adjuntar a Trello
    ├── ETL/              Mapa normativo, inventario, entrevistas, flujo, dataset, píldora
    ├── Backend/          OpenAPI, reglas y estados, autenticación, RNF, spike
    ├── BBDD/             Modelo ER, diccionario, índices, migración, volumetría
    ├── Frontend/         Benchmark, journey map, wireframes, sistema de diseño, demo
    └── DevOps/           Seguridad RGPD, entornos CI/CD
```

## Primeros pasos

```bash
git clone https://github.com/Polarjona/Turno-de-oficio.git
cd Turno-de-oficio
```

Cada persona hace push en su rama de rol (`etl-devops`, `backend`, `frontend`,
`database`); Pol abre el PR contra `develop` y hace el merge. `produccion` guarda
solo la versión final que se entrega al cliente. El detalle está en `CONTRIBUTING.md`.

## Arrancar el monorepo

Requisitos: Node 22 y Docker (solo para la base de datos).

```bash
npm install                 # instala workspaces y compila packages/shared
scripts/dev-up.sh           # stack completo en Docker + migraciones aplicadas

npm run dev:api             # http://localhost:3101 (PORT=... para cambiarlo) y contrato en /api-docs
npm run dev:web             # http://localhost:3000
```

| Comando             | Qué hace                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run lint`      | ESLint + Prettier sobre `apps/`, `packages/` y `scripts/`                |
| `npm run typecheck` | `tsc --noEmit` en cada workspace                                         |
| `npm test`          | Vitest en `packages/shared` y `apps/api`                                 |
| `npm run openapi`   | Regenera `apps/api/openapi.json` y comprueba que no se sale del contrato |

### Entorno completo del prototipo

`scripts/dev-up.sh` levanta todo el stack, espera a Postgres, aplica las
migraciones de `db/migrations` y comprueba la conexión a través de PgBouncer.

| Servicio   | Puerto local | Para qué                                             |
| ---------- | ------------ | ---------------------------------------------------- |
| Postgres   | 5432         | Base de datos del prototipo                          |
| PgBouncer  | 6432         | Entrada de la API a Postgres (agrupa conexiones)     |
| Keycloak   | 8081         | Identidad: roles del Colegio y usuarios de demo      |
| Mailpit    | 1025 · 8025  | SMTP de desarrollo y buzón donde se leen los correos |
| MinIO      | 9000 · 9001  | Almacenamiento S3-compatible (consola en 9001)       |
| Prometheus | 9090         | Métricas                                             |
| Grafana    | 3300         | Cuadros de mando (Prometheus ya conectado)           |

Keycloak va en 8081 y Grafana en 3300 porque 8080 y 3000 están ocupados en la
máquina de desarrollo. Todos los puertos se cambian en el `.env`
(`cp .env.example .env`); sin `.env` el stack arranca igual con esos valores.

### Autenticación con Keycloak

El realm `tof` se importa al arrancar (`--import-realm`) desde
`docker/keycloak/realm-tof.json`: los cuatro roles de realm del contrato
(`letrado`, `coordinacion`, `junta`, `admin`), un grupo por rol y cuatro usuarios
de demo con el email verificado.

| Usuario             | Contraseña          | Rol            |
| ------------------- | ------------------- | -------------- |
| `letrado.demo`      | `demo-letrado`      | `letrado`      |
| `coordinacion.demo` | `demo-coordinacion` | `coordinacion` |
| `junta.demo`        | `demo-junta`        | `junta`        |
| `admin.demo`        | `demo-admin`        | `admin`        |

Son credenciales de desarrollo: viven en el realm de ejemplo, no en el código de
la aplicación. La consola de administración está en http://localhost:8081 con
`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` (por defecto `admin` / `admin`).

La web usa el cliente público `tof-web` (PKCE S256, redirect
`http://localhost:3000/*`). La API no guarda ningún secreto: valida la firma del
token con las claves públicas de
`/realms/tof/protocol/openid-connect/certs`, comprueba `iss` y caducidad, y
resuelve el rol desde `realm_access.roles`
(`apps/api/src/auth/jwt.strategy.ts`). Dos guards globales cierran el resto:
**401** sin token o con token inválido, **403** si el rol no está entre los
declarados con `@Roles(...)` (el `x-roles` de cada operación del contrato).

Para pedir un token sin pasar por la web (el cliente `tof-web` admite _direct
access grants_ solo para desarrollo):

```bash
TOKEN=$(curl -s http://localhost:8081/realms/tof/protocol/openid-connect/token \
  -d grant_type=password -d client_id=tof-web \
  -d username=letrado.demo -d password=demo-letrado | jq -r .access_token)

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3101/guardias   # 401
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" http://localhost:3101/guardias        # 200
```

Si cambias `realm-tof.json`, el realm ya importado no se sobrescribe: hay que
borrar el volumen con `docker compose -f docker/docker-compose.yml down -v`
antes de `scripts/dev-up.sh`.

```bash
scripts/dev-up.sh            # todo + migraciones
docker compose -f docker/docker-compose.yml ps          # estado y salud
docker compose -f docker/docker-compose.yml down        # parar (conserva datos)
docker compose -f docker/docker-compose.yml down -v     # parar y borrar los datos
```

### Base de datos

Postgres 16 en `localhost:5432`, con usuario, contraseña y base `turno`. Si solo
necesitas la base de datos (es lo que usa la CI), arranca ese servicio suelto:

```bash
# 1. Levantar Postgres (la primera vez crea el volumen y lo inicializa)
docker compose -f docker/docker-compose.yml up -d postgres

# 2. Comprobar que está sano
docker compose -f docker/docker-compose.yml ps

# 3. Aplicar la migración (idempotente: se puede repetir sin miedo)
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U turno -d turno < db/migrations/0001_init.sql

# 4. Ver las tablas creadas
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U turno -d turno -c '\dt'
```

La carpeta `db/migrations` está montada en `/docker-entrypoint-initdb.d`, así
que al crear el volumen el contenedor ya aplica la migración por su cuenta; el
paso 3 sirve para volver a pasarla cuando se añade una nueva.

La migración crea el esquema físico del modelo: las 14 entidades de
`entregables/BBDD/Modelo_ER_DDL_TOF-2026-012.pdf` (usuario, abogado,
especialidad, habilitacion, tipo_guardia, cuadrante, guardia, disponibilidad,
solicitud, incidencia, parte_guardia, justificante, notificacion, auditoria) más
`parametro`, con sus claves, sus CHECK de estado y las reglas que impone el
motor: el solapamiento de guardias de un mismo letrado (RN-04, `tstzrange` +
`EXCLUDE USING gist`), la designación urgente sin cuadrante (RN-39), el parte sin
horas ni actuaciones (RN-18), una sola solicitud abierta por guardia y la
auditoría sin `UPDATE`/`DELETE` para el rol de aplicación. Es idempotente: se
puede repetir sobre el mismo volumen.

Para revertirla:

```bash
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U turno -d turno < db/migrations/down/0001_init.down.sql
```

El reverso vive en `db/migrations/down/` a propósito: el entrypoint de Postgres
ejecuta todos los `.sql` del directorio montado, y un `.down.sql` suelto ahí
borraría el esquema justo después de crearlo.

La API usa esas tablas en cuanto arranca con `DATABASE_URL` (a través de
PgBouncer: `postgres://turno:turno@localhost:6432/turno`). Sin la variable,
`GuardiasService` trabaja en memoria, que es lo que usan los tests y el arranque
sin Docker. El repositorio se elige en un solo sitio: `apps/api/src/app.module.ts`.

La prueba de conexión de la API (`apps/api/src/db.test.ts`) se salta si no hay
`DATABASE_URL`. Para que corra:

```bash
DATABASE_URL=postgres://turno:turno@localhost:5432/turno npm test -w @turno/api
```

Para parar el contenedor **sin perder los datos**:
`docker compose -f docker/docker-compose.yml down` (sin `-v`).

La CI (`.github/workflows/ci.yml`) corre esos mismos comandos en cada PR, con un
Postgres 16 de servicio para las pruebas de la API. Además falla si el
`openapi.json` versionado no coincide con el que genera el código, y si algún
endpoint implementado no existe en `entregables/Backend/openapi.yaml`.

`entregables/Backend/openapi.yaml` es el contrato aprobado: el código se adapta a
él, no al revés. El paso de contrato informa de los endpoints que quedan por
implementar.

## Cómo se regeneran los documentos

Los cuatro documentos «oficiales» se reconstruyen desde su fuente HTML con la
maquetación corporativa Inetum 2026:

```bash
cd doc
py build.py                # Propuesta   -> documento.html
py build_compacto.py       # Diseño      -> documento_compacto.html
py render_entregable.py    # Mapa        -> entregables/Mapa_Normativo.pdf
py render_pildora.py       # Píldora     -> entregables/Pildora_ETL.pdf
```

Los entregables breves viven en `doc/entregables/` y se renderizan con el
mismo alisado: `py render_entregable.py <nombre-sin-extension>` (ver `__main__`).

## Tablero de trabajo

El seguimiento está en Trello, tablero **Turno de Oficio** —
https://trello.com/b/03STIQc3 · listas **To do → Doing → Review → Done**.

Una tarjeta solo pasa a **Done** después de su revisión en **Review**: nadie la
mueve a Done por su cuenta (CONTRIBUTING.md).

## Normativa de referencia

Ley 1/1996 (arts. 22, 24 y 31), RD 141/2021 y RD 135/2021 (Estatuto General de
la Abogacía, cap. VI), RGPD (arts. 9 y 22) y LO 3/2018. El detalle está en
`entregables/Mapa_Normativo.pdf` (Ref. TOF-2026-003).
