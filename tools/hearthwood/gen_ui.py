"""
UI icons: the six the HUD draws.

Warm wood and parchment, per the style guide. These sit on a dark bar and are
read at a glance while something is chasing the player, so they are the boldest
shapes in the set.

Run: python3 gen_ui.py [outdir]
"""
from __future__ import annotations

import os
import sys

import numpy as np

from hw.checks import report, save
from hw.core import outline_rgba
from hw.draw import disc, ellipse, rect, stroke
from hw.sprite import dome, finish_sprite, new_sprite, tapered
from palettes import ramp

S = 32


def _c(name):
    return new_sprite(S, S, name)


def heart(filled: bool) -> np.ndarray:
    name = 'cloth_red' if filled else 'walnut'
    c = _c(name)
    top = len(ramp(name)) - (3 if filled else 5)
    yy, xx = c.coords()
    lobes = disc(c, 11, 12, 6.2) | disc(c, 21, 12, 6.2)
    point = (np.abs(xx - 16) * 1.25 + (yy - 12) * 0.95) < 11
    c.put((lobes | point) & (yy >= 5) & (yy <= 26), top)
    if filled:
        dome(c, strength=1.2)
    else:
        c.idx = np.where(c.solid(), 1, c.idx)
        c.put(disc(c, 11, 12, 3.6) | disc(c, 21, 12, 3.6), -1)
        c.alpha = np.where(disc(c, 11, 12, 3.6) | disc(c, 21, 12, 3.6), 0.0, c.alpha)
    return finish_sprite(c, name)


def drumstick(filled: bool) -> np.ndarray:
    name = 'wheat' if filled else 'walnut'
    c = _c(name)
    top = len(ramp(name)) - (3 if filled else 5)
    c.put(ellipse(c, 19, 12, 7.5, 8.5), top)
    c.put(tapered(c, 16, 15, 8, 26, 2.6, 1.8), top - 1)
    if filled:
        dome(c, strength=1.1)
    else:
        c.idx = np.where(c.solid(), 1, c.idx)
    b = _c('parchment')
    b.put(disc(b, 8, 26, 2.6), len(ramp('parchment')) - 2)
    from hw.sprite import compose
    return compose(finish_sprite(c, name), finish_sprite(b, 'parchment'))


def bolt() -> np.ndarray:
    c = _c('gold')
    top = len(ramp('gold')) - 2
    yy, xx = c.coords()
    upper = (xx - 16) * 1.0 + (yy - 4) * 0.55 < 4
    upper &= (xx - 16) * 1.0 + (yy - 4) * 0.55 > -6
    lower = (xx - 16) * 1.0 + (yy - 28) * 0.55 < 6
    lower &= (xx - 16) * 1.0 + (yy - 28) * 0.55 > -4
    c.put((upper & (yy >= 4) & (yy <= 16)) | (lower & (yy > 16) & (yy <= 28)), top)
    dome(c, strength=0.9)
    return finish_sprite(c, 'gold')


def cursor() -> np.ndarray:
    c = _c('parchment')
    top = len(ramp('parchment')) - 1
    yy, xx = c.coords()
    arrow = ((yy - 4) >= (xx - 8) * 1.9) & ((yy - 4) >= -(xx - 8) * 0.30)
    arrow &= (yy <= 26) & (xx >= 6)
    c.put(arrow, top)
    return finish_sprite(c, 'parchment')


ICONS = {
    'heart': lambda: heart(True),
    'heart_empty': lambda: heart(False),
    'drumstick': lambda: drumstick(True),
    'drumstick_empty': lambda: drumstick(False),
    'stamina_bolt': bolt,
    'cursor': cursor,
}


def build(out_dir: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, fn in ICONS.items():
        img = outline_rgba(fn())
        save(img, f'{out_dir}/{name}.png')
        rows.append(report(name, img, seamless=False, budget=12))
    return rows


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/ui'
    rows = build(out)
    bad = [r for r in rows if not r['ok']]
    print(f'{len(rows)} ui icons, {len(rows) - len(bad)} ok')
    for r in bad:
        print(f"  FAIL {r['name']:18s} colours={r['colours']} lone={r['lone']}")
