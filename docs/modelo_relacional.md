# Modelo Relacional

Esquema físico del prototipo. La fuente de verdad es `db/migrations/0001_init.sql`
(15 tablas: las 14 entidades de `TOF-2026-012` más `parametro`) y el diagrama está
en `entregables/BBDD/Modelo_ER_DDL_TOF-2026-012.pdf`, p. 9.

## Identidad

- **usuario** — quien inicia sesión. `rol` es uno de `letrado`, `coordinacion`,
  `junta`, `admin`, los mismos que emite Keycloak.
- **abogado** — el letrado como profesional. 1:1 con `usuario`
  (`usuario_id` es `unique`); añade `num_colegiado`, `orden_turno` y `zona`.
- **especialidad** — materia del turno (penal, civil…), con `codigo` único.
- **habilitacion** — qué abogado está acreditado en qué materia. Una sola
  acreditación `vigente` por pareja (índice único parcial).

## Planificación

- **tipo_guardia** — catálogo de franjas: `modalidad`, `hora_inicio`/`hora_fin`,
  `cruza_medianoche`, `letrados_previstos`, `peso_computo`, `descanso_posterior_h`.
  Pertenece a una `especialidad` (FK) y la pareja `(id, especialidad_id)` es única.
- **cuadrante** — periodo publicado (`anio`, `periodo`) con su `version` y su
  `estado` (`borrador` → `en_alegaciones` → `publicado` → `congelado` → `cerrado`).
  Unique por `(anio, periodo, version)`.

## La guardia

- **guardia** — la franja concreta de un día. Referencia `tipo_guardia` y
  `especialidad` con una **FK compuesta** `(tipo_guardia_id, especialidad_id)`, así
  que la materia no puede divergir del catálogo. `abogado_id` es nulo mientras no
  haya titular y `cuadrante_id` es nulo mientras esté `planificada`.
  `inicio_en` y `fin_en` son columnas generadas (`fecha` + horas en
  `Europe/Madrid`) y sostienen la restricción de solape.

## Circuito de sustitución

- **disponibilidad** — vacaciones, bajas y permisos por rango de fechas.
- **solicitud** — excusa, permuta o sustitución sobre una guardia. Solo puede
  haber **una abierta por guardia** (índice único parcial sobre los estados no
  resueltos).
- **justificante** — documento adjunto a una solicitud o a una disponibilidad
  (siempre a una de las dos, nunca a ninguna).
- **incidencia** — lo que pasa durante la guardia (localización, cobertura…).
- **parte_guardia** — el parte de la guardia, 1:1 con `guardia`. No se puede
  validar sin horas de entrada y salida ni actuaciones.

## Soporte

- **notificacion** — aviso a un usuario por un canal (`email`, `sms`, `in_app`),
  con unique por `(referencia_tipo, referencia_id, usuario_id, canal)` para que un
  reintento no duplique el envío.
- **auditoria** — traza append-only: el rol de aplicación no puede hacer `UPDATE`,
  `DELETE` ni `TRUNCATE`.
- **parametro** — configuración versionada (`clave`, `valor` jsonb, `version`,
  `vigente_desde`, `vigente_hasta`). No se sobrescribe: se cierra la vigencia y se
  abre otra (RN-27).

## Relaciones en una línea

```
usuario 1—1 abogado 1—N habilitacion N—1 especialidad
especialidad 1—N tipo_guardia 1—N guardia N—1 abogado
cuadrante 1—N guardia 1—N solicitud 1—N justificante
guardia 1—1 parte_guardia · guardia 1—N incidencia
abogado 1—N disponibilidad 1—N justificante
usuario 1—N notificacion · usuario 1—N auditoria
```
