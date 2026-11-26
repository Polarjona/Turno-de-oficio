# -*- coding: utf-8 -*-
"""Extrae de la plantilla Word los recursos de marca (logotipos y fotografía).

Se ejecuta una sola vez. Requiere doc/plantilla/_preview.pdf, que se obtiene
exportando el .dotx a PDF con Word.
"""
import pathlib

import pymupdf

BASE = pathlib.Path(__file__).resolve().parent
PLANTILLA = BASE / "plantilla"
PREVIEW = PLANTILLA / "_preview.pdf"
ASSETS = BASE / "assets"


def trim(page, box, name, bright):
    """Recorta una región y ajusta al contenido real (tinta clara u oscura)."""
    region = pymupdf.Rect(*box)
    pix = page.get_pixmap(clip=region, dpi=600)
    w, h, n = pix.width, pix.height, pix.n
    s = pix.samples

    def ink(x, y):
        i = (y * w + x) * n
        r, g, b = s[i], s[i + 1], s[i + 2]
        if bright:
            return min(r, g, b) > 190
        return (r + g + b) < 620

    xs = [x for x in range(w) for y in range(0, h, 2) if ink(x, y)]
    ys = [y for y in range(h) for x in range(0, w, 2) if ink(x, y)]
    if not xs or not ys:
        print("sin contenido en", name)
        return
    sx, sy = region.width / w, region.height / h
    crop = pymupdf.Rect(region.x0 + min(xs) * sx, region.y0 + min(ys) * sy,
                        region.x0 + (max(xs) + 1) * sx, region.y0 + (max(ys) + 1) * sy)
    out = ASSETS / f"{name}.png"
    page.get_pixmap(clip=crop, dpi=600).save(out)
    print(f"{name}: {out.name} {crop.width:.1f}x{crop.height:.1f} pt")


def white_from_navy():
    """Deriva el logotipo blanco del azul: la tinta pasa a blanco opaco."""
    src = pymupdf.Pixmap(str(ASSETS / "logo_navy.png"))
    grey = pymupdf.Pixmap(pymupdf.csGRAY, src)
    w, h, g = grey.width, grey.height, grey.samples
    buf = bytearray(w * h * 4)
    for i in range(w * h):
        j = i * 4
        buf[j] = buf[j + 1] = buf[j + 2] = 255
        buf[j + 3] = 255 - g[i]
    pymupdf.Pixmap(pymupdf.csRGB, w, h, bytes(buf), 1).save(str(ASSETS / "logo_white.png"))
    print("logo_white.png generado con transparencia")


def main():
    ASSETS.mkdir(exist_ok=True)
    if not PREVIEW.exists():
        raise SystemExit("Falta plantilla/_preview.pdf: exporta el .dotx a PDF primero.")
    doc = pymupdf.open(PREVIEW)

    trim(doc[2], (66, 762, 178, 800), "logo_navy", bright=False)
    white_from_navy()
    trim(doc[2], (66, 762, 178, 800), "logo_navy", bright=False)

    for img in doc[0].get_images(full=True):
        info = doc.extract_image(img[0])
        (ASSETS / f"cover.{info['ext']}").write_bytes(info["image"])
        print(f"cover.{info['ext']}: {info['width']}x{info['height']} px")
        break


if __name__ == "__main__":
    main()
