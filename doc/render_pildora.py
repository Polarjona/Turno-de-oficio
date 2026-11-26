# -*- coding: utf-8 -*-
"""Genera la píldora formativa de ETL (diapositivas 16:9) con la plantilla Inetum.

El contenido vive en SLIDES como lista de diapositivas tipadas; el maquetador
traduce cada tipo a HTML y Chromium lo exporta a un PDF de 960 x 540 pt, que es
exactamente el tamaño de la plantilla PowerPoint 2026 (13,33 x 7,5 in).
"""
import datetime
import pathlib

import pymupdf
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent

HTML = BASE / "pildora.html"
RAW = BASE / "_raw_pildora.pdf"
OUT = ROOT / "entregables" / "Pildora_ETL.pdf"

REF = "TOF-2026-004"
DOC = "Píldora ETL · 10 min"
CLASIF = "Internal"

CSS = """
@font-face { font-family:"Poppins"; font-weight:300; src:url("fonts/Poppins-Light.ttf"); }
@font-face { font-family:"Poppins"; font-weight:400; src:url("fonts/Poppins-Regular.ttf"); }
@font-face { font-family:"Poppins"; font-weight:500; src:url("fonts/Poppins-Medium.ttf"); }
@font-face { font-family:"Poppins"; font-weight:600; src:url("fonts/Poppins-SemiBold.ttf"); }
@font-face { font-family:"Poppins"; font-weight:700; src:url("fonts/Poppins-Bold.ttf"); }

@page { size: 960pt 540pt; margin: 0; }

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: "Poppins", "Segoe UI", sans-serif;
  color: #232d4b;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.slide {
  position: relative;
  width: 960pt; height: 540pt;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.slide:last-child { page-break-after: auto; }
.dark { background: #232d4b; color: #fff; }
.light { background: #fff; color: #232d4b; }

.body {
  position: absolute; left: 56pt; top: 0; width: 848pt; height: 540pt;
  padding: 38pt 0 64pt;
  display: flex; flex-direction: column; justify-content: center;
}
.body.flat { height: 468pt; padding-bottom: 26pt; }

.eyebrow {
  font-size: 8.5pt; font-weight: 600; letter-spacing: 2.2px;
  text-transform: uppercase; color: #da1984;
}
.dark .eyebrow { color: #f5f340; }
h1 {
  font-size: 27pt; font-weight: 400; line-height: 1.15; color: #232d4b;
  margin-top: 8pt; letter-spacing: -0.3px;
}
.dark h1 { color: #f5f340; }
.rule { width: 46pt; height: 2.4pt; background: #da1984; margin-top: 14pt; }
.dark .rule { background: #f5f340; }

p { font-size: 12.4pt; line-height: 1.55; }
.lead { font-size: 13pt; line-height: 1.55; margin-top: 16pt; max-width: 760pt; }

.footer {
  position: absolute; left: 32pt; right: 32pt; bottom: 11pt;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 6.8pt; letter-spacing: 0.2px;
}
.footer .l { display: flex; gap: 10pt; }
.footer .date { color: #da1984; }
.footer .ref { color: #7f7f7f; }
.dark .footer .ref { color: #9aa3b8; }
.footer .num { font-size: 9pt; color: #232d4b; }
.dark .footer .num { color: #f5f340; }

/* --- portada --- */
.band { position: absolute; right: 0; top: 0; width: 116pt; height: 540pt; background: #f5f340; }
.sq {
  position: absolute; right: 190pt; top: 40pt; width: 62pt; height: 62pt;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
}
.sq i { display: block; }
.sq i:nth-child(1) { grid-column: 2; grid-row: 1; background: #f5f340; }
.sq i:nth-child(2) { grid-column: 3; grid-row: 1; background: rgba(255, 255, 255, 0.85); }
.sq i:nth-child(3) { grid-column: 3; grid-row: 2; background: rgba(255, 255, 255, 0.45); }
.sq i:nth-child(4) { grid-column: 1; grid-row: 3; background: rgba(255, 255, 255, 0.65); }
.cover { position: absolute; left: 56pt; top: 44pt; width: 700pt; }
.cover .logo { width: 104pt; height: 17pt; overflow: hidden; }
.cover .logo img { height: 17pt; width: auto; filter: brightness(0) invert(1); }
.cover .kicker { margin-top: 76pt; }
.cover h1 { font-size: 34pt; margin-top: 8pt; }
.cover .sub { color: #fff; font-size: 12.4pt; line-height: 1.55; margin-top: 16pt; max-width: 560pt; }
.cover .r { width: 44pt; height: 2.4pt; background: #f5f340; margin: 24pt 0 9pt; }
.cover .date { color: #f5f340; font-size: 11pt; }

/* --- tarjetas --- */
.cols { display: flex; gap: 16pt; margin-top: 28pt; }
.col { flex: 1 1 0; padding-top: 11pt; border-top: 3pt solid #da1984; }
.col .k { font-size: 8.6pt; font-weight: 700; letter-spacing: 1.6px; color: #da1984; text-transform: uppercase; }
.col p { font-size: 11pt; line-height: 1.5; color: #4a5470; margin-top: 7pt; }

/* --- listas --- */
ul.pts { margin-top: 24pt; list-style: none; }
ul.pts li {
  position: relative; padding-left: 22pt; margin-bottom: 15pt;
  font-size: 12.6pt; line-height: 1.45;
}
ul.pts li:before {
  content: ""; position: absolute; left: 0; top: 6pt;
  width: 8pt; height: 8pt; background: #da1984;
}
.dark ul.pts li { color: #fff; }
.dark ul.pts li:before { background: #f5f340; }
ul.pts b { font-weight: 600; }
.dark ul.pts b { color: #f5f340; }

ol.rules { margin-top: 24pt; list-style: none; counter-reset: r; }
ol.rules li {
  counter-increment: r; position: relative; padding-left: 40pt;
  margin-bottom: 13pt; font-size: 12.2pt; line-height: 1.45; color: #fff;
}
ol.rules li:before {
  content: counter(r); position: absolute; left: 0; top: -3pt;
  font-size: 20pt; font-weight: 300; color: #f5f340;
}
ol.rules b { color: #f5f340; font-weight: 600; }

/* --- tabla --- */
table { width: 100%; border-collapse: collapse; margin-top: 24pt; }
th {
  background: #232d4b; color: #f5f340; text-align: left;
  font-size: 9pt; font-weight: 600; letter-spacing: 0.4px;
  padding: 8pt 10pt;
}
td { padding: 8pt 10pt; font-size: 10.8pt; border-bottom: 1pt solid #dfe3ec; vertical-align: top; }
tr:nth-child(even) td { background: #f7f8fb; }
td:first-child { font-weight: 600; width: 31%; }
td.risk { color: #7a8399; font-size: 10pt; }

/* --- flujo --- */
.flow { display: flex; align-items: flex-start; gap: 6pt; margin-top: 28pt; }
.step { flex: 1 1 0; border-top: 3pt solid #da1984; padding-top: 10pt; }
.step .n { font-size: 8.4pt; font-weight: 700; letter-spacing: 1.4px; color: #da1984; text-transform: uppercase; }
.step b { display: block; font-size: 12.6pt; margin: 4pt 0 6pt; }
.step p { font-size: 10.2pt; line-height: 1.45; color: #4a5470; }
.step code { font-family: "Poppins", monospace; font-size: 9.4pt; background: #f2f3f8; padding: 1pt 3pt; }
.step { position: relative; }
.close .footer { bottom: 80pt; }
.close .footer .ref { color: #9aa3b8; }
.close .footer .num { color: #f5f340; }

/* --- cierre --- */
.bandbottom {
  position: absolute; left: 0; right: 0; bottom: 0; height: 72pt;
  background: #f5f340; color: #232d4b;
  display: flex; align-items: center; gap: 30pt; padding: 0 56pt;
  font-size: 10.6pt;
}
.bandbottom .when { display: flex; align-items: baseline; gap: 9pt; }
.bandbottom b { font-weight: 600; }
.bandbottom span { font-weight: 400; font-size: 10.2pt; }
"""


