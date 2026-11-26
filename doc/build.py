# -*- coding: utf-8 -*-
"""Ensambla el documento HTML y genera el diagrama entidad-relación en SVG.

El diagrama se dibuja en un lienzo de 486 x ~465 unidades que se muestra a 170 mm
de ancho, de modo que 1 unidad equivale aproximadamente a 1 punto impreso.
"""
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
PARTS = [
    "parts/00_portada.html",
    "parts/01_indice.html",
    "parts/02_alcance.html",
    "parts/03_operativa.html",
    "parts/04_sustituciones.html",
    "parts/05_control.html",
    "parts/06_modelo.html",
    "parts/07_anexos.html",
]

CHAPTERS = [
    ("1", "Resumen ejecutivo", ""),
    ("2", "Contexto y problemática actual", ""),
    ("3", "Marco normativo y principios de diseño", ""),
    ("4", "Alcance funcional del sistema", ""),
    ("5", "Actores, roles y permisos", ""),
    ("6", "Modelo conceptual: guardia, turno y designación", ""),
    ("7", "Tipología de guardias y franjas de cobertura", ""),
    ("8", "El ciclo anual del cuadrante", ""),
    ("9", "Asignación de guardias: manual, asistida y validada", ""),
    ("10", "Ciclo de vida de la guardia", ""),
    ("11", "Calendarios y vistas de planificación", ""),
    ("12", "Disponibilidad, ausencias y vacaciones", ""),
    ("13", "Especialidades y habilitación profesional", ""),
    ("14", "Sustituciones, permutas y excusas", ""),
    ("15", "Modo guardia: incidencias y escalado", ""),
    ("16", "Notificaciones y comunicaciones", ""),
    ("17", "Trazabilidad y expediente de la guardia", ""),
    ("18", "Panel de control e indicadores", ""),
    ("19", "Catálogo de casos de uso", ""),
    ("20", "Reglas de negocio", ""),
    ("21", "Modelo entidad-relación: diccionario de datos", ""),
    ("22", "Diagrama entidad-relación", ""),
    ("23", "Relaciones, integridad y validaciones", ""),
    ("24", "Protección de datos, seguridad y accesibilidad", ""),
    ("25", "Implantación por fases y criterios de aceptación", ""),
    ("A", "Wireframes de referencia", ""),
    ("B", "Plantillas de comunicación", ""),
    ("C", "Lista de verificación de cumplimiento", ""),
]
ANNEX_FROM = 25

# --------------------------------------------------------------- geometría ER
CW = 486.0
COLW = 141.0
COLS = [8.0, 172.5, 337.0]
HEAD = 16.0
ROW = 9.6
PAD_B = 4.0
GAP = 20.0
TOP = 10.0

RESERVED = {"c", "d"}

ENTITIES = {}


def ent(name, sub, fields, col, row):
    ENTITIES[name] = dict(sub=sub, fields=fields, col=col, row=row)


ent("USUARIO", "cuenta y credenciales", [
    ("id", "UUID", 1), ("nombre", "texto", 0), ("email", "texto", 0),
    ("rol", "enum", 0), ("estado", "enum", 0), ("fecha_alta", "fecha", 0),
], 0, 0)
ent("ABOGADO", "colegiado del turno", [
    ("id", "UUID", 1), ("usuario_id", "FK", 0), ("num_colegiado", "texto", 0),
    ("orden_turno", "entero", 0), ("fecha_alta_turno", "fecha", 0), ("activo", "bool", 0),
], 1, 0)
ent("ESPECIALIDAD", "materia del turno", [
    ("id", "UUID", 1), ("codigo", "texto", 0), ("nombre", "texto", 0),
    ("requiere_formacion", "bool", 0),
], 2, 0)

