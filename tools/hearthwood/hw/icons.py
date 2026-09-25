"""
Item icon builders.

An inventory icon has about 26 usable pixels across and has to be recognised
instantly at 1:1 against a dark slot. That rules out detail and rules in
silhouette: every icon here is built from two or three big shapes with one
bright edge, and the material tells you what it is.

Each builder returns a Canvas so callers can add an accent before finishing.
"""
from __future__ import annotations

import numpy as np

from hw.core import EMPTY, rng
from hw.draw import Canvas, disc, ellipse, rect, stroke
from hw.sprite import blob, dome, finish_sprite, new_sprite, tapered, top_light
from palettes import ramp

#: Icons are authored at 128 and drawn small; the detail survives downscaling
#: far better than it can be invented at 32.
S = 128


def _c(ramp_name: str) -> Canvas:
    return new_sprite(S, S, ramp_name)


def _mid(name: str) -> int:
    return len(ramp(name)) // 2 + 1


# --- raw materials ---------------------------------------------------------
def nugget(ramp_name: str, seed: int, count: int = 3) -> np.ndarray:
    """A small heap — ore, coal, stone, sand. Each lump domed separately."""
    r = rng(seed)
    c = _c(ramp_name)
    spots = [(16, 21, 8.0), (10, 15, 5.6), (22, 14, 5.2), (16, 11, 4.6)][:count]
    for i, (x, y, rr) in enumerate(spots):
        m = blob(c, x, y, rr, rr * 0.9, r, wobble=0.14)
        c.put(m, _mid(ramp_name) + (1 if i else 0))
    dome(c)
    return finish_sprite(c, ramp_name)


def ore_chunk(rock: str, vein: str, seed: int) -> np.ndarray:
    """A grey lump with bright veins. The vein ramp is the one accent."""
    r = rng(seed)
    base = _c(rock)
    m = blob(base, 16, 18, 10.0, 9.0, r, wobble=0.16)
    base.put(m, _mid(rock))
    dome(base)
    rock_img = finish_sprite(base, rock)

    v = _c(vein)
    for _ in range(4):
        vx = int(r.integers(9, 24))
        vy = int(r.integers(12, 24))
        v.put(disc(v, vx, vy, r.uniform(1.4, 2.4)) & m, _mid(vein) + 1)
    dome(v)
    vein_img = finish_sprite(v, vein, outline=False)

    from hw.sprite import compose
    return compose(rock_img, vein_img)


def ingot(ramp_name: str, seed: int) -> np.ndarray:
    """A trapezoid bar with a bright top face. Reads as metal at any size."""
    c = _c(ramp_name)
    yy, xx = c.coords()
    # Top face.
    top = (yy >= 12) & (yy <= 17) & (np.abs(xx - 16) <= 7 + (yy - 12) * 0.5)
    # Front face.
    front = (yy > 17) & (yy <= 22) & (np.abs(xx - 16) <= 10)
    c.put(front, _mid(ramp_name))
    c.put(top, _mid(ramp_name) + 2)
    c.shade(rect(c, 0, 12, S - 1, 12), +1)
    c.shade(rect(c, 0, 22, S - 1, 22), -1)
    return finish_sprite(c, ramp_name)


def bar_stack(ramp_name: str, seed: int) -> np.ndarray:
    """Two bars, for wood and planks."""
    c = _c(ramp_name)
    c.put(rect(c, 5, 17, 26, 22), _mid(ramp_name))
    c.put(rect(c, 5, 17, 26, 17), _mid(ramp_name) + 2)
    c.put(rect(c, 7, 10, 24, 15), _mid(ramp_name) + 1)
    c.put(rect(c, 7, 10, 24, 10), _mid(ramp_name) + 3)
    r = rng(seed)
    for _ in range(3):
        y = int(r.integers(11, 21))
        x = int(r.integers(7, 20))
        c.shade(rect(c, x, y, x + int(r.integers(3, 7)), y), -2)
    return finish_sprite(c, ramp_name)


# --- tools -----------------------------------------------------------------
HEAD_SHAPES = ('axe', 'pickaxe', 'sword', 'hammer', 'knife', 'spear')