# ------------------------------------------------------------------ contenido

SLIDES = [
    dict(
        kind="cover",
        kicker="Píldora interna · 10 minutos",
        title="Qué es ETL<br>y cómo lo aplicamos",
        sub=("De una hoja de cálculo al cuadrante de guardias: qué hace esta pieza del proyecto, "
             "dónde encaja y qué necesito de vosotros. Proyecto de ejercicio, sin interlocución externa."),
        date="Pol · ETL · 6 de noviembre de 2026",
    ),
    dict(
        kind="light",
        eyebrow="La definición",
        title="Tres palabras para una idea sencilla",
        lead=("Coger datos que ya existen en algún sitio, dejarlos utilizables y meterlos en el sistema "
              "nuevo. Nada más. Lo difícil no es el nombre: son las reglas."),
        cols=[
            ("1 · Extraer",
             "Traer los datos tal como están: Excel, correos, PDF, bases antiguas. Sin tocar el origen."),
            ("2 · Transformar",
             "Limpiar, normalizar y cruzar: fechas, nombres, especialidades, duplicados."),
            ("3 · Cargar",
             "Dejarlos en el modelo definitivo, validados y con rastro de dónde vienen."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Por qué nos importa",
        title="Sin datos, la aplicación arranca vacía",
        points=[
            "<b>No partimos de cero:</b> hay años de cuadrantes en Excel y correos sueltos que nadie ha normalizado.",
            "<b>Sin ETL no hay migración:</b> el sistema nace sin guardias y nadie lo usa.",
            "<b>Sin datos limpios no hay equidad demostrable:</b> el reparto deja de poder explicarse.",
            "<b>Sin trazabilidad no hay defensa:</b> ante una queja hay que decir de dónde sale cada guardia.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Nuestras fuentes",
        title="De dónde salen realmente los datos",
        table=[
            ("Hoja de cuadrante (Excel)", "Guardias, fechas y letrados asignados", "Columnas distintas cada año"),
            ("Correos de disponibilidad", "Ausencias, permutas y excusas", "Texto libre, sin formato"),
            ("Partes de guardia", "Servicio realizado y cierre", "Papel o PDF, datos a mano"),
            ("Listado de letrados", "Número, especialidad, alta y baja", "Suele estar desactualizado"),
            ("Acuerdos de reparto", "Criterios, cupos y pesos", "En actas, no en datos"),
        ],
    ),
    dict(
        kind="light",
        eyebrow="El caso concreto",
        title="Una fila de Excel hasta el cuadrante",
        flow=[
            ("1 · Extraer", "Lo que hay",
             "Fila de hoja de cálculo: «García, 12-nov, Penal, 08:00-14:00»."),
            ("2 · Transformar", "Lo que necesitamos",
             "Nº de colegiado, especialidad Penal, <code>2026-11-12</code>, franja 08:00–14:00."),
            ("3 · Validar", "Lo que no puede pasar",
             "Habilitación vigente, sin solape, dentro del cupo. Si falla, se rechaza."),
            ("4 · Cargar", "Lo que queda",
             "GUARDIA y CUADRANTE, con origen, fecha de carga y responsable."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Cómo lo hacemos",
        title="Cinco reglas que no se negocian",
        rules=[
            ("<b>El origen no se toca.</b> Se copia y se trabaja sobre la copia, "
             "nunca sobre el fichero original."),
            "<b>Todo cambio deja rastro:</b> qué se cambió, cuándo y por qué.",
            "<b>Se puede repetir:</b> cargar dos veces lo mismo no duplica nada.",
            ("<b>Datos personales, los mínimos:</b> una baja es dato de salud (art. 9 RGPD); "
             "se guarda la indisponibilidad, no el motivo."),
            "<b>Lo que no cuadra se rechaza y se avisa.</b> No se arregla en silencio.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Dónde se rompe",
        title="Los cuatro errores que ya he visto",
        points=[
            "<b>Normalizar a ojo:</b> «García» y «Garcia» son la misma persona y el sistema no lo sabe.",
            "<b>Dos formatos de fecha:</b> 12/11/2026 y 2026-11-12 conviviendo en la misma columna.",
            "<b>Cargar sin validar:</b> una guardia asignada a quien no tiene la habilitación de la materia.",
            "<b>Arreglarlo luego en Excel:</b> el dato bueno acaba en un fichero que nadie versiona.",
        ],
    ),
    dict(
        kind="close",
        eyebrow="Siguiente paso",
        title="Qué necesito de vosotros",
        points=[
            "<b>Un cuadrante de ejemplo de un mes</b>, con nombres y datos ficticios: sirve igual para probar el flujo completo.",
            "<b>20 filas de contraste revisadas por el equipo:</b> serán mi verdad de referencia para validar la carga.",
            "<b>Los tres supuestos ya cerrados</b> —15 y 7 días, pesos por tipo de la tabla 7.1 de la Propuesta (detenido 1,00 · violencia 1,00 · menores 0,90 · penal 0,75 · extranjería 0,60 · civil 0,50) y Decano con delegación— para no bloquear el arranque.",
        ],
        band=[("16 nov", "inventario cerrado"),
              ("16 nov", "flujo ETL cerrado"),
              ("19 nov", "dataset de muestra")],
    ),
]


# ------------------------------------------------------------------ maquetas

def footer(n, num=True):
    today = datetime.date.today().strftime("%d/%m/%Y")
    cifra = f'<span class="num">{n}</span>' if num else ""
    return (
        '<div class="footer"><div class="l">'
        f'<span class="date">{today}</span>'
        f'<span class="ref">©2026 Inetum | Ref. {REF} | {DOC} | Classification: {CLASIF}</span>'
        f'</div>{cifra}</div>'
    )


def head(s):
    return (f'<div class="eyebrow">{s["eyebrow"].upper()}</div>'
            f'<h1>{s["title"]}</h1><div class="rule"></div>')


def cover(s, n):
    return (
        '<section class="slide dark"><div class="band"></div>'
        '<div class="sq"><i></i><i></i><i></i><i></i></div>'
        '<div class="cover"><div class="logo"><img src="assets/logo_white.png" alt="Inetum"></div>'
        f'<div class="eyebrow kicker" style="color:#f5f340">{s["kicker"].upper()}</div>'
        f'<h1>{s["title"]}</h1><p class="sub">{s["sub"]}</p>'
        f'<div class="r"></div><div class="date">{s["date"]}</div></div>'
        f'{footer(n, num=False)}</section>'
    )


def bullets(points):
    return '<ul class="pts">' + "".join(f"<li>{p}</li>" for p in points) + "</ul>"


def light(s, n):
    body = f'<div class="body">{head(s)}'
    if s.get("lead"):
        body += f'<p class="lead">{s["lead"]}</p>'
    if s.get("cols"):
        body += '<div class="cols">'
        for k, txt in s["cols"]:
            body += f'<div class="col"><div class="k">{k}</div><p>{txt}</p></div>'
        body += "</div>"
    if s.get("table"):
        body += ("<table><thead><tr><th>Fuente</th><th>Qué aporta</th><th>Riesgo</th></tr>"
                 "</thead><tbody>")
        for a, b, c in s["table"]:
            body += f'<tr><td>{a}</td><td>{b}</td><td class="risk">{c}</td></tr>'
        body += "</tbody></table>"
    if s.get("flow"):
        body += '<div class="flow">'
        for n_, b, txt in s["flow"]:
            body += f'<div class="step"><div class="n">{n_}</div><b>{b}</b><p>{txt}</p></div>'
        body += "</div>"
    if s.get("points"):
        body += bullets(s["points"])
    body += "</div>"
    return f'<section class="slide light">{body}{footer(n)}</section>'


def dark(s, n):
    body = f'<div class="body">{head(s)}'
    if s.get("rules"):
        body += '<ol class="rules">' + "".join(f"<li>{r}</li>" for r in s["rules"]) + "</ol>"
    if s.get("points"):
        body += bullets(s["points"])
    body += "</div>"
    return f'<section class="slide dark">{body}{footer(n)}</section>'


def close(s, n):
    body = f'<div class="body flat">{head(s)}{bullets(s["points"])}</div>'
    band = "".join(f'<div class="when"><b>{d}</b><span>{t}</span></div>' for d, t in s["band"])
    return (f'<section class="slide dark close">{body}'
            f'<div class="bandbottom">{band}</div>{footer(n)}</section>')


def build_html():
    parts = []
    for i, s in enumerate(SLIDES, start=1):
        parts.append({"cover": cover, "light": light, "close": close}.get(s["kind"], dark)(s, i))
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
        '<title>Píldora ETL · Turno de Oficio</title>'
        f'<style>{CSS}</style></head><body>{"".join(parts)}</body></html>'
    )


def main():
    HTML.write_text(build_html(), encoding="utf-8")
    RAW.unlink(missing_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True,
                                    args=["--allow-file-access-from-files"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(HTML.as_uri(), wait_until="load")
        page.emulate_media(media="print")
        page.evaluate("document.fonts.ready.then(() => true)")
        page.wait_for_timeout(800)
        page.pdf(path=str(RAW), print_background=True, prefer_css_page_size=True)
        browser.close()

    doc = pymupdf.open(RAW)
    doc.set_metadata({
        "title": "Píldora ETL · Turno de Oficio",
        "author": "Pol · ETL",
        "subject": "Qué es ETL y cómo se aplica al proyecto del Turno de Oficio",
        "creator": "Equipo Turno de Oficio",
        "producer": "Equipo Turno de Oficio",
    })
    OUT.parent.mkdir(exist_ok=True)
    doc.save(str(OUT), garbage=4, deflate=True)
    print(f"PDF: {OUT.name} · {doc.page_count} diapositivas · {OUT.stat().st_size} bytes")
    doc.close()
    RAW.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
