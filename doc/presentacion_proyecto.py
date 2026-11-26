# -*- coding: utf-8 -*-
"""Presentación del proyecto Turno de Oficio: funcionamiento completo, diagrama
del modelo de datos y stack tecnológico (plantilla Inetum, 16:9).

Reutiliza la infraestructura de doc/render_pildora.py (CSS base, Chromium).
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

HTML = BASE / "presentacion_proyecto.html"
RAW = BASE / "_raw_presentacion.pdf"
OUT = ROOT / "entregables" / "Presentacion_Funcionalidad_y_Stack.pdf"

REF = "TOF-2026-023"
DOC = "Presentación · Funcionalidad y stack"
CLASIF = "Internal"

CSS_EXTRA = """
.body.tight { padding-top: 26pt; padding-bottom: 52pt; }
.body.tight h1 { font-size: 23pt; }
.body.tight .lead { font-size: 10pt; line-height: 1.45; margin-top: 10pt; max-width: 848pt; }
.body.tight table { margin-top: 14pt; }

table.stack td:first-child { width: 19%; }
table.stack td:nth-child(2) { width: 42%; }
table.stack td { font-size: 10.2pt; padding: 7pt 9pt; }
table.stack th { font-size: 8.6pt; }

/* --- diagrama entidad-relación --- */
.er { display: block; margin-top: 12pt; }
.er .bx { fill: #ffffff; stroke: #c9cfdd; stroke-width: 0.8; }
.er .hd { fill: #232d4b; }
.er .nm { fill: #f5f340; font-size: 6.3pt; font-weight: 600; letter-spacing: 0.5px; }
.er .fd { fill: #4a5470; font-size: 5.9pt; }
.er .core .bx { fill: #fdf4f9; stroke: #da1984; stroke-width: 1.1; }
.er .core .hd { fill: #da1984; }
.er .core .nm { fill: #ffffff; font-size: 7pt; }
.er .ln { fill: none; stroke: #8d97ae; stroke-width: 0.9; }
.er .ln.dash { stroke-dasharray: 2.6 2; }
.er .tag { fill: #7a8399; font-size: 5.6pt; font-weight: 500; }
.er .lgh { fill: #da1984; font-size: 6.2pt; font-weight: 700; letter-spacing: 0.9px; }
.er .lgt { fill: #4a5470; font-size: 6pt; }
"""

# ------------------------------------------------------------------ diagrama
# lienzo 848 x 300 pt; 5 columnas de 152 pt (paso 174) y 4 filas de 66 (paso 78)
W, H = 848, 328
COL = [0, 174, 348, 522, 696]
ROW = [0, 86, 172, 258]
BW, BH = 152, 70

ENTIDADES = {
    "usuario": (COL[0], ROW[0], BW,
                ["id · uuid", "email · único", "rol · 5 valores", "estado · 3 valores"]),
    "abogado": (COL[1], ROW[0], BW,
                ["id · uuid", "usuario_id →", "num_colegiado · único", "activo"]),
    "habilitacion": (COL[2], ROW[0], BW,
                     ["id · uuid", "abogado_id →", "especialidad_id →", "estado · 4 valores"]),
    "especialidad": (COL[3], ROW[0], BW,
                     ["id · uuid", "codigo · único", "exige_formacion"]),
    "tipo_guardia": (COL[4], ROW[0], BW,
                     ["id · uuid", "especialidad_id →", "modalidad · franja", "peso_computo"]),
    "disponibilidad": (COL[0], ROW[1], BW,
                       ["id · uuid", "abogado_id →", "desde / hasta", "categoria (sin causa)"]),
    "cuadrante": (COL[1], ROW[1], BW,
                  ["id · uuid", "anio · periodo · version", "estado · 5 valores"]),
    "notificacion": (COL[4], ROW[1], BW,
                     ["id · uuid", "referencia_tipo / id", "canal · estado", "leida_en"]),
    "solicitud": (COL[0], ROW[2], BW,
                  ["id · uuid", "guardia_id →", "tipo · estado", "motivo · 5 valores"]),
    "justificante": (COL[1], ROW[2], BW,
                     ["id · uuid", "solicitud_id →", "referencia (no binario)", "acceso_restringido"]),
    "parte_guardia": (COL[2], ROW[2], BW,
                      ["id · uuid", "guardia_id → (1:1)", "horas_reales", "estado · validado"]),
    "incidencia": (COL[3], ROW[2], BW,
                   ["id · uuid", "guardia_id →", "categoria · gravedad", "fecha_cierre"]),
    "auditoria": (COL[4], ROW[2], BW,
                  ["id · bigserial", "entidad · accion", "actor · fecha · origen", "append-only"]),
    "parametro": (COL[0], ROW[3], BW,
                  ["clave · version", "valor · jsonb", "vigencia_desde / hasta"]),
}
CORE = ("guardia", 348, ROW[1], 326,
        ["id · uuid", "cuadrante_id → (urgente: nulo)", "titular_id → abogado",
         "inicio_en / fin_en · timestamptz", "estado (10) · origen"])

# (puntos, discontinuo, etiqueta opcional)
RELACIONES = [
    ([(152, 35), (174, 35)], False, None),
    ([(326, 35), (348, 35)], False, None),
    ([(500, 35), (522, 35)], False, None),
    ([(674, 35), (696, 35)], False, None),
    ([(250, 70), (250, 78), (76, 78), (76, 86)], False, None),
    ([(290, 70), (290, 78), (390, 78), (390, 86)], False, None),
    ([(326, 121), (348, 121)], False, None),
    ([(720, 70), (720, 78), (660, 78), (660, 86)], False, None),
    ([(674, 121), (696, 121)], False, None),
    ([(360, 156), (360, 164), (76, 164), (76, 172)], False, None),
    ([(400, 156), (400, 172)], False, None),
    ([(560, 156), (560, 172)], False, None),
    ([(152, 207), (174, 207)], False, None),
    ([(674, 144), (686, 144), (686, 207), (696, 207)], True, None),
]


def _caja(nombre, x, y, w, campos, core=False):
    alto = 16
    partes = [f'<g class="ent{" core" if core else ""}">',
              f'<rect class="bx" x="{x}" y="{y}" width="{w}" height="{BH}" rx="2"/>',
              f'<rect class="hd" x="{x}" y="{y}" width="{w}" height="{alto}" rx="2"/>',
              f'<rect class="hd" x="{x}" y="{y + alto - 3}" width="{w}" height="3"/>',
              f'<text class="nm" x="{x + 7}" y="{y + 11}">{nombre.upper()}</text>']
    for i, campo in enumerate(campos):
        partes.append(f'<text class="fd" x="{x + 7}" y="{y + 25 + i * 8.2}">{campo}</text>')
    partes.append("</g>")
    return "".join(partes)


def svg_diagrama():
    partes = [f'<svg class="er" viewBox="0 0 {W} {H}" width="{W}pt" height="{H}pt">',
              '<defs><marker id="ar" viewBox="0 0 6 6" refX="5.4" refY="3" '
              'markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
              '<path d="M0,0 L6,3 L0,6 z" fill="#8d97ae"/></marker></defs>']
    for pts, dash, tag in RELACIONES:
        d = "M " + " L ".join(f"{x},{y}" for x, y in pts)
        clase = "ln dash" if dash else "ln"
        partes.append(f'<path class="{clase}" d="{d}" marker-end="url(#ar)"/>')
        if tag:
            x, y = pts[1]
            partes.append(f'<text class="tag" x="{x + 3}" y="{y - 2}">{tag}</text>')
    for nombre, (x, y, w, campos) in ENTIDADES.items():
        partes.append(_caja(nombre, x, y, w, campos))
    partes.append(_caja(CORE[0], CORE[1], CORE[2], CORE[3], CORE[4], core=True))
    partes.append(f'<text class="lgh" x="{COL[1]}" y="274">CÓMO SE LEE</text>')
    for i, linea in enumerate([
        "1 — 1   Una cuenta por colegiado (USUARIO–ABOGADO) y un parte por guardia (GUARDIA–PARTE_GUARDIA).",
        "1 — N   Un abogado acumula guardias, solicitudes y disponibilidades; un cuadrante, muchas guardias.",
        "Discontinua   AUDITORIA registra cualquier entidad sin FK; PARAMETRO es configuración versionada.",
    ]):
        partes.append(f'<text class="lgt" x="{COL[1]}" y="{288 + i * 10}">{linea}</text>')
    partes.append("</svg>")
    return "".join(partes)


# ------------------------------------------------------------------ contenido

SLIDES = [
    dict(
        kind="cover",
        kicker="Presentación del proyecto · Sesión de equipo",
        title="Turno de Oficio:<br>funcionalidad y stack",
        sub=("Cómo funciona la aplicación de principio a fin, cómo está diseñada la base de datos "
             "y con qué tecnología se construye. Todo sale del documento consolidado TOF-2026-023."),
        date="Equipo Turno de Oficio · 26 de noviembre de 2026",
    ),
    dict(
        kind="light",
        eyebrow="Qué es",
        title="Una app para tres preguntas",
        lead=("El Colegio designa letrados de guardia: quién está cada día, quién cubre una ausencia "
              "y cómo se acredita después. La aplicación responde eso sin llamadas nocturnas."),
        cols=[
            ("¿Cuál es mi guardia de hoy?",
             "Vista del día servida en el servidor, sin depender de JavaScript: se abre en el móvil, "
             "de pie y con mala cobertura."),
            ("¿Qué pasa si no puedo?",
             "Solicitud, oferta de sustituto y resolución motivada de la coordinación, sin que la "
             "guardia quede descubierta."),
            ("¿Quién lo decidió y por qué?",
             "Cuadrante versionado y auditoría inmutable: cada acto tiene autor, fecha y motivo."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Los actores",
        title="Cinco roles, cinco ámbitos",
        points=[
            "<b>Letrado:</b> su guardia y su calendario, sus solicitudes y el cierre del parte. "
            "No decide sobre su propia solicitud ni ve causas clínicas.",
            "<b>Coordinación:</b> publica y congela cuadrantes, resuelve con motivación obligatoria, "
            "valida partes. No edita lo publicado: versiona.",
            "<b>Junta de Gobierno:</b> aprueba el cuadrante; lectura del resto.",
            "<b>Administración técnica:</b> usuarios, parámetros versionados y tareas diferidas; "
            "no ve contenido clínico.",
            "<b>Auditoría:</b> consulta sin modificar; su tabla no admite <code>UPDATE</code> ni <code>DELETE</code>.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="El flujo principal",
        title="El circuito de sustitución",
        lead=("El corazón de la app: desde que alguien no puede cubrir su guardia hasta que hay "
              "sustituto validado. En ningún paso la guardia queda sin responsable."),
        flow=[
            ("1 · Solicitud", "Me excuso",
             "Comunica la excusa o la permuta. Una sola solicitud activa por guardia."),
            ("2 · Revisión", "La coordinación mira",
             "Se admite y se busca cobertura; el titular sigue siendo responsable (RN-13/15)."),
            ("3 · Oferta", "Busco sustituto",
             "Se ofrece al letrado propuesto; en permuta hace falta doble conformidad (RN-16)."),
            ("4 · Resolución", "Motivada",
             "Estima o desestima con motivo obligatorio; se notifica y el parte cierra el ciclo."),
        ],
    ),
    dict(
        kind="light",
        eyebrow="El calendario",
        title="El cuadrante manda, y no se edita",
        lead=("Cada periodo es una versión: se monta, se alega contra él, se publica y solo cambia por "
              "excepción. La versión anterior no se borra: se sigue pudiendo consultar."),
        flow=[
            ("1 · Borrador", "Se monta",
             "Edición libre del periodo: todavía no vincula a nadie."),
            ("2 · Alegaciones", "Se opone causa",
             "El letrado alega antes de publicar; alerta si la excusa pasa de 5 días (RN-38)."),
            ("3 · Publicado", "Inmutable",
             "Con fecha y autor de publicación, y antelación mínima de 10 días (RN-21)."),
            ("4 · Congelado", "Solo excepciones",
             "Alcanzada la antelación: únicamente sustitución o urgencia, y siempre versionando."),
            ("5 · Cerrado", "Liquidado",
             "El periodo se cierra; las versiones anteriores se conservan y se consultan."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="Las reglas",
        title="Cinco reglas que no se negocian",
        rules=[
            "<b>Sin solapamiento:</b> un letrado no puede tener dos guardias a la vez (RN-04).",
            "<b>Publicado no se edita:</b> se versiona, con 10 días de antelación mínima (RN-21).",
            "<b>El acuse no condiciona la designación:</b> se publica sin esperar; sin acuse, "
            "recordatorio y escalado (RN-10/11).",
            "<b>Sin datos clínicos:</b> se guarda la indisponibilidad, nunca la causa (RN-23, RGPD).",
            "<b>Todo acto deja rastro:</b> quién, cuándo, qué cambió y por qué (RN-20).",
        ],
    ),
    dict(
        kind="light",
        eyebrow="El diseño de la base de datos · 1 de 2",
        title="14 entidades + PARAMETRO",
        lead=("Línea continua = clave foránea con integridad; discontinua = referencia sin FK. "
              "GUARDIA es el centro: 10 estados y solapamiento en el motor (RN-04)."),
        diagram=True,
    ),
    dict(
        kind="light",
        eyebrow="El diseño de la base de datos · 2 de 2",
        title="Lo que garantiza el motor, no el código",
        lead=("Ninguna de estas depende de que el código se porte bien: las rechaza la propia base de "
              "datos, al insertar o al borrar."),
        points=[
            "<b>RN-04 →</b> <code>EXCLUDE USING gist</code> sobre <code>tsrange(inicio_en, fin_en)</code>: "
            "la segunda guardia solapada no llega a insertarse.",
            "<b>RN-32 →</b> <code>fin_en</code> se guarda, no se calcula: cruzar medianoche es fecha+1 y editar "
            "la plantilla no reescribe el histórico.",
            "<b>RN-31 →</b> toda foránea es <code>ON DELETE RESTRICT</code>: una guardia anulada se conserva "
            "con su motivo.",
            "<b>RN-18 →</b> <code>CHECK</code> en <code>parte_guardia</code>: sin horas y actuaciones no hay "
            "parte validado.",
            "<b>RN-20/27 →</b> <code>auditoria</code> append-only con <code>REVOKE UPDATE/DELETE</code>, y "
            "<code>parametro</code> versionado en <code>jsonb</code>.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="El contrato",
        title="38 endpoints y un solo vocabulario",
        points=[
            "<b>Por recurso:</b> <code>/guardias</code>, <code>/solicitudes</code>, <code>/cuadrantes</code>, "
            "<code>/disponibilidad</code>, <code>/equidad</code>, <code>/notificaciones</code>, "
            "<code>/auditoria</code>, <code>/informes/certificacion</code>.",
            "<b>El JSON habla el idioma del modelo:</b> <code>snake_case</code> sin traducción; los UUID no "
            "cambian nunca aunque cambie el titular.",
            "<b>Transiciones explícitas:</b> <code>POST …/publicacion</code>, nunca <code>PATCH {estado}</code>; "
            "<code>Idempotency-Key</code> al crear y <code>ETag/If-Match</code> al publicar (412 si cambió).",
            "<b>Errores útiles:</b> <code>application/problem+json</code> con su regla RN; paginación por "
            "cursor, nunca por <code>offset</code>.",
            "<b>Vocabulario cerrado:</b> <code>solicitud.motivo</code> = <code>enfermedad / asunto_propio / "
            "conciliacion / fuerza_mayor / otro</code>, idéntico en el DDL y en la API.",
        ],
    ),
    dict(
        kind="light",
        eyebrow="La migración",
        title="Del Excel del Colegio a PostgreSQL",
        flow=[
            ("1 · Origen", "Lo que hay",
             "Hoja de letrados, cuadrantes e histórico de guardias. El fichero original no se toca."),
            ("2 · Staging", "Copia limpia",
             "Esquema <code>staging</code> del propio PostgreSQL: se normalizan fechas y formatos."),
            ("3 · Validado", "Lo que no pasa",
             "Unicidades, claves foráneas y reglas CUENTA/FRANJA/ESTADO; lo dudoso va a incidencia."),
            ("4 · Carga", "Lo que queda",
             "Guardias y cuadrantes con <code>auditoria.origen='migracion'</code>. "
             "HABILITACION no se migra: se acredita en la app."),
        ],
    ),
    dict(
        kind="light",
        eyebrow="El stack · 1 de 2",
        title="La aplicación: React y Node",
        headers=["Capa", "Tecnología", "Por qué"],
        table=[
            ("Frontend", "React 19 + TypeScript + Next.js 15 (SSR), PWA instalable",
             "El NFR pide la guardia de hoy sin JS y < 250 KB: eso es SSR, no una SPA."),
            ("Backend", "Node.js 22 LTS + NestJS 11 + Drizzle (SQL-first)",
             "Un solo lenguaje y un tipado de extremo a extremo; el SQL de la equidad queda visible."),
            ("Base de datos", "PostgreSQL 16 (Docker local / gestionado en la UE)",
             "Gana el ADR 32/35: exclusión por solapamiento y auditoría dentro del motor."),
            ("Identidad", "Keycloak 26 (OIDC, MFA TOTP)",
             "Open source, sin coste por usuario y federable con el IdP del Colegio."),
            ("ETL", "Python 3.12 + SQLAlchemy, staging en PostgreSQL",
             "900 letrados no justifican Airflow ni Talend: infraestructura sin carga que la pague."),
        ],
    ),
    dict(
        kind="light",
        eyebrow="El stack · 2 de 2",
        title="La plataforma alrededor",
        headers=["Capa", "Tecnología", "Por qué"],
        table=[
            ("Notificaciones", "Tabla <code>notificacion</code> + outbox: correo, SMS y Web Push VAPID",
             "Mailpit captura el correo en local: se desarrolla y se demuestra sin cuentas reales."),
            ("Ficheros", "MinIO local (S3) / S3 con KMS y URLs firmadas",
             "Los justificantes se guardan con acceso restringido, mismo código en local y en producción."),
            ("Infraestructura", "Docker Compose (0 €) / contenedores gestionados UE con WAF",
             "Un solo <code>docker compose up -d</code> lo levanta todo; 25 concurrentes no piden Kubernetes."),
            ("CI/CD", "GitHub Actions: contrato vs. rutas, tests ETL y designación, axe, Trivy",
             "Las migraciones se aplican solas; el <code>EXCLUDE gist</code> nunca se crea a mano."),
            ("Observabilidad", "Prometheus + Grafana, logs JSON, Sentry opcional",
             "Sin p95 medidos no se puede defender el 99,5 % ni los 400 ms del NFR."),
        ],
    ),
    dict(
        kind="dark",
        eyebrow="El despliegue",
        title="Dos versiones, un solo código",
        points=[
            "<b>Gratuita (el ejercicio):</b> todo en Docker Compose local con <code>docker compose up -d</code> — "
            "PostgreSQL, PgBouncer, Keycloak, Mailpit, MinIO y Grafana. 0 €, sin cuentas ni tarjeta.",
            "<b>Con presupuesto (producción real):</b> RDS PostgreSQL 16 Multi-AZ con PITR, SES, Twilio y "
            "S3/KMS en la UE. Total orientativo: 1.100–1.300 €/año.",
            "<b>Cambiar de versión es cambiar el operador, no la tecnología:</b> código, migraciones y "
            "variables de entorno son los mismos.",
        ],
    ),
    dict(
        kind="close",
        eyebrow="Para llevarse",
        title="Tres ideas para llevarse",
        points=[
            "<b>Funciona donde hace falta:</b> la guardia de hoy se sirve sin JavaScript, y el circuito de "
            "sustitución nunca deja la guardia sin responsable.",
            "<b>Las reglas viven en la base de datos:</b> solapamientos, inmutabilidad y auditoría los impone "
            "PostgreSQL, no la buena voluntad del código.",
            "<b>El stack es el que pedíamos:</b> React + Node + PostgreSQL, 0 € para arrancar y el mismo "
            "código con presupuesto cuando toque.",
        ],
        band=[("14", "entidades + PARAMETRO"), ("38", "endpoints"), ("0 €", "para arrancar")],
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


def tabla(s):
    ths = "".join(f"<th>{h}</th>" for h in s["headers"])
    filas = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in fila) + "</tr>" for fila in s["table"])
    return (f'<table class="stack"><thead><tr>{ths}</tr></thead><tbody>{filas}</tbody></table>')


def light(s, n):
    body = f'<div class="body{" tight" if s.get("diagram") else ""}">{head(s)}'
    if s.get("lead"):
        body += f'<p class="lead">{s["lead"]}</p>'
    if s.get("diagram"):
        body += svg_diagrama()
    if s.get("cols"):
        body += '<div class="cols">'
        for k, txt in s["cols"]:
            body += f'<div class="col"><div class="k">{k}</div><p>{txt}</p></div>'
        body += "</div>"
    if s.get("table"):
        body += tabla(s)
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
    partes = []
    for i, s in enumerate(SLIDES, start=1):
        partes.append({"cover": cover, "light": light, "close": close}.get(s["kind"], dark)(s, i))
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
        '<title>Presentación · Turno de Oficio</title>'
        f'<style>{rp.CSS}{CSS_EXTRA}</style></head><body>{"".join(partes)}</body></html>'
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
        "title": "Presentación · Turno de Oficio: funcionalidad y stack",
        "author": "Equipo Turno de Oficio",
        "subject": "Funcionamiento de la aplicación, modelo de datos y stack tecnológico (TOF-2026-023)",
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