def tool(kind: str, head_ramp: str, handle_ramp: str = 'oak_wood',
         seed: int = 0) -> np.ndarray:
    """
    A handle plus a head.

    Every tool in the game shares one handle so the family reads as a set, and
    differs only in the head — which is the part the player actually reads when
    picking a slot in a hurry.
    """
    from hw.sprite import compose

    h = _c(handle_ramp)
    hm = _mid(handle_ramp)
    if kind == 'sword':
        # A sword's "handle" is a grip and crossguard low in the frame.
        h.put(tapered(h, 16, 28, 16, 22, 1.6, 1.6), hm)
        h.put(rect(h, 11, 20, 21, 21), hm + 2)
    elif kind == 'knife':
        h.put(tapered(h, 12, 25, 17, 20, 1.6, 1.4), hm)
    else:
        h.put(tapered(h, 11, 28, 20, 9, 1.7, 1.4), hm)
    top_light(h)
    handle = finish_sprite(h, handle_ramp)

    m = _c(head_ramp)
    mm = _mid(head_ramp)
    if kind == 'axe':
        yy, xx = m.coords()
        head = (xx >= 17) & (xx <= 27) & (yy >= 5) & (yy <= 15)
        head &= ((xx - 17) * 0.8 + np.abs(yy - 10) * 1.0) <= 9
        m.put(head, mm)
    elif kind == 'pickaxe':
        m.put(tapered(m, 6, 12, 26, 12, 1.2, 1.2), mm)
        m.put(tapered(m, 6, 12, 10, 7, 1.4, 1.0), mm)
        m.put(tapered(m, 26, 12, 22, 7, 1.4, 1.0), mm)
    elif kind == 'sword':
        m.put(tapered(m, 16, 20, 16, 3, 2.6, 0.9), mm)
    elif kind == 'hammer':
        m.put(rect(m, 9, 6, 25, 14), mm)
    elif kind == 'knife':
        m.put(tapered(m, 17, 21, 26, 8, 2.0, 0.8), mm)
    elif kind == 'spear':
        m.put(tapered(m, 16, 14, 16, 4, 2.2, 0.6), mm)
    dome(m)
    head_img = finish_sprite(m, head_ramp)
    return compose(handle, head_img)


# --- food ------------------------------------------------------------------
def meat(ramp_name: str, seed: int, cooked: bool = False,
         bone: bool = True) -> np.ndarray:
    """A cut of meat, with a bone if it has one."""
    from hw.sprite import compose
    r = rng(seed)
    c = _c(ramp_name)
    m = blob(c, 16, 18, 9.0, 7.0, r, wobble=0.22)
    c.put(m, _mid(ramp_name) + (1 if cooked else 0))
    dome(c)
    img = finish_sprite(c, ramp_name)
    if not bone:
        return img
    b = _c('parchment')
    b.put(tapered(b, 13, 26, 20, 20, 1.5, 1.3), len(ramp('parchment')) - 3)
    b.put(disc(b, 13, 27, 2.0), len(ramp('parchment')) - 2)
    return compose(img, finish_sprite(b, 'parchment'))


def loaf(ramp_name: str, seed: int, slashes: int = 3) -> np.ndarray:
    """Bread and pies: a domed mass with score marks."""
    r = rng(seed)
    c = _c(ramp_name)
    c.put(ellipse(c, 16, 18, 11, 7), _mid(ramp_name) + 1)
    dome(c)
    for i in range(slashes):
        x = 9 + i * 5
        c.shade(stroke(c, [(x, 14), (x + 3, 21)]), -2)
    return finish_sprite(c, ramp_name)


def round_food(ramp_name: str, seed: int, rx: float = 8.0,
               ry: float = 9.5) -> np.ndarray:
    """Eggs, fruit, tokens — anything that is simply a rounded thing."""
    r = rng(seed)
    c = _c(ramp_name)
    c.put(ellipse(c, 16, 17, rx, ry), _mid(ramp_name) + 1)
    dome(c, strength=1.2)
    return finish_sprite(c, ramp_name)


