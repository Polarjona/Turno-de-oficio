# -*- coding: utf-8 -*-
"""Ensambla la versión resumida (18 capítulos + anexo) reutilizando el diagrama ER."""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
sys.path.insert(0, ROOT)

import build as full  # noqa: E402

PARTS = [
    "compacto/c00_portada.html",
    "compacto/c01_negocio.html",
    "compacto/c02_operacion.html",
    "compacto/c03_datos.html",
    "compacto/c04_modelo.html",
]

CHAPTERS = [
    ("1", "La aplicación en una página", ""),
    ("2", "Qué se digitaliza exactamente", ""),
    ("3", "Base normativa del diseño", ""),
    ("4", "Roles y permisos", ""),
    ("5", "Tipología de guardias", ""),
    ("6", "El ciclo del cuadrante", ""),
    ("7", "Asignación de guardias", ""),
    ("8", "Ciclo de vida y estados", ""),
    ("9", "Calendarios", ""),
    ("10", "Disponibilidad y habilitación", ""),
    ("11", "Sustituciones, permutas y excusas", ""),
    ("12", "Modo guardia e incidencias", ""),
    ("13", "Comunicaciones y trazabilidad", ""),
    ("14", "Panel e indicadores", ""),
    ("15", "Reglas de negocio", ""),
    ("16", "Modelo de datos", ""),
    ("17", "Diagrama entidad-relación", ""),
    ("18", "Seguridad y protección de datos", ""),
    ("A", "Pantallas de referencia", ""),
]
ANNEX_FROM = 18


def toc_html(pages):
    rows = []
    for i, (num, title, _s) in enumerate(CHAPTERS):
        annex = i >= ANNEX_FROM
        rows.append(
            f'<div class="toc-row{" sub" if annex else ""}">'
            f'<span class="n">{num}</span>'
            f'<span class="t">{title}</span>'
            f'<span class="d"></span>'
            f'<span class="p">{pages.get(num, "")}</span></div>'
        )
    return "\n".join(rows)


def main():
    pages = {}
    pfile = os.path.join(BASE, "pages_compacto.json")
    if os.path.exists(pfile):
        with open(pfile, encoding="utf-8") as fh:
            pages = json.load(fh)

    body = []
    for p in PARTS:
        with open(os.path.join(BASE, p), encoding="utf-8") as fh:
            body.append(fh.read())
    body = "\n".join(body)
    body = body.replace("{{TOC}}", toc_html(pages))
    body = body.replace("{{ER_SVG}}", full.er_svg())
    body = re.sub(r'<span class="chnum">(?:Capítulo|Anexo)\s+([0-9]+|[A-C])</span>',
                  r'<span class="chnum">\1</span>', body)

    css = open(os.path.join(BASE, "style.css"), encoding="utf-8").read()
    css = css.replace("__FONTDIR__", "fonts").replace("__ASSETDIR__", "assets")
    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Gestión del Turno de Oficio · Diseño funcional</title>
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""
    out = os.path.join(BASE, "documento_compacto.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("HTML:", out, len(html), "bytes")


if __name__ == "__main__":
    main()
