# Modelo Relacional

USUARIOS
- id (PK)
- nombre
- email

ESPECIALIDADES
- id (PK)
- nombre

LETRADOS
- id (PK)
- nombre
- colegiado
- especialidad_id (FK)

GUARDIAS
- id (PK)
- fecha

ASIGNACIONES
- id (PK)
- guardia_id (FK)
- letrado_id (FK)