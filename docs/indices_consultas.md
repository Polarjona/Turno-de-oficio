# Índices y Consultas Críticas

## Objetivo

Garantizar tiempos de respuesta bajos para las consultas más habituales del sistema Turno de Oficio, incluso con el crecimiento previsto de datos durante los próximos años.

---

## Consultas Más Frecuentes

### 1. Buscar un letrado por identificador

```sql
SELECT *
FROM letrados
WHERE id = ?;
```

Uso:
- Consulta de ficha de un letrado.
- Edición de datos personales.
- Consulta desde la aplicación.

---

### 2. Buscar un letrado por número de colegiado

```sql
SELECT *
FROM letrados
WHERE colegiado = ?;
```

Uso:
- Validación de usuarios.
- Evitar registros duplicados.
- Importación de datos desde Excel.

---

### 3. Obtener las asignaciones de una fecha determinada

```sql
SELECT a.*
FROM asignaciones a
JOIN guardias g ON a.guardia_id = g.id
WHERE g.fecha = '2027-03-15';
```

Uso:
- Visualización del calendario de guardias.
- Consulta diaria de asignaciones.
- Generación de informes.

---

### 4. Consultar el histórico de asignaciones de un letrado

```sql
SELECT *
FROM asignaciones
WHERE letrado_id 