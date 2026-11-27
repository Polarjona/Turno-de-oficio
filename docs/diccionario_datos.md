# Diccionario de Datos

## Tabla: usuarios

| Campo | Tipo | Descripción |
|---------|---------|---------|
| id | SERIAL | Identificador único |
| nombre | VARCHAR(100) | Nombre del usuario |
| email | VARCHAR(150) | Correo electrónico |

## Tabla: especialidades

| Campo | Tipo | Descripción |
|---------|---------|---------|
| id | SERIAL | Identificador único |
| nombre | VARCHAR(100) | Nombre de la especialidad |

## Tabla: letrados

| Campo | Tipo | Descripción |
|---------|---------|---------|
| id | SERIAL | Identificador único |
| nombre | VARCHAR(150) | Nombre completo |
| colegiado | VARCHAR(50) | Número de colegiado |
| especialidad_id | INT | Referencia a la especialidad |

## Tabla: guardias

| Campo | Tipo | Descripción |
|---------|---------|---------|
| id | SERIAL | Identificador único |
| fecha | DATE | Fecha de guardia |

## Tabla: asignaciones

| Campo | Tipo | Descripción |
|---------|---------|---------|
| id | SERIAL | Identificador único |
| guardia_id | INT | Guardia asignada |
| letrado_id | INT | Letrado asignado |