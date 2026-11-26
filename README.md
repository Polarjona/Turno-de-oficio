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
├── db/migrations/                   SQL del cuadrante (0001_init.sql)
├── etl/                             Validación del cuadrante histórico antes de cargarlo
├── docker/                          Postgres 16 para desarrollo local
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
docker compose -f docker/docker-compose.yml up -d   # Postgres 16 en localhost:5432

npm run dev:api             # http://localhost:3101 (PORT=... para cambiarlo) y contrato en /api-docs
npm run dev:web             # http://localhost:3000
```

| Comando             | Qué hace                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run lint`      | ESLint + Prettier sobre `apps/`, `packages/` y `scripts/`                |
| `npm run typecheck` | `tsc --noEmit` en cada workspace                                         |
| `npm test`          | Vitest en `packages/shared` y `apps/api`                                 |
| `npm run openapi`   | Regenera `apps/api/openapi.json` y comprueba que no se sale del contrato |

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