ent("DISPONIBILIDAD", "ausencia comunicada", [
    ("id", "UUID", 1), ("abogado_id", "FK", 0), ("fecha_inicio", "fecha", 0),
    ("fecha_fin", "fecha", 0), ("tipo", "enum", 0), ("estado", "enum", 0),
], 0, 1)
ent("HABILITACION", "acreditación vigente", [
    ("id", "UUID", 1), ("abogado_id", "FK", 0), ("especialidad_id", "FK", 0),
    ("fecha_habilitacion", "fecha", 0), ("caducidad", "fecha", 0), ("estado", "enum", 0),
], 1, 1)
ent("TIPO_GUARDIA", "plantilla de servicio", [
    ("id", "UUID", 1), ("especialidad_id", "FK", 0), ("modalidad", "enum", 0),
    ("hora_inicio", "hora", 0), ("peso_computo", "decimal", 0), ("letrados", "entero", 0),
], 2, 1)

ent("SOLICITUD", "excusa / permuta", [
    ("id", "UUID", 1), ("guardia_id", "FK", 0), ("tipo", "enum", 0),
    ("solicitante_id", "FK", 0), ("sustituto_id", "FK", 0), ("estado", "enum", 0),
], 0, 2)
ent("GUARDIA", "servicio a cubrir", [
    ("id", "UUID", 1), ("cuadrante_id", "FK", 0), ("tipo_guardia_id", "FK", 0),
    ("abogado_id", "FK", 0), ("fecha", "fecha", 0), ("estado", "enum", 0),
], 1, 2)
ent("CUADRANTE", "versión publicada", [
    ("id", "UUID", 1), ("anio", "entero", 0), ("periodo", "texto", 0),
    ("version", "entero", 0), ("estado", "enum", 0),
], 2, 2)

ent("JUSTIFICANTE", "documento acreditativo", [
    ("id", "UUID", 1), ("solicitud_id", "FK", 0), ("disponibilidad_id", "FK", 0),
    ("fecha_subida", "fecha-hora", 0),
], 0, 3)
ent("PARTE_GUARDIA", "cierre del servicio", [
    ("id", "UUID", 1), ("guardia_id", "FK", 0), ("realizada", "bool", 0),
    ("hora_entrada", "hora", 0), ("validado", "bool", 0),
], 1, 3)
ent("INCIDENCIA", "evento en guardia", [
    ("id", "UUID", 1), ("guardia_id", "FK", 0), ("categoria", "enum", 0),
    ("gravedad", "enum", 0), ("estado", "enum", 0),
], 2, 3)

ent("NOTIFICACION", "aviso y acuse", [
    ("id", "UUID", 1), ("usuario_id", "FK", 0), ("tipo", "enum", 0),
    ("canal", "enum", 0), ("estado_entrega", "enum", 0),
], 0, 4)
ent("AUDITORIA", "registro inmutable (*)", [
    ("id", "UUID", 1), ("entidad", "texto", 0), ("entidad_id", "UUID", 0),
    ("accion", "texto", 0), ("actor_id", "FK", 0),
], 1, 4)


def box_h(e):
    return HEAD + len(e["fields"]) * ROW + PAD_B


