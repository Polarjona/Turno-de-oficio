# -*- coding: utf-8 -*-
"""Renderiza el diseño funcional resumido con la plantilla corporativa."""
import json
import pathlib
import subprocess
import sys

import pymupdf
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE))

import build_compacto as C  # noqa: E402
import theme                # noqa: E402

HTML = BASE / "documento_compacto.html"
RAW = BASE / "_raw_compacto.pdf"
FINAL = ROOT / "Diseno_Funcional_Turno_de_Oficio_Tarragona.pdf"
PAGES = BASE / "pages_compacto.json"

COVER = dict(
    kicker="Diseño funcional · Versión ejecutiva",
    title=["Gestión del", "Turno de Oficio"],
    subtitle=("Planificación, cobertura y control de las guardias del servicio "
              "de asistencia jurídica gratuita"),
    meta=[
        ("Cliente", "Colegio de la Abogacía de Tarragona — Turno de Oficio"),
        ("Objeto", "Diseño funcional de la aplicación de gestión de guardias"),
        ("Versión", "1.1 — resumen ejecutivo · 5 de noviembre de 2026"),
        ("Destinatarios", "Junta de Gobierno · Coordinación del Turno · Equipo de desarrollo"),
    ],
    footnote=("Versión resumida del documento funcional completo. Describe cómo funcionará la aplicación y qué "
              "modelo de información la sostiene, sin decisiones de arquitectura técnica. Las referencias normativas "
              "son orientativas y deben contrastarse con las normas colegiales vigentes y con el asesoramiento "
              "jurídico del Colegio. Los nombres y cifras de los ejemplos son ilustrativos."),
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
    for num, title, _ in C.CHAPTERS:
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
        subprocess.run([sys.executable, str(BASE / "build_compacto.py")], check=True)
        doc = render()
        pages = chapter_pages(doc)
        PAGES.write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Páginas:", doc.page_count)
    print("Índice:", pages)
    miss = [n for n, _t, _ in C.CHAPTERS if n not in pages]
    if miss:
        print("AVISO capítulos no localizados:", miss)

    theme.cover_page(doc, **COVER)
    theme.chrome(
        doc,
        ref="TOF-2026-002",
        filename="Diseño funcional · Gestión del Turno de Oficio",
        classification="Internal",
        skip_cover=True,
        title="Gestión del Turno de Oficio · Diseño funcional",
        subject="Planificación, cobertura y control de guardias del servicio de asistencia jurídica gratuita",
        author="Equipo Turno de Oficio",
    )
    theme.save(doc, FINAL)


if __name__ == "__main__":
    main()
