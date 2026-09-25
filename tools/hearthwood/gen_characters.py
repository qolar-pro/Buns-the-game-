"""
Characters: one model each, rendered to a walk sheet.

Every sheet is four rows — down, left, right, up, the order the engine already
reads — of the SAME model turned about its vertical axis, with the limbs
swinging through one stride across the columns. The old pipeline generated four
separate images per character and composed frames by wobbling them; nothing
guaranteed the four were the same creature, and they were not.

Run: python3 gen_characters.py [outdir]
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

from characters import CAST
from hw.core import count_colours, lone_pixels
from hw.model import FACINGS, render_model, sheet, silhouette


def lone_in_frames(model, cols: int, w: int, h: int) -> int:
    """
    Strays counted per frame, without wrapping.

    Counting on the assembled sheet wraps column 0 round to the last column, so
    a sprite that touches its cell edge is reported as dirty when it is not.
    The frame is what the engine draws, so the frame is what gets checked.
    """
    import numpy as _np
    worst = 0
    for facing in FACINGS:
        for col in range(cols):
            img = render_model(model, facing, col / cols, w, h)
            a = img[..., 3] > 0
            key = img[..., :3].astype(_np.int64)
            key = (key[..., 0] << 16) | (key[..., 1] << 8) | key[..., 2]
            key = _np.where(a, key, -1)
            lonely = a.copy()
            for axis, amount in ((0, 1), (0, -1), (1, 1), (1, -1)):
                k = _np.roll(key, amount, axis)
                sl = [slice(None)] * 2
                sl[axis] = 0 if amount > 0 else -1
                k[tuple(sl)] = -1
                lonely &= (key != k)
            worst = max(worst, int(lonely.sum()))
    return worst

#: Cell size. The player is taller, as it always has been.
#:
#: Matched to the props. A character drawn at 32 next to a house drawn at 128 is
#: four times chunkier than everything it stands beside, and no amount of shared
#: palette makes that read as one world — pixel density is as much a part of a
#: style as colour is.
CELL = {'player': (128, 192)}
DEFAULT_CELL = (128, 128)


def cell_for(name: str) -> tuple[int, int]:
    return CELL.get(name, DEFAULT_CELL)


def build(out_dir: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, (model, cols) in CAST.items():
        w, h = cell_for(name)
        img = sheet(model, cols, w, h)
        Image.fromarray(img, mode='RGBA').save(f'{out_dir}/{name}.png', optimize=True)

        # The thing worth checking: is every facing the same model?
        #
        # The test is on GEOMETRY, not on pixels. The whole set is lit from the
        # upper left, so a character walking left has the light on its face and
        # the same character walking right has it on its back — the rendered
        # pixels differ, and must. What has to match is the shape, in every
        # frame of the stride, not just the standing one.
        mirrored = all(
            np.array_equal(silhouette(model, 'left', c / cols, w, h),
                           np.fliplr(silhouette(model, 'right', c / cols, w, h)))
            for c in range(cols)
        )
        same_bulk = all(
            silhouette(model, 'down', c / cols, w, h).sum()
            == silhouette(model, 'up', c / cols, w, h).sum()
            for c in range(cols)
        )

        rows.append({
            'name': name,
            'cols': cols,
            'cell': f'{w}x{h}',
            'colours': count_colours(img),
            'lone': lone_in_frames(model, cols, w, h),
            'mirrored': mirrored,
            'same_bulk': same_bulk,
            'ok': mirrored and same_bulk and lone_in_frames(model, cols, w, h) == 0,
        })
    return rows


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/characters'
    for row in build(out):
        flag = 'ok ' if row['ok'] else 'FAIL'
        print(f"{flag} {row['name']:12s} {row['cell']:6s} x{row['cols']} "
              f"colours={row['colours']:2d} lone={row['lone']:2d} "
              f"mirrored={row['mirrored']} front/back match={row['same_bulk']}")