def layout():
    rows = {}
    for name, e in ENTITIES.items():
        rows.setdefault(e["row"], []).append(name)
    pos = {}
    y = TOP
    for r in sorted(rows):
        hmax = max(box_h(ENTITIES[n]) for n in rows[r])
        for n in rows[r]:
            pos[n] = (COLS[ENTITIES[n]["col"]], y)
        y += hmax + GAP
    return pos, y - GAP + 8


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def er_svg():
    pos, H = layout()
    r = {n: (pos[n][0], pos[n][1], COLW, box_h(ENTITIES[n])) for n in ENTITIES}
    o = []
    o.append(f'<svg viewBox="0 0 {CW:.0f} {H:.0f}" xmlns="http://www.w3.org/2000/svg" '
             f'font-family="Poppins, Segoe UI, sans-serif">')
    o.append('<line x1="0" y1="0" x2="0" y2="0" stroke="none"/>')

    def line(pts, dashed=False):
        d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts))
        dash = ' stroke-dasharray="4 2.6"' if dashed else ""
        o.append(f'<path d="{d}" fill="none" stroke="#9aa3b8" stroke-width="0.9"{dash}/>')

    def lab(x, y, txt, anchor="middle"):
        o.append(f'<rect x="{x - 4:.1f}" y="{y - 5.6:.1f}" width="8" height="7.2" fill="#ffffff"/>')
        o.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="5.6" fill="#232d4b" '
                 f'text-anchor="{anchor}" font-weight="700">{txt}</text>')

    G1 = (COLS[0] + COLW + COLS[1]) / 2
    G2 = (COLS[1] + COLW + COLS[2]) / 2

    # 1. USUARIO 1:1 ABOGADO
    y = r["USUARIO"][1] + 36
    line([(COLS[0] + COLW, y), (COLS[1], y)])
    lab(COLS[0] + COLW + 7, y - 2.2, "1")
    lab(COLS[1] - 7, y - 2.2, "1")

    # 2. ABOGADO 1:N HABILITACION
    x2, y2, w2, h2 = r["ABOGADO"]
    xh, yh, wh, hh = r["HABILITACION"]
    xc2 = x2 + w2 / 2
    line([(xc2, y2 + h2), (xc2, yh)])
    lab(xc2 - 6, y2 + h2 + 8, "1")
    lab(xc2 - 6, yh - 3, "N")

    # 3. HABILITACION N:1 ESPECIALIDAD
    xe, ye, we, he = r["ESPECIALIDAD"]
    line([(xh + wh, yh + 22), (G2, yh + 22), (G2, ye + 30), (xe, ye + 30)])
    lab(xh + wh + 6, yh + 19.5, "N")
    lab(xe - 6, ye + 27.5, "1")

    # 4. ESPECIALIDAD 1:N TIPO_GUARDIA
    xt, yt, wt, ht = r["TIPO_GUARDIA"]
    xc3 = xt + wt / 2
    line([(xc3, ye + he), (xc3, yt)])
    lab(xc3 - 6, ye + he + 8, "1")
    lab(xc3 - 6, yt - 3, "N")

    # 5. ABOGADO 1:N DISPONIBILIDAD
    xd, yd, wd, hd = r["DISPONIBILIDAD"]
    line([(x2, y2 + 56), (G1, y2 + 56), (G1, yd + 26), (xd + wd, yd + 26)])
    lab(x2 - 6, y2 + 53.5, "1")
    lab(xd + wd + 6, yd + 23.5, "N")

    # 6. DISPONIBILIDAD 1:N GUARDIA
    xg, yg, wg, hg = r["GUARDIA"]
    line([(xd + wd, yd + 56), (G1, yd + 56), (G1, yg + 18), (xg, yg + 18)])
    lab(xd + wd + 6, yd + 53.5, "1")
    lab(xg - 6, yg + 15.5, "N")

    # 7. TIPO_GUARDIA 1:N GUARDIA (por la banda entre filas 2 y 3)
    yb = yg - 10
    line([(xc3, yt + ht), (xc3, yb), (xg + 100, yb), (xg + 100, yg)])
    lab(xc3 + 6, yt + ht + 8, "1")
    lab(xg + 106, yg - 4, "N")

    # 8. CUADRANTE 1:N GUARDIA
    xq, yq, wq, hq = r["CUADRANTE"]
    line([(xq, yq + 46), (xg + wg, yq + 46)])
    lab(xq - 6, yq + 43.5, "1")
    lab(xg + wg + 6, yq + 43.5, "N")

    # 9. GUARDIA 1:N SOLICITUD
    xs, ys, ws, hs = r["SOLICITUD"]
    line([(xg, yg + 60), (xs + ws, yg + 60)])
    lab(xg - 6, yg + 57.5, "1")
    lab(xs + ws + 6, yg + 57.5, "N")

    # 10. GUARDIA 1:1 PARTE_GUARDIA
    xp, yp, wp, hp = r["PARTE_GUARDIA"]
    line([(xc2, yg + hg), (xc2, yp)])
    lab(xc2 - 6, yg + hg + 8, "1")
    lab(xc2 - 6, yp - 3, "1")

    # 11. GUARDIA 1:N INCIDENCIA
    xi, yi, wi, hi = r["INCIDENCIA"]
    line([(xg + wg, yg + 40), (G2, yg + 40), (G2, yi + 26), (xi, yi + 26)])
    lab(xg + wg + 6, yg + 37.5, "1")
    lab(xi - 6, yi + 23.5, "N")

    # 12. SOLICITUD 1:N JUSTIFICANTE
    xj, yj, wj, hj = r["JUSTIFICANTE"]
    xv = xs + 44
    line([(xv, ys + hs), (xv, yj)])
    lab(xv - 6, ys + hs + 8, "1")
    lab(xv - 6, yj - 3, "N")

    # 13. USUARIO 1:N NOTIFICACION (margen izquierdo)
    xn, yn, wn, hn = r["NOTIFICACION"]
    line([(COLS[0], y2 - TOP + 20), (3.2, y2 - TOP + 20), (3.2, yn + 40), (xn, yn + 40)])


    # cajas
    for name, e in ENTITIES.items():
        x, y0, w, h = r[name]
        o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}" rx="2.5" '
                 f'fill="#ffffff" stroke="#232d4b" stroke-width="0.9"/>')
        o.append(f'<path d="M{x:.1f},{y0 + HEAD:.1f} h{w:.1f}" stroke="#232d4b" stroke-width="0.7"/>')
        o.append(f'<path d="M{x + 2.5:.1f},{y0:.1f} h{w - 5:.1f} a2.5,2.5 0 0 1 2.5,2.5 v{HEAD - 2.5:.1f} '
                 f'h{-w:.1f} v{-(HEAD - 2.5):.1f} a2.5,2.5 0 0 1 2.5,-2.5 z" fill="#232d4b"/>')
        o.append(f'<text x="{x + 5:.1f}" y="{y0 + 9.2:.1f}" font-size="7.2" font-weight="700" '
                 f'fill="#ffffff" letter-spacing="0.25">{name}</text>')
        o.append(f'<text x="{x + 5:.1f}" y="{y0 + 14.4:.1f}" font-size="5.4" fill="#f9f78c">'
                 f'{esc(e["sub"])}</text>')
        for i, (f, t, pk) in enumerate(e["fields"]):
            fy = y0 + HEAD + 7.4 + i * ROW
            color = "#da1984" if pk else "#171d33"
            weight = "700" if pk else "400"
            o.append(f'<text x="{x + 5:.1f}" y="{fy:.1f}" font-size="6.2" fill="{color}" '
                     f'font-weight="{weight}">{f}</text>')
            o.append(f'<text x="{x + w - 5:.1f}" y="{fy:.1f}" font-size="5.6" fill="#5f6a85" '
                     f'text-anchor="end">{t}</text>')
    o.append('</svg>')
    return "\n".join(o)


