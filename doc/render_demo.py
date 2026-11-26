# -*- coding: utf-8 -*-
"""Demo final de Dhruva (diapositivas 16:9) con la plantilla Inetum 2026.

Reutiliza el CSS y los maquetadores de render_pildora (Poppins, azul marino
#232d4b, amarillo #f5f340, magenta #da1984, portada con banda y cuadrados,
pie con referencia y clasificación). El contenido es el de la demo original
más las correcciones de la revisión: resultados del T6 pendientes sin cifras
inventadas, motivo por categorías cerradas, vocabulario del catálogo y
respaldo sin conexión.
"""
import datetime
import pathlib
import sys

import pymupdf
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE))

import render_pildora as rp  # noqa: E402

HTML = BASE / "demo.html"
RAW = BASE / "_raw_demo.pdf"
OUT = ROOT / "entregables" / "dhruva" / "Demo final · Turno de Oficio (frontend).pdf"

REF = "Demo frontend"
DOC = "Demo final · 15 min"
CLASIF = "Internal"

SLIDES = [
    dict(
        kind="cover",
        kicker="Demo final · Frontend · 15 minutos",
        title="Turno de Oficio<br>frontend",
        sub=("Gestión del Turno de Oficio — Colegio de la Abogacía de Tarragona. "
             "Aplicación para letrados y coordinación: dos recorridos en vivo sobre el prototipo."),
        date="Dhruva · Frontend · Noviembre de 2026",
    ),
    dict(
        kind="light",
        eyebrow="Guion",
        title="15 minutos y dos recorridos en vivo",
        table=[
            ("0:00–1:30", "Contexto y alcance", "Diapositivas 1–3"),
            ("1:30–3:30", "Lo que aprendimos antes de diseñar", "Diapositiva 4"),
            ("3:30–5:30", "Pantallas y sistema de diseño", "Diapositivas 5–6"),
            ("5:30–10:00", "Demo en vivo: recorrido del letrado", "Prototipo, J. Roca y M. Serra"),
            ("10:00–12:30", "Demo en vivo: recorrido de la coordinación", "Prototipo, Coordinación"),
            ("12:30–14:00", "Prueba con letrados y límites", "Diapositiva 9"),
            ("14:00–15:00", "Pendientes, entregables y preguntas", "Diapositiva 10"),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Contexto",
        title="De pie, con una mano y a plena luz",
        lead=("Un letrado necesita saber si tiene guardia hoy y si está confirmada. "
              "Tres reglas mandan en el diseño:"),
        points=[
            "<b>Publicada no es confirmada.</b>",
            "<b>La guardia es del titular hasta que el Colegio valida.</b>",
            "<b>Toda decisión lleva motivación</b> — visible también en el aviso al letrado afectado.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Antes de diseñar",
        title="Lo que aprendimos antes de dibujar",
        cols=[
            ("Benchmark",
             "Cinco referentes: ICAM, ICA Cádiz e ICAB como colegiales, Deputy y PagerDuty como "
             "genéricos. Solo información pública, sin probar las aplicaciones."),
            ("Recorrido",
             "Aviso, acuse, actuación, parte y sustitución. Cada etapa tiene momentos críticos y "
             "oportunidades de diseño; las emociones son hipótesis para la prueba."),
            ("Decisiones",
             "Estados que no dependen solo del color, un aviso legal en cada paso de la sustitución "
             "y decisiones de coordinación siempre motivadas."),
        ],
    ),
    dict(
        kind="light",
        eyebrow="Wireframes de baja fidelidad",
        title="Cuatro pantallas, una por tarea del día",
        table=[
            ("Mi guardia de hoy", "Estado, horario y acciones principales a un toque.", ""),
            ("Calendario personal", "Mes con guardias propias, sustituciones y días sin servicio.", ""),
            ("Solicitud de sustitución", "Tres pasos: motivo, quién la cubre y revisar y enviar.", ""),
            ("Cuadrante de coordinación", "Semana por materias, con pendientes y huecos sin cubrir a la vista.", ""),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Sistema de diseño mínimo",
        title="Legible de pie, con una mano y a plena luz",
        points=[
            "<b>18 px:</b> tamaño mínimo del texto principal.",
            "<b>48 px:</b> objetivo táctil mínimo; el botón principal, 60 px.",
            "<b>2 temas:</b> claro y exterior de alto contraste. <b>7:1</b> de contraste en el texto de estado.",
            "<b>Estados distinguibles sin color:</b> Confirmada · Sin acuse · En revisión · Descubierta · Sin servicio "
            "(texto + forma del borde). En el circuito: <i>oferta_enviada · pendiente_validacion · estimada · desestimada</i>.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Demo en vivo 1 · 4 min 30",
        title="Recorrido del letrado: de la solicitud al aviso",
        points=[
            "J. Roca abre Mis guardias y pulsa «Solicitar sustitución» en la del 17 de marzo.",
            "Elige el motivo (categorías cerradas del contrato, sin diagnósticos) y propone a un compañero elegible.",
            "Revisa y envía: la guardia sigue siendo suya.",
            "M. Serra abre Avisos, ve la oferta (48 h propuesto) y la acepta.",
            "<b>Qué señalar:</b> aviso legal en cada paso · motivo sin datos de salud · «Pendiente de validación», no «Confirmada».",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Demo en vivo 2 · 2 min 30",
        title="Recorrido de la coordinación: resolver con motivación",
        points=[
            "En Solicitudes, abrir el expediente pendiente.",
            "Revisar las comprobaciones: plazo, habilitación, solapamiento y cómputo.",
            "Escribir la motivación; sin ella no se puede resolver.",
            "Aprobar: se publica la versión 2 del cuadrante.",
            "Ver los avisos de los dos letrados: motivación visible en ambos y «Titular anterior: J. Roca».",
            "<b>Qué señalar:</b> la plataforma propone y comprueba; decide la coordinación · el histórico conserva al titular anterior · avisos sin datos de salud.",
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Prueba de usabilidad (T6)",
        title="Prueba con 2 letrados: cinco tareas de 3 minutos",
        points=[
            "Solicitar una sustitución con motivo y candidato.",
            "Decir de quién es la guardia tras enviar.",
            "Aceptar la oferta como sustituto.",
            "Entender el aviso de resolución (incluida la motivación).",
            "Pedir que el Colegio proponga candidato.",
            "<b>Resultados: pendientes de las sesiones del 18–19 de noviembre.</b> No se presentan cifras hasta tenerlas: "
            "tareas sin ayuda (__ de 10), hallazgo más grave (__) y corrección prioritaria (__), contra el criterio del T6 "
            "(≥ 9/10 sin ayuda, ningún crítico sin corregir, facilidad media ≥ 5).",
            "Con 2 letrados no hay estadística; denegación/devolución, exterior, sin conexión y escalada quedan para la segunda ronda.",
        ],
    ),
    dict(
        kind="close",
        eyebrow="Cierre",
        title="Pendientes y entregables",
        points=[
            "<b>Todavía pendiente:</b> tema exterior a plena luz · modo sin conexión · escalada por retraso · "
            "puntos «Verificar» de la checklist WCAG · confirmación del Colegio del plazo de respuesta (48 h propuesto) · resultados del T6 (18–20 nov).",
            "<b>Entregables:</b> T1 Benchmark · T2 Mapa de recorrido · T3 Wireframes · T4 Sistema de diseño · T5 Prototipo · T6 Prueba de usabilidad.",
            "<b>Respaldo sin conexión:</b> el prototipo es un único HTML sin recursos externos (fuente del sistema); "
            "llevar copia en USB y capturas. No activar «Modo test» durante la demo.",
        ],
        band=[("T1–T4", "diseño"),
              ("T5", "prototipo"),
              ("T6", "prueba 18–20 nov")],
    ),
]


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


def build_html():
    parts = []
    for i, s in enumerate(SLIDES, start=1):
        kind = s["kind"]
        if kind == "cover":
            # portada del motor de la píldora, con pie propio de esta demo
            parts.append(rp.cover(s, i).replace(rp.footer(i, num=False), footer(i, num=False)))
        elif kind == "light":
            body = f'<div class="body">{head(s)}'
            if s.get("lead"):
                body += f'<p class="lead">{s["lead"]}</p>'
            if s.get("cols"):
                body += '<div class="cols">' + "".join(
                    f'<div class="col"><div class="k">{k}</div><p>{t}</p></div>'
                    for k, t in s["cols"]) + "</div>"
            if s.get("table"):
                hdrs = ("Minuto", "Bloque", "Soporte") if len(s["table"][0]) == 3 and s["eyebrow"].startswith("Guion") else ("Pantalla", "Qué hace", "")
                body += "<table><thead><tr>" + "".join(f"<th>{h}</th>" for h in hdrs if h) + "</tr></thead><tbody>"
                for row in s["table"]:
                    cells = [c for c in row if c != ""]
                    body += "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"
                body += "</tbody></table>"
            if s.get("points"):
                body += rp.bullets(s["points"])
            body += "</div>"
            parts.append(f'<section class="slide light">{body}{footer(i)}</section>')
        elif kind == "dark":
            body = f'<div class="body">{head(s)}'
            if s.get("lead"):
                body += f'<p class="lead">{s["lead"]}</p>'
            if s.get("points"):
                body += rp.bullets(s["points"])
            body += "</div>"
            parts.append(f'<section class="slide dark">{body}{footer(i)}</section>')
        else:  # close
            body = f'<div class="body flat">{head(s)}{rp.bullets(s["points"])}</div>'
            band = "".join(f'<div class="when"><b>{d}</b><span>{t}</span></div>' for d, t in s["band"])
            parts.append(f'<section class="slide dark close">{body}'
                         f'<div class="bandbottom">{band}</div>{footer(i)}</section>')
    return ('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
            '<title>Demo final · Turno de Oficio</title>'
            f'<style>{rp.CSS}</style></head><body>{"".join(parts)}</body></html>')


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
        "title": "Demo final · Turno de Oficio (frontend)",
        "author": "Dhruva · Frontend",
        "subject": "Demo de 15 minutos: dos recorridos en vivo sobre el prototipo",
        "creator": "Equipo Turno de Oficio",
        "producer": "Equipo Turno de Oficio",
    })
    doc.save(str(OUT), garbage=4, deflate=True)
    print(f"PDF: {OUT.name} · {doc.page_count} diapositivas · {OUT.stat().st_size} bytes")
    doc.close()
    RAW.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
