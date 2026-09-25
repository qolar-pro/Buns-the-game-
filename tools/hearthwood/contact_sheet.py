#!/usr/bin/env python3
"""
The contact sheet the style guide asks for.

Three panels:

  1. Every texture at 8x nearest-neighbour, labelled, grouped by family. Side by
     side is the only way to see whether a set holds together — a texture that
     looks fine alone and wrong beside its neighbours is the failure this
     catches.
  2. The seamless tiles tiled 3x3, which is where a seam or an obvious repeating
     blob shows itself.
  3. The tiles as small isometric cubes, side by side. A cube shows the top and
     two sides of the same material at once, so a mismatch in light direction or
     warmth between two materials is impossible to miss.

Run: python3 contact_sheet.py <assets-build-dir> <out.png>
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

BG = (26, 24, 30, 255)
INK = (210, 200, 185, 255)
ZOOM = 8


def _load(path: str) -> Image.Image:
    return Image.open(path).convert('RGBA')


def _label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int) -> None:
    draw.text((x, y), text[:22], fill=INK)


def family_panel(root: str, families: list[str], cell: int, cols: int) -> Image.Image:
    """Every asset, scaled to a common cell, labelled, grouped by family."""
    blocks = []
    for fam in families:
        d = os.path.join(root, fam)
        if not os.path.isdir(d):
            continue
        names = sorted(f[:-4] for f in os.listdir(d) if f.endswith('.png'))
        blocks.append((fam, names))

    rows = sum(-(-len(n) // cols) for _, n in blocks) + len(blocks)
    out = Image.new('RGBA', (cols * cell, rows * (cell + 16) + 8), BG)
    draw = ImageDraw.Draw(out)

    y = 4
    for fam, names in blocks:
        _label(draw, f'--- {fam} ({len(names)}) ---', 6, y)
        y += 16
        for i, name in enumerate(names):
            col = i % cols
            if i and col == 0:
                y += cell + 16
            img = _load(os.path.join(root, fam, f'{name}.png'))
            scale = min((cell - 8) / img.width, (cell - 20) / img.height)
            w = max(1, int(img.width * scale))
            h = max(1, int(img.height * scale))
            img = img.resize((w, h), Image.NEAREST)
            out.alpha_composite(img, (col * cell + (cell - w) // 2, y + (cell - 20 - h)))
            _label(draw, name, col * cell + 3, y + cell - 18)
        y += cell + 16
    return out.crop((0, 0, out.width, min(y + 8, out.height)))


def tiling_panel(root: str, zoom: int = 3) -> Image.Image:
    """Every seamless tile, tiled 3x3. Seams and repeats show here or nowhere."""
    d = os.path.join(root, 'terrain')
    names = sorted(f[:-4] for f in os.listdir(d) if f.endswith('.png'))
    tiles = [_load(os.path.join(d, f'{n}.png')) for n in names]
    size = tiles[0].width
    block = size * 3
    cols = min(5, len(tiles))
    rows = -(-len(tiles) // cols)

    out = Image.new('RGBA', (cols * (block + 8) + 8, rows * (block + 24) + 8), BG)
    draw = ImageDraw.Draw(out)
    for i, (name, tile) in enumerate(zip(names, tiles)):
        c, rr = i % cols, i // cols
        x = 8 + c * (block + 8)
        y = 8 + rr * (block + 24)
        for ty in range(3):
            for tx in range(3):
                out.alpha_composite(tile, (x + tx * size, y + ty * size))
        _label(draw, name, x, y + block + 4)
    return out


def _iso_top(tile: Image.Image, s: int) -> Image.Image:
    """
    The top face: the tile projected into a rhombus.

    PIL's AFFINE maps OUTPUT pixels back to input ones, so these coefficients
    are the inverse of the isometric projection, not the projection itself —
    which is the usual way to get this backwards and end up with a sheared
    rectangle where a diamond should be.

    Projection: sx = (u - v) / 2 + s/2,  sy = (u + v) / 4.
    Inverse:    u = (sx - s/2) + 2 * sy, v = 2 * sy - (sx - s/2).
    """
    return tile.transform(
        (s, s // 2), Image.AFFINE, (1, 2, -s / 2, -1, 2, s / 2),
        resample=Image.NEAREST,
    )


def _iso_side(tile: Image.Image, s: int, left: bool) -> Image.Image:
    """
    One wall face: half as wide as the tile, sheared vertically.

    The left wall rises to the right and the right wall falls, so the two meet
    along the cube's near vertical edge.
    """
    face = tile.resize((s // 2, s), Image.NEAREST)
    coeffs = (1, 0, 0, 0.5, 1, -s / 4) if left else (1, 0, 0, -0.5, 1, 0)
    return face.transform((s // 2, s + s // 4), Image.AFFINE, coeffs,
                          resample=Image.NEAREST)


def cube_panel(root: str, size: int = 96) -> Image.Image:
    """
    The tiles as isometric cubes.

    One cube per material, showing a top and two sides at once. Any difference
    in light direction or warmth between two materials is obvious when their
    cubes stand next to each other, and invisible when their flat tiles do.
    """
    d = os.path.join(root, 'terrain')
    names = sorted(f[:-4] for f in os.listdir(d) if f.endswith('.png'))
    cubes = []
    for name in names:
        tile = _load(os.path.join(d, f'{name}.png')).resize((size, size), Image.NEAREST)

        # Two darker copies for the walls. One light for the whole world means
        # the top is brightest, the left wall mid and the right wall darkest.
        def shade(img, k):
            rgb = Image.eval(img.convert('RGB'), lambda v: int(v * k)).convert('RGBA')
            rgb.putalpha(img.getchannel('A'))
            return rgb

        top = _iso_top(tile, size)
        left = _iso_side(shade(tile, 0.76), size, left=True)
        right = _iso_side(shade(tile, 0.55), size, left=False)

        cube = Image.new('RGBA', (size + 2, size + size // 2 + 2), (0, 0, 0, 0))
        cube.alpha_composite(left, (0, size // 4))
        cube.alpha_composite(right, (size // 2, size // 4))
        cube.alpha_composite(top, (0, 0))
        cubes.append((name, cube))

    cw = cubes[0][1].width + 14
    out = Image.new('RGBA', (len(cubes) * cw + 8, cubes[0][1].height + 30), BG)
    draw = ImageDraw.Draw(out)
    for i, (name, cube) in enumerate(cubes):
        out.alpha_composite(cube, (8 + i * cw, 4))
        _label(draw, name, 8 + i * cw, cube.height + 8)
    return out


def main(root: str, out_path: str) -> None:
    families = ['terrain', 'world', 'items', 'characters', 'ui']
    panels = [
        family_panel(root, families, cell=104, cols=14),
        tiling_panel(root),
        cube_panel(root),
    ]
    width = max(p.width for p in panels)
    height = sum(p.height + 12 for p in panels)
    sheet = Image.new('RGBA', (width, height), BG)
    y = 0
    for p in panels:
        sheet.alpha_composite(p, (0, y))
        y += p.height + 12
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    sheet.save(out_path)
    print(f'{out_path}  {sheet.width}x{sheet.height}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../../assets-build',
         sys.argv[2] if len(sys.argv) > 2 else '../../docs/contact/hearthwood.png')