# --------------------------------------------------------------------- índice
def toc_html(pages):
    rows = []
    for i, (num, title, _sub) in enumerate(CHAPTERS):
        annex = i >= ANNEX_FROM
        p = pages.get(num, "")
        rows.append(
            f'<div class="toc-row{" sub" if annex else ""}">'
            f'<span class="n">{num if annex else num}</span>'
            f'<span class="t">{title}</span>'
            f'<span class="d"></span>'
            f'<span class="p">{p}</span></div>'
        )
    return "\n".join(rows)


def main():
    pages = {}
    pfile = os.path.join(BASE, "pages.json")
    if os.path.exists(pfile):
        with open(pfile, encoding="utf-8") as fh:
            pages = json.load(fh)

    body = []
    for p in PARTS:
        with open(os.path.join(BASE, p), encoding="utf-8") as fh:
            body.append(fh.read())
    body = "\n".join(body)
    body = body.replace("{{TOC}}", toc_html(pages))
    body = body.replace("{{ER_SVG}}", er_svg())
    # La plantilla corporativa numera los capítulos con la cifra suelta.
    body = re.sub(r'<span class="chnum">(?:Capítulo|Anexo)\s+([0-9]+|[A-C])</span>',
                  r'<span class="chnum">\1</span>', body)

    css = open(os.path.join(BASE, "style.css"), encoding="utf-8").read()
    css = css.replace("__FONTDIR__", "fonts").replace("__ASSETDIR__", "assets")
    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Gestión del Turno de Oficio · Colegio de la Abogacía de Tarragona</title>
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""
    out = os.path.join(BASE, "documento.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("HTML:", out, len(html), "bytes")


if __name__ == "__main__":
    main()
