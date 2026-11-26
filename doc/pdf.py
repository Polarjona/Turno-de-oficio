# -*- coding: utf-8 -*-
"""Renderiza documento.html a PDF con Playwright (Chromium de Edge o descargado)."""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
HTML = BASE / "documento.html"
OUT = BASE / "_raw.pdf"


def main():
    if OUT.exists():
        OUT.unlink()
    with sync_playwright() as p:
        browser = None
        for kwargs in ({"channel": "msedge"}, {"channel": "chrome"}, {}):
            try:
                browser = p.chromium.launch(headless=True, **kwargs)
                print("navegador:", kwargs or "chromium descargado")
                break
            except Exception as exc:  # noqa: BLE001
                print("fallo con", kwargs, "->", str(exc).splitlines()[0][:160])
        if browser is None:
            raise SystemExit("No hay navegador disponible")
        page = browser.new_page(viewport={"width": 1240, "height": 1754})
        page.goto(HTML.as_uri(), wait_until="load")
        page.emulate_media(media="print")
        page.wait_for_timeout(1200)
        page.pdf(path=str(OUT), print_background=True, prefer_css_page_size=True)
        browser.close()
    print("PDF:", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