# --- cloth and armour ------------------------------------------------------
def garment(ramp_name: str, slot: str, seed: int) -> np.ndarray:
    """Armour and clothing, shaped by which slot it goes in."""
    c = _c(ramp_name)
    mm = _mid(ramp_name)
    yy, xx = c.coords()
    if slot == 'head':
        c.put(ellipse(c, 16, 15, 9, 7), mm)
        c.put(rect(c, 5, 15, 26, 17), mm + 1)
    elif slot == 'torso':
        c.put(rect(c, 9, 8, 23, 24), mm)
        c.put(rect(c, 4, 10, 8, 19), mm - 1)      # sleeves
        c.put(rect(c, 24, 10, 28, 19), mm - 1)
        c.put(rect(c, 13, 8, 19, 11), 0)          # collar
    elif slot == 'legs':
        c.put(rect(c, 9, 7, 23, 13), mm)
        c.put(rect(c, 9, 13, 14, 26), mm)
        c.put(rect(c, 18, 13, 23, 26), mm)
    elif slot == 'feet':
        for x0 in (7, 18):
            c.put(rect(c, x0, 10, x0 + 6, 22), mm)
            c.put(rect(c, x0 - 1, 22, x0 + 8, 25), mm - 1)
    elif slot == 'shield':
        c.put((((xx - 16) / 10.0) ** 2 + ((yy - 15) / 12.0) ** 2 <= 1.0)
              & (yy <= 24), mm)
        c.put(disc(c, 16, 16, 3.0), mm + 2)
    elif slot == 'pack':
        c.put(rect(c, 8, 11, 24, 26), mm)
        c.put(rect(c, 8, 11, 24, 14), mm + 2)
        c.put(rect(c, 14, 6, 18, 11), mm - 1)
    top_light(c)
    dome(c, strength=0.6)
    return finish_sprite(c, ramp_name)


# --- vegetation and bundles ------------------------------------------------
def bundle(ramp_name: str, seed: int, strands: int = 9,
           tie: str | None = 'oak_bark') -> np.ndarray:
    """Fibre, reeds, wheat, kindling — a tied handful of stalks."""
    from hw.sprite import compose
    r = rng(seed)
    c = _c(ramp_name)
    mm = _mid(ramp_name)
    for i in range(strands):
        x = 8 + i * (16 / max(strands - 1, 1))
        lean = r.uniform(-3.5, 3.5)
        c.put(stroke(c, [(int(x), 27), (int(x + lean), int(r.integers(4, 9)))]),
              mm + int(r.integers(0, 3)))
    img = finish_sprite(c, ramp_name, outline=False)
    if not tie:
        return img
    t = _c(tie)
    t.put(rect(t, 9, 18, 23, 20), _mid(tie))
    return compose(img, finish_sprite(t, tie, outline=False))


def leafy(ramp_name: str, seed: int) -> np.ndarray:
    """A clump of foliage: moss, herbs, seeds."""
    r = rng(seed)
    c = _c(ramp_name)
    for _ in range(9):
        x = int(r.integers(8, 25))
        y = int(r.integers(10, 24))
        c.put(ellipse(c, x, y, r.uniform(2.5, 4.5), r.uniform(2.0, 3.5)),
              _mid(ramp_name) + int(r.integers(-1, 3)))
    dome(c, strength=0.8)
    return finish_sprite(c, ramp_name)


# --- containers and structures ---------------------------------------------
def crate_icon(ramp_name: str, seed: int, banded: str | None = 'iron') -> np.ndarray:
    """A box with banding. Chests, crates, supply boxes."""
    from hw.sprite import compose
    c = _c(ramp_name)
    mm = _mid(ramp_name)
    c.put(rect(c, 5, 10, 27, 25), mm)
    c.put(rect(c, 5, 10, 27, 12), mm + 2)
    for x in (8, 15, 22):
        c.shade(rect(c, x, 12, x, 25), -2)
    img = finish_sprite(c, ramp_name)
    if not banded:
        return img
    b = _c(banded)
    b.put(rect(b, 5, 15, 27, 17), _mid(banded))
    b.put(rect(b, 14, 17, 18, 21), _mid(banded) + 1)
    return compose(img, finish_sprite(b, banded, outline=False))


