# -*- coding: utf-8 -*-
"""Renderiza un entregable breve con la plantilla corporativa."""
import os
import pathlib
import sys

import pymupdf
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE))

import theme  # noqa: E402

FONTS = BASE / "fonts"
ASSETS = BASE / "assets"


def _rel(path, base):
    return os.path.relpath(path, base).replace(os.sep, "/")


def build(src, out, *, ref, filename, title, subject):
    css = (BASE / "style.css").read_text(encoding="utf-8")
    css = css.replace("__FONTDIR__", _rel(FONTS, src.parent))
    css = css.replace("__ASSETDIR__", _rel(ASSETS, src.parent))
    html = src.read_text(encoding="utf-8").replace("</head>", f"<style>\n{css}\n</style>\n</head>", 1)
    tmp = src.with_suffix(".tmp.html")
    tmp.write_text(html, encoding="utf-8")

    raw = BASE / "_tmp.pdf"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True,
                                    args=["--allow-file-access-from-files"])
        page = browser.new_page(viewport={"width": 1240, "height": 1754})
        page.goto(tmp.as_uri(), wait_until="load")
        page.emulate_media(media="print")
        page.evaluate("document.fonts.ready.then(() => true)")
        page.wait_for_timeout(600)
        page.pdf(path=str(raw), print_background=True, prefer_css_page_size=True)
        browser.close()
    tmp.unlink(missing_ok=True)

    doc = pymupdf.open(raw)
    theme.chrome(doc, ref=ref, filename=filename, classification="Internal",
                 skip_cover=False, title=title, subject=subject,
                 author="Equipo Turno de Oficio")
    theme.save(doc, out)
    raw.unlink(missing_ok=True)


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "01_mapa_normativo"
    src = BASE / "entregables" / f"{name}.html"
    out = ROOT / "entregables" / "Mapa_Normativo.pdf"
    out.parent.mkdir(exist_ok=True)
    build(src, out, ref="TOF-2026-003", filename="Entregable 1 · Mapa normativo",
          title="Mapa normativo: qué obliga la ley al Turno de Oficio",
          subject="Reglas legales que la aplicación no puede contradecir")
