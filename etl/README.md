# etl/

Carga del cuadrante histórico al modelo nuevo. El diseño está en
`entregables/ETL/Flujo_ETL.pdf` (TOF-2026-007): origen → staging → validado → carga.

## Validar un cuadrante antes de cargarlo

```bash
python etl/validar_cuadrante.py ruta/al/cuadrante.csv
```

El CSV tiene que traer las columnas `fecha`, `turno` y `colegiado`. El script
informa de las filas rechazadas (fecha inválida, colegiado desconocido o turno
duplicado) y sale con código 1 si hay alguna, para que la carga no siga.

Las reglas de rechazo son las del flujo ETL aprobado; si cambia una, se cambia
en el documento y aquí a la vez.
