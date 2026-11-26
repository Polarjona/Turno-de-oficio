"""Valida un cuadrante en CSV antes de la carga a staging (TOF-2026-007).

Uso: python etl/validar_cuadrante.py cuadrante.csv
Sale con codigo 1 si hay filas rechazadas.
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from datetime import date
from pathlib import Path

COLUMNAS = ("fecha", "turno", "colegiado")
TURNOS = {"manana", "tarde", "noche"}


def validar(ruta: Path) -> int:
    rechazos: list[str] = []
    claves: Counter[tuple[str, str]] = Counter()
    validas = 0

    with ruta.open(encoding="utf-8", newline="") as fichero:
        lector = csv.DictReader(fichero)
        faltan = [c for c in COLUMNAS if c not in (lector.fieldnames or [])]
        if faltan:
            print(f"Faltan columnas: {', '.join(faltan)}")
            return 1

        for numero, fila in enumerate(lector, start=2):
            try:
                dia = date.fromisoformat(fila["fecha"].strip())
            except ValueError:
                rechazos.append(f"linea {numero}: fecha invalida '{fila['fecha']}'")
                continue

            turno = fila["turno"].strip().lower()
            if turno not in TURNOS:
                rechazos.append(f"linea {numero}: turno desconocido '{turno}'")
                continue

            if not fila["colegiado"].strip():
                rechazos.append(f"linea {numero}: colegiado vacio")
                continue

            claves[(dia.isoformat(), turno)] += 1
            validas += 1

    duplicadas = {k: v for k, v in claves.items() if v > 1}
    for (dia, turno), veces in sorted(duplicadas.items()):
        rechazos.append(f"{dia} {turno}: {veces} letrados en el mismo turno")

    print(f"Filas validas: {validas}")
    print(f"Filas rechazadas: {len(rechazos)}")
    for motivo in rechazos:
        print(f"  - {motivo}")

    return 1 if rechazos else 0


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    return validar(Path(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
