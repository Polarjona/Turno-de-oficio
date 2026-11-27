# Diccionario de Datos

Resumen de tablas y claves. El detalle campo a campo está en
`entregables/BBDD/Documentacion_Diccionario_Datos_Turno_Oficio.pdf` y, sobre todo,
en `db/migrations/0001_init.sql`, que es lo que se aplica de verdad.

## Convenciones

- Todos los identificadores son `uuid` con `gen_random_uuid()` (extensión
  `pgcrypto`), como exige el contrato (`format: uuid`).
- Todas las tablas llevan los campos comunes del modelo: `creado_en`,
  `creado_por`, `modificado_en` y `version` (`int`, la usa el `ETag` de la API).
- Los estados son `text` con `CHECK`, con el mismo vocabulario que
  `entregables/Backend/openapi.yaml`.
- Nada de borrado físico en las entidades con histórico: las FK van con
  `on delete restrict`.

| Tabla            | Para qué sirve                                  | Claves y restricciones                                           |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `usuario`        | Quien inicia sesión y con qué rol               | `email` único · `rol` en letrado/coordinacion/junta/admin        |
| `abogado`        | El letrado como profesional                     | `usuario_id` único (1:1) · `num_colegiado` único                 |
| `especialidad`   | Materia del turno                               | `codigo` único                                                   |
| `habilitacion`   | Acreditación de un abogado en una materia       | Única `vigente` por `(abogado_id, especialidad_id)`              |
| `tipo_guardia`   | Catálogo de franjas de una materia              | `codigo` único · `(id, especialidad_id)` único                   |
| `cuadrante`      | Periodo planificado y su versión                | `(anio, periodo, version)` único                                 |
| `guardia`        | Franja concreta de un día                       | FK compuesta a `tipo_guardia` · `ux_guardia_solape` (RN-04)      |
| `disponibilidad` | Vacaciones, bajas y permisos                    | `fecha_fin >= fecha_inicio`                                      |
| `solicitud`      | Excusa, permuta o sustitución sobre una guardia | Una abierta por `guardia_id` (`ux_solicitud_activa`)             |
| `incidencia`     | Lo que ocurre durante la guardia                | `categoria` y `gravedad` con CHECK                               |
| `parte_guardia`  | Parte de la guardia                             | 1:1 con `guardia` (`guardia_id` único) · RN-18                   |
| `justificante`   | Documento de una solicitud o una disponibilidad | Al menos una de las dos referencias                              |
| `notificacion`   | Aviso por email, SMS o en la app                | Unique por `(referencia_tipo, referencia_id, usuario_id, canal)` |
| `auditoria`      | Traza de cambios, append-only                   | `app_role` sin UPDATE/DELETE/TRUNCATE                            |
| `parametro`      | Configuración versionada                        | `(clave, version)` único · `vigente_hasta` nullable (RN-27)      |

## Campos con reglas propias

- **`guardia.estado`**: `planificada`, `propuesta`, `publicada`, `confirmada`,
  `en_revision`, `descubierta`, `en_curso`, `realizada`, `validada`, `anulada`.
- **`guardia.origen`**: `planificacion`, `manual`, `urgente`, `refuerzo`,
  `cobertura_hueco`. Un `urgente` no puede llevar `cuadrante_id`; el resto, o lo
  lleva, o está aún en `planificada`.
- **`guardia.inicio_en` / `fin_en`**: columnas generadas, no se insertan. Suman un
  día cuando `cruza_medianoche` y se interpretan en `Europe/Madrid`.
- **`solicitud.motivo`**: `enfermedad`, `asunto_propio`, `conciliacion`,
  `fuerza_mayor`, `otro`. Vocabulario general a propósito: el modelo no guarda
  diagnósticos (RGPD art. 9 / RN-23).
- **`parametro`**: nunca se actualiza un valor vigente; se cierra con
  `vigente_hasta` y se inserta una versión nueva.