def panel(ramp_name: str, seed: int, boards: int = 4) -> np.ndarray:
    """Walls, floors, doors — a flat panel of boards."""
    c = _c(ramp_name)
    mm = _mid(ramp_name)
    c.put(rect(c, 4, 5, 27, 27), mm)
    step = 23 // boards
    for i in range(boards + 1):
        x = 4 + i * step
        c.shade(rect(c, x, 5, x, 27), -2)
    c.put(rect(c, 4, 5, 27, 5), mm + 2)
    c.shade(rect(c, 4, 27, 27, 27), -1)
    return finish_sprite(c, ramp_name)


def bow_icon(limb_ramp: str, seed: int, string_ramp: str = 'parchment',
             recurve: bool = False) -> np.ndarray:
    """
    A bow: a curved limb and a taut string.

    Built as a shape rather than reusing the spear head, because a bow that
    reads as a stick is a bow the player never finds in the hotbar.
    """
    from hw.sprite import compose
    c = _c(limb_ramp)
    mm = _mid(limb_ramp)
    yy, xx = c.coords()

    # The limb: an annulus, cut to the left half so it bends away from the string.
    ring = (((xx - 20) / 11.0) ** 2 + ((yy - 16) / 13.0) ** 2)
    limb = (ring <= 1.0) & (ring >= 0.60) & (xx <= 21)
    c.put(limb, mm)
    if recurve:
        c.put(rect(c, 9, 4, 13, 6), mm + 1)
        c.put(rect(c, 9, 26, 13, 28), mm + 1)
    dome(c, strength=0.8)
    limb_img = finish_sprite(c, limb_ramp)

    s = _c(string_ramp)
    s.put(stroke(s, [(20, 4), (20, 28)]), len(ramp(string_ramp)) - 2)
    return compose(limb_img, finish_sprite(s, string_ramp, outline=False))


def crossbow_icon(seed: int) -> np.ndarray:
    """A stock across a short bow. Distinct from the bow at a glance."""
    from hw.sprite import compose
    stock = _c('oak_bark')
    sm = _mid('oak_bark')
    stock.put(rect(stock, 6, 15, 26, 18), sm)
    stock.put(rect(stock, 6, 15, 26, 15), sm + 2)
    stock.put(rect(stock, 8, 18, 12, 24), sm - 1)
    stock_img = finish_sprite(stock, 'oak_bark')

    limb = _c('iron')
    lm = _mid('iron')
    limb.put(rect(limb, 19, 5, 21, 28), lm)
    limb.put(rect(limb, 21, 7, 23, 9), lm + 1)
    limb.put(rect(limb, 21, 24, 23, 26), lm + 1)
    return compose(stock_img, finish_sprite(limb, 'iron'))


def scroll_icon(seed: int, seal: str | None = 'blood') -> np.ndarray:
    """Parchment rolled at both ends, with a wax seal. Logs and charters."""
    from hw.sprite import compose
    c = _c('parchment')
    mm = _mid('parchment')
    c.put(rect(c, 7, 9, 25, 23), mm + 1)
    for y in (9, 23):                       # rolled ends, one step darker
        c.put(rect(c, 5, y - 1, 27, y + 1), mm - 1)
    for y in (13, 16, 19):                  # writing
        c.shade(rect(c, 10, y, 22, y), -2)
    img = finish_sprite(c, 'parchment')
    if not seal:
        return img
    s = _c(seal)
    s.put(disc(s, 21, 16, 3.2), _mid(seal) + 1)
    dome(s)
    return compose(img, finish_sprite(s, seal))


def mast_icon(seed: int) -> np.ndarray:
    """A lattice mast: the antenna, which is not a spear."""
    c = _c('iron')
    mm = _mid('iron')
    c.put(tapered(c, 16, 29, 16, 4, 2.6, 1.0), mm)
    for y in (9, 14, 19, 24):               # cross braces, widening downward
        half = 2 + (y - 9) // 3
        c.put(rect(c, 16 - half, y, 16 + half, y), mm + 1)
    c.put(disc(c, 16, 4, 2.0), mm + 3)      # the emitter
    dome(c, strength=0.7)
    return finish_sprite(c, 'iron')
