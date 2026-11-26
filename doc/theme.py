# -*- coding: utf-8 -*-
"""Elementos de página de la plantilla corporativa Inetum 2026.

Concentra la paleta, la tipografía y el mobiliario de página —barra amarilla,
cuadrados de marca, logotipo, pie con referencia y clasificación y portada—
para que los tres documentos del proyecto compartan el mismo aspecto.

Portada y pie se dibujan sobre el PDF ya renderizado: así las coordenadas son
exactas y no dependen de cómo pagina el motor de impresión.
"""
import datetime
import pathlib

import pymupdf

BASE = pathlib.Path(__file__).resolve().parent
ASSETS = BASE / "assets"
FONTS = BASE / "fonts"

NAVY = (0x23 / 255, 0x2D / 255, 0x4B / 255)
YELLOW = (0xF5 / 255, 0xF3 / 255, 0x40 / 255)
MAGENTA = (0xDA / 255, 0x19 / 255, 0x84 / 255)
GREY = (0x5F / 255, 0x6A / 255, 0x85 / 255)
HAIRLINE = (0.90, 0.91, 0.94)

MM = 72.0 / 25.4
BAR = 7.0 * MM               # barra amarilla pegada al borde derecho
CLUSTER = 9.0 * MM           # lado del conjunto de cuadrados de marca
MARGIN = 25.0 * MM
LOGO_W = 30.0 * MM
LOGO_H = 5.6 * MM

# Posiciones de las casillas dentro del cuadrado de marca (de image2.svg).
CELLS = [(1, 0, 1.0), (2, 0, 0.80), (2, 1, 0.50), (0, 2, 0.75)]


# --------------------------------------------------------------- tipografía

def _font(weight="regular"):
    name = {"light": "Poppins-Light.ttf", "regular": "Poppins-Regular.ttf",
            "semi": "Poppins-SemiBold.ttf", "bold": "Poppins-Bold.ttf"}[weight]
    path = FONTS / name
    if path.exists():
        return pymupdf.Font(fontfile=str(path))
    return pymupdf.Font("helv")


def _put(page, x, y, text, font, size, color):
    """Escribe una línea con su línea base en `y`."""
    writer = pymupdf.TextWriter(page.rect)
    writer.append(pymupdf.Point(x, y), text, font=font, fontsize=size)
    writer.write_text(page, color=color)


def _wrap(text, font, size, width):
    lines, current = [], ""
    for word in text.split():
        probe = f"{current} {word}".strip()
        if font.text_length(probe, fontsize=size) <= width or not current:
            current = probe
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ------------------------------------------------------------- ornamentos

def _squares(page, x, y, side, color):
    cell = side / 3.0
    for col, row, alpha in CELLS:
        rect = pymupdf.Rect(x + col * cell, y + row * cell,
                            x + (col + 1) * cell, y + (row + 1) * cell)
        page.draw_rect(rect, color=None, fill=color, width=0, fill_opacity=alpha)


def _register(page, font, alias):
    """Registra la fuente en la página con un alias válido como recurso PDF."""
    page.insert_font(fontname=alias, fontbuffer=font.buffer)
    return alias


# ----------------------------------------------------------------- portada

