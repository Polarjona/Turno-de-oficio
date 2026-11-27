# Plan de Migración de Datos

## Origen

Ficheros Excel utilizados actualmente para la gestión del Turno de Oficio.

## Fases

### 1. Análisis

Identificación de columnas, formatos y duplicados.

### 2. Limpieza

Corrección de datos inconsistentes.

### 3. Transformación

Conversión de los datos al modelo relacional definido.

### 4. Carga

Inserción en PostgreSQL mediante scripts SQL.

### 5. Validación

Comprobación de integridad y consistencia.

## Riesgos

- Datos duplicados.
- Campos incompletos.
- Errores de formato.

## Mitigación

Validaciones previas y copias de seguridad.
