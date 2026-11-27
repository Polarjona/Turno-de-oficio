# Índices y Consultas Críticas

Consultas que hace la aplicación en cada pantalla, con el índice de
`db/migrations/0001_init.sql` que las sostiene. Si una consulta nueva no encaja en
ninguno de estos índices, conviene justificarlo antes de añadir otro.

## 1. Guardias de un día (vista Hoy)

```sql
SELECT g.id, g.hora_inicio, g.hora_fin, g.estado, g.origen,
       e.nombre AS especialidad,
       u.nombre || ' ' || u.apellidos AS abogado
FROM guardia g
JOIN especialidad e ON e.id = g.especialidad_id
LEFT JOIN abogado a ON a.id = g.abogado_id
LEFT JOIN usuario u ON u.id = a.usuario_id
WHERE g.fecha = '2027-03-15'
ORDER BY g.hora_inicio;
```

Índice: `ix_guardia_fecha_materia (fecha, especialidad_id, estado)`.

## 2. Guardias de un letrado en un periodo (histórico y equidad)

```sql
SELECT *
FROM guardia
WHERE abogado_id = $1
  AND fecha BETWEEN $2 AND $3
ORDER BY fecha;
```

Índice: `ix_guardia_abogado_fecha (abogado_id, fecha)`.

## 3. Ficha de un letrado por número de colegiado

```sql
SELECT a.id, a.num_colegiado, a.orden_turno, a.activo,
       u.nombre, u.apellidos, u.email
FROM abogado a
JOIN usuario u ON u.id = a.usuario_id
WHERE a.num_colegiado = $1;
```

Índice: el `unique` de `abogado.num_colegiado`.

## 4. Materias en las que está habilitado

```sql
SELECT e.codigo, e.nombre
FROM habilitacion h
JOIN especialidad e ON e.id = h.especialidad_id
WHERE h.abogado_id = $1
  AND h.estado = 'vigente';
```

Índice: `ux_habilitacion_vigente (abogado_id, especialidad_id) WHERE estado = 'vigente'`.

## 5. Solicitud abierta de una guardia

```sql
SELECT *
FROM solicitud
WHERE guardia_id = $1
  AND estado IN ('comunicada', 'en_revision', 'oferta_enviada', 'pendiente_validacion');
```

Índice: `ux_solicitud_activa (guardia_id) WHERE estado IN (...)`, que además
garantiza que no haya dos abiertas a la vez.

## 6. Disponibilidad que cubre una fecha

```sql
SELECT *
FROM disponibilidad
WHERE abogado_id = $1
  AND fecha_inicio <= $2
  AND fecha_fin >= $2;
```

Índice: `ix_disponibilidad_abogado_rango (abogado_id, fecha_inicio, fecha_fin)`.

## 7. Notificaciones pendientes de envío (job)

```sql
SELECT *
FROM notificacion
WHERE estado_entrega = 'pendiente'
ORDER BY creado_en
LIMIT 100;
```

Índice: `ix_notificacion_estado_entrega (estado_entrega)`.

## 8. Traza de una entidad (auditoría)

```sql
SELECT *
FROM auditoria
WHERE entidad = $1
  AND entidad_id = $2
ORDER BY fecha DESC;
```

Índice: `ix_auditoria_entidad (entidad, entidad_id)`.

## 9. Parámetro vigente

```sql
SELECT valor
FROM parametro
WHERE clave = $1
  AND vigente_hasta IS NULL
ORDER BY version DESC
LIMIT 1;
```

Índice: el `unique (clave, version)`.

## 10. Comprobar que un letrado no queda con dos guardias solapadas

No es una consulta de la aplicación: lo impide el motor con
`ux_guardia_solape`, un `EXCLUDE USING gist` sobre `abogado_id` y el rango
`tstzrange(inicio_en, fin_en)`. Un `INSERT` solapado falla con
`conflicting key value violates exclusion constraint`.