def cover_page(doc, *, kicker, title, subtitle, meta, footnote):
    """Compone la portada corporativa sobre la primera página del PDF."""
    page = doc[0]
    w, h = page.rect.width, page.rect.height

    photo = ASSETS / "cover.jpeg"
    if photo.exists():
        grey = pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.Pixmap(str(photo)))
        page.insert_image(page.rect, pixmap=grey)

    # Velo de marca en degradado: asegura contraste del titular sobre la foto.
    def scrim(y0, y1, a0, a1, steps=18):
        for i in range(steps):
            ya = y0 + (y1 - y0) * i / steps
            yb = y0 + (y1 - y0) * (i + 1) / steps
            page.draw_rect(pymupdf.Rect(0, ya, w, yb + 0.4), color=None,
                           fill=NAVY, width=0,
                           fill_opacity=a0 + (a1 - a0) * (i + 0.5) / steps)

    scrim(84 * MM, 106 * MM, 0.0, 0.60)
    scrim(106 * MM, 170 * MM, 0.60, 0.60, steps=1)
    scrim(170 * MM, 187 * MM, 0.60, 0.0)

    logo = ASSETS / "logo_white.png"
    if logo.exists():
        page.insert_image(
            pymupdf.Rect(MARGIN, 16 * MM, MARGIN + 38 * MM, 16 * MM + 38 * MM * 0.19),
            filename=str(logo), keep_proportion=True)
    _squares(page, w - 37 * MM, 14 * MM, 15 * MM, YELLOW)

    light, regular, semi = _font("light"), _font("regular"), _font("semi")
    _put(page, MARGIN, 112 * MM, kicker.upper(), semi, 7.6, YELLOW)

    y = 126 * MM
    for line in title:
        _put(page, MARGIN, y, line, light, 34, YELLOW)
        y += 14.2 * MM

    y += 3.4 * MM
    for line in _wrap(subtitle, semi, 12.2, 116 * MM):
        _put(page, MARGIN, y, line, semi, 12.2, (1, 1, 1))
        y += 7.2 * MM

    # Panel de datos
    page.draw_rect(pymupdf.Rect(0, 187 * MM, w, 291 * MM), color=None,
                   fill=(1, 1, 1), width=0)
    page.draw_rect(pymupdf.Rect(0, 187 * MM, w, 188.6 * MM), color=None,
                   fill=MAGENTA, width=0)
    y = 197.5 * MM
    for label, value in meta:
        _put(page, MARGIN, y, label.upper(), semi, 6.6, MAGENTA)
        lines = _wrap(value, regular, 8.1, 126 * MM)
        for i, line in enumerate(lines):
            _put(page, 52 * MM, y + i * 4.3 * MM, line, regular, 8.1, NAVY)
        y += len(lines) * 4.3 * MM + 2.6 * MM
        page.draw_line(pymupdf.Point(MARGIN, y - 1.7 * MM),
                       pymupdf.Point(w - MARGIN, y - 1.7 * MM),
                       color=HAIRLINE, width=0.4)

    yf = 259 * MM
    for line in _wrap(footnote, regular, 6.6, 156 * MM):
        _put(page, MARGIN, yf, line, regular, 6.6, GREY)
        yf += 3.3 * MM

    page.draw_rect(pymupdf.Rect(0, 291 * MM, w, h + 1), color=None,
                   fill=MAGENTA, width=0)


# --------------------------------------------------------- pie de página

def chrome(doc, *, ref, filename, classification="Internal", skip_cover=True,
           date=None, title=None, subject=None, author="Equipo Turno de Oficio"):
    """Estampa barra, cuadrados, logotipo y pie en todas las páginas de contenido."""
    total = doc.page_count
    stamp_date = date or datetime.date.today().strftime("%d/%m/%Y")
    reg, semi = _font("regular"), _font("semi")

    for i, page in enumerate(doc):
        if skip_cover and i == 0:
            continue
        w, h = page.rect.width, page.rect.height
        page.draw_rect(pymupdf.Rect(w - BAR, -1, w + 1, h + 1), color=None,
                       fill=YELLOW, width=0)
        _squares(page, w - BAR - 5 * MM - CLUSTER, 7 * MM, CLUSTER, NAVY)

        logo = ASSETS / "logo_navy.png"
        if logo.exists():
            page.insert_image(pymupdf.Rect(MARGIN, h - 26 * MM, MARGIN + LOGO_W,
                                           h - 26 * MM + LOGO_H),
                              filename=str(logo), keep_proportion=True)

        alias = _register(page, reg, "inureg")
        _register(page, semi, "inusemi")
        x = MARGIN + LOGO_W + 7 * MM
        _put(page, x, h - 17.4 * MM,
             f"{stamp_date}   |   ©2026 Inetum   |   Ref. {ref}   |   {filename}",
             reg, 6.2, NAVY)
        _put(page, x, h - 13.2 * MM, f"Classification: {classification}",
             reg, 6.2, GREY)

        # La página se numeró en el paso anterior con la fuente ya registrada.
        num = f"{i + 1} / {total}"
        page.insert_text(pymupdf.Point(w - BAR - 9 * MM, h - 17.4 * MM), num,
                         fontname=alias, fontsize=6.2, color=NAVY,
                         render_mode=0, morph=None)

    doc.set_metadata({
        "title": title or filename,
        "author": author,
        "subject": subject or "",
        "creator": "Equipo Turno de Oficio",
        "producer": "Equipo Turno de Oficio",
    })


def save(doc, out):
    doc.save(str(out), garbage=4, deflate=True)
    size = pathlib.Path(out).stat().st_size
    print(f"PDF: {pathlib.Path(out).name} · {doc.page_count} pág. · {size} bytes")
    doc.close()
