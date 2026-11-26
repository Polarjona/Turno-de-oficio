# -*- coding: utf-8 -*-
"""Renderiza la propuesta funcional completa con la plantilla corporativa."""
import json
import pathlib
import subprocess
import sys

import pymupdf
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE))

import build   # noqa: E402
import theme   # noqa: E402

HTML = BASE / "documento.html"
RAW = BASE / "_raw.pdf"
FINAL = ROOT / "Propuesta_Funcional_Turno_de_Oficio_Tarragona.pdf"
PAGES = BASE / "pages.json"

COVER = dict(
    kicker="Propuesta funcional · Documento de análisis",
    title=["Gestión del", "Turno de Oficio"],
    subtitle=("Plataforma de planificación, cobertura y control de las guardias "
              "del servicio de asistencia jurídica gratuita"),
    meta=[
        ("Cliente", "Colegio de la Abogacía de Tarragona — Servicio de Turno de Oficio"),
        ("Objeto", "Digitalización integral de la planificación y el control de guardias"),
        ("Naturaleza", "Documento funcional de análisis. No contiene decisiones de arquitectura técnica ni de proveedor."),
        ("Versión", "1.0 — 5 de noviembre de 2026"),
        ("Destinatarios", "Junta de Gobierno · Coordinación del Turno de Oficio · Comisión de valoración del proyecto"),
    ],
    footnote=("Documento de trabajo. Las referencias normativas se incluyen con finalidad orientativa y deben "
              "contrastarse con las normas colegiales vigentes y con el asesoramiento jurídico del Colegio antes de "
              "su traslado a especificaciones de desarrollo. Las cifras de los ejemplos son ilustrativas y no "
              "reproducen datos reales."),
)


def norm(s):
    return " ".join(s.replace("’", "'").split())


def render():
    if RAW.exists():
        RAW.unlink()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True,
                                    args=["--allow-file-access-from-files"])
        page = browser.new_page(viewport={"width": 1240, "height": 1754})
        page.goto(HTML.as_uri(), wait_until="load")
        page.emulate_media(media="print")
        page.evaluate("document.fonts.ready.then(() => true)")
        page.wait_for_timeout(600)
        page.pdf(path=str(RAW), print_background=True, prefer_css_page_size=True)
        browser.close()
    return pymupdf.open(RAW)


def chapter_pages(doc):
    texts = [norm(doc[i].get_text()) for i in range(doc.page_count)]
    found, cursor = {}, 2
    for num, title, _ in build.CHAPTERS:
        t = norm(title)
        for i in range(cursor, len(texts)):
            if t in texts[i]:
                found[num] = str(i + 1)
                cursor = i
                break
    return found


def main():
    doc = render()
    pages = chapter_pages(doc)

    old = json.loads(PAGES.read_text(encoding="utf-8")) if PAGES.exists() else {}
    if old != pages:
        doc.close()
        PAGES.write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")
        subprocess.run([sys.executable, str(BASE / "build.py")], check=True)
        doc = render()
        pages = chapter_pages(doc)
        PAGES.write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Páginas:", doc.page_count)
    print("Índice:", pages)
    miss = [n for n, _t, _ in build.CHAPTERS if n not in pages]
    if miss:
        print("AVISO capítulos no localizados:", miss)

    theme.cover_page(doc, **COVER)
    theme.chrome(
        doc,
        ref="TOF-2026-001",
        filename="Propuesta funcional · Gestión del Turno de Oficio",
        classification="Internal",
        skip_cover=True,
        title="Gestión del Turno de Oficio · Propuesta funcional",
        subject="Planificación, cobertura y control de guardias del servicio de asistencia jurídica gratuita",
        author="Equipo Turno de Oficio",
    )
    theme.save(doc, FINAL)


if __name__ == "__main__":
    main()
