# -*- coding: utf-8 -*-
"""Píldora del proyecto Turno de Oficio: resumen del documento consolidado
TOF-2026-023 para el equipo (10 diapositivas, 16:9, plantilla Inetum).

Reutiliza la infraestructura de doc/render_pildora.py (CSS, maquetado, Chromium).
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

HTML = BASE / "pildora_proyecto.html"
RAW = BASE / "_raw_pildora_proyecto.pdf"
OUT = ROOT / "entregables" / "Pildora_Proyecto.pdf"

REF = "TOF-2026-023"
DOC = "Píldora Proyecto · 10 min"
CLASIF = "Internal"

SLIDES = [
    dict(
        kind="cover",
        kicker="Píldora interna · 10 minutos",
        title="Turno de Oficio:<br>el proyecto en resumen",
        sub=("Qué hace la aplicación, cómo funciona por dentro, con qué tecnología se construye "
             "y qué queda por cerrar. Todo sale del documento consolidado TOF-2026-023."),
        date="Equipo Turno de Oficio · 19 de noviembre de 2026",
    ),
    dict(
        kind="light",
        eyebrow="El problema",
        title="Tres preguntas que responde la app",
        cols=[
            ("¿Cuál es mi guardia de hoy?",
             "Vista del día servida en servidor, sin depender de JavaScript: funciona en la guardia, "
             "de pie, con el móvil y sin cobertura."),
            ("¿Qué pasa si no puedo?",
             "Circuito de solicitud, oferta de sustituto y resolución motivada de la coordinación, "
             "sin que la guardia quede descubierta."),
            ("¿Quién lo decidió y por qué?",
             "Cuadrante versionado y auditoría inmutable: cada acto tiene autor, fecha y motivo."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Los actores",
        title="Cada rol ve solo lo suyo",
        points=[
            "<b>Letrado:</b> su guardia y calendario, sus solicitudes, el cierre del parte. No decide sobre su propia solicitud ni ve causas clínicas.",
            "<b>Coordinación:</b> publica y congela cuadrantes, resuelve con motivación, valida partes. No edita lo publicado: versiona.",
            "<b>Junta de Gobierno:</b> aprueba el cuadrante; lectura del resto.",
            "<b>Administración técnica:</b> usuarios y parámetros versionados; no ve contenido clínico.",
            "<b>Auditoría:</b> consulta sin modificar; la tabla no admite UPDATE ni DELETE.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Los flujos",
        title="Cómo funciona por dentro",
        flow=[
            ("1 · Solicitud", "Me excuso",
             "Comunica la solicitud; una sola activa por guardia."),
            ("2 · Oferta", "Busco sustituto",
             "Oferta enviada; en permuta, doble conformidad."),
            ("3 · Resolución", "Motivada",
             "Estima o desestima con motivo obligatorio; el titular sigue responsable en revisión."),
            ("4 · Cierre", "Parte validado",
             "Horas y actuaciones; solo el parte validado certifica y cuenta para la equidad."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Las reglas",
        title="Cinco reglas que no se negocian",
        rules=[
            "<b>Sin solapamiento:</b> un abogado no puede tener dos guardias a la vez (RN-04, en el motor).",
            "<b>Publicado no se edita:</b> se versiona, con antelación mínima de 10 días (RN-21).",
            "<b>El acuse no condiciona la designación:</b> se publica sin esperar; sin acuse, escalado y recordatorios (RN-10/11).",
            "<b>Sin datos clínicos:</b> se guarda la indisponibilidad, nunca el motivo (RN-23, RGPD).",
            "<b>Todo acto deja rastro:</b> auditoría inmutable con autor, fecha, motivos y origen.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="Los datos",
        title="14 entidades + 1, sin tablas inventadas",
        cols=[
            ("El centro: GUARDIA y CUADRANTE",
             "Guardia con instantes absolutos (<code>inicio_en/fin_en</code>); cuadrante versionado "
             "(año, periodo, versión) con ciclo borrador → cerrado."),
            ("El circuito: 5 tablas",
             "SOLICITUD, DISPONIBILIDAD, INCIDENCIA, PARTE_GUARDIA y JUSTIFICANTE: todo el "
             "ciclo de sustitución y cierre, con 1:1 entre guardia y parte."),
            ("El rastro: 3 tablas",
             "NOTIFICACION (evento–destinatario–canal), AUDITORIA append-only y PARAMETRO "
             "versionado. Más USUARIO, ABOGADO, ESPECIALIDAD, HABILITACION y TIPO_GUARDIA."),
        ],
    ),
    dict(
        kind="light",
        eyebrow="El contrato",
        title="La API: 38 endpoints ya cerrados",
        points=[
            "<b>Un solo vocabulario:</b> los campos del JSON son los del modelo, sin traducción; "
            "los UUID no cambian nunca aunque cambie el titular.",
            "<b>Transiciones explícitas:</b> <code>POST …/publicacion</code>, nunca <code>PATCH {estado}</code>; "
            "paginación por cursor y errores <code>problem+json</code> con su regla RN.",
            "<b>Seguridad de reintentos:</b> <code>Idempotency-Key</code> en lo que crea y <code>ETag/If-Match</code> "
            "al publicar el cuadrante (412 si cambió).",
            "<b>Vocabulario único:</b> <code>solicitud.motivo</code> usa <code>enfermedad / asunto_propio / conciliacion / fuerza_mayor / otro</code>, idéntico en el DDL y en la API — sin datos clínicos (RN-23).",
        ],
    ),
    dict(
        kind="light",
        eyebrow="El stack",
        title="Tecnología decidida: 10 capas",
        lead=("La base ya estaba decidida (PostgreSQL 16, 32/35 en el ADR). Esto cierra el resto, "
              "con lo que piden los requisitos, no con gustos."),
        table=[
            ("Frontend", "React 19 + Next.js 15 (SSR), PWA", "Vista de hoy sin JS y < 250 KB"),
            ("Backend", "Node 22 + NestJS 11 + Drizzle", "Un tipado compartido; SQL visible para la equidad"),
            ("Base de datos", "PostgreSQL 16", "RN-04 y auditoría en el motor; sin Flutter"),
            ("Identidad", "Keycloak 26 (OIDC, MFA)", "Sin per-seat; federable con el Colegio"),
            ("ETL / avisos", "Python + outbox (Mailpit, SMS, push VAPID)", "Probar sin cuentas reales"),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Dos versiones",
        title="Mismo código, dos operadores",
        points=[
            "<b>Gratuita (ejercicio):</b> todo en Docker Compose local con <code>docker compose up -d</code> — "
            "PostgreSQL, Keycloak, Mailpit, MinIO, PgBouncer y Grafana. 0 €, sin cuentas ni tarjeta.",
            "<b>Con presupuesto (producción):</b> RDS PostgreSQL 16 Multi-AZ, SES, Twilio y S3/KMS en la UE. "
            "Total orientativo: 1.100–1.300 €/año.",
            "<b>Cambiar de versión es cambiar el operador, no la tecnología:</b> código, migraciones y "
            "variables de entorno compartidos.",
        ],
    ),
    dict(
        kind="close",
        eyebrow="Lo que queda",
        title="Qué tenemos que cerrar juntos",
        points=[
            "<b>Medir el spike de notificaciones:</b> hace falta que el Colegio contrate correo/SMS; "
            "el stack ya deja el hueco.",
            "<b>Elegir versión para presentar:</b> gratuita de ejercicio o con presupuesto, y "
            "re-descargar el <code>openapi.yaml</code> actualizado de la tarjeta.",
        ],
        band=[("documento", "TOF-2026-023 completo"),
              ("stack", "gratuita y presupuesto"),
              ("siguiente", "el código")],
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
        body += ("<table><thead><tr><th>Capa</th><th>Decisión</th><th>Por qué</th></tr>"
                 "</thead><tbody>")
        for a, b, c in s["table"]:
            body += f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>'
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
        '<title>Píldora Proyecto · Turno de Oficio</title>'
        f'<style>{rp.CSS}</style></head><body>{"".join(parts)}</body></html>'
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
        "title": "Píldora Proyecto · Turno de Oficio",
        "author": "Equipo Turno de Oficio",
        "subject": "Resumen del proyecto Turno de Oficio: funcionamiento y stack (TOF-2026-023)",
        "creator": "Equipo Turno de Oficio",
        "producer": "Equipo Turno de Oficio",
    })
    OUT.parent.mkdir(exist_ok=True)
    doc.save(str(OUT), garbage=4, deflate=True)
    print(f"PDF: {OUT.name} · {doc.page_count} diapositivas · {OUT.stat().st_size} bytes")
    doc.close()
    RAW.unlink(missing_ok=True)
    HTML.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
