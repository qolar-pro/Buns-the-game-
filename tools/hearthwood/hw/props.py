"""
World props: the things standing in the world rather than sitting in a slot.

Props are drawn in a frame whose height matches how tall the thing is — a tree
gets 32x48, a pebble gets 32x32 — and every one of them is planted at the
bottom of its frame, because the engine anchors world objects by their feet.
That is not cosmetic: a sprite floating half a cell above its anchor is a
sprite whose hitbox is in the wrong place.
"""
from __future__ import annotations

import numpy as np

from hw.core import EMPTY, rng
from hw.draw import Canvas, disc, ellipse, rect, stroke, wobble_column
from hw.materials import canopy
from hw.sprite import blob, compose, dome, finish_sprite, new_sprite, tapered, top_light
from palettes import ramp


def _c(w: int, h: int, ramp_name: str) -> Canvas:
    return new_sprite(w, h, ramp_name)


def _mid(name: str) -> int:
    return len(ramp(name)) // 2 + 1


# --- trees -----------------------------------------------------------------
def tree(w: int, h: int, seed: int, *, crown: str = 'leaf', trunk: str = 'oak_bark',
         crown_r: float = 0.42, trunk_w: float = 0.09, conifer: bool = False,
         bare: bool = False, lean: float = 0.0) -> np.ndarray:
    """
    One tree builder covers oak, pine, palm and the dead swamp tree.

    A canopy drawn as one blob reads as a lollipop at any resolution. A real
    one is a handful of overlapping clumps, each lit on its own upper left, with
    the gaps between them dark — so the mass has depth rather than an outline.
    The trunk gets bark grooves and roots flaring where it meets the ground,
    because a cylinder pushed into the dirt is what makes it look planted.
    """
    r = rng(seed)
    t = _c(w, h, trunk)
    tm = _mid(trunk)
    base_x = w / 2
    top_y = h * (0.34 if not bare else 0.16)
    tw = w * trunk_w

    t.put(tapered(t, base_x, h - 1, base_x + lean * w, top_y, tw, tw * 0.55), tm)

    # Roots: three short flares at the base, so it grows out of the ground.
    for dx in (-1.0, -0.35, 0.8):
        t.put(tapered(t, base_x, h - 2, base_x + dx * tw * 2.1, h - 1,
                      tw * 0.42, tw * 0.22), tm - 1)

    # Bark grooves, following the trunk rather than the frame.
    yy, xx = t.coords()
    for i in range(4):
        off = (i - 1.5) * tw * 0.45
        groove = np.abs(xx - (base_x + off + (yy - h) / max(h - top_y, 1) * lean * w)) < 0.7
        t.shade(groove & t.solid() & (yy > top_y + 4), -2 if i % 2 else -1)
    t.shade(t.solid() & (xx > base_x + tw * 0.3), -1)
    t.put(t.solid() & (xx < base_x - tw * 0.55), tm + 2)

    if bare or conifer:
        for _ in range(4):
            y0 = r.uniform(top_y, h * 0.58)
            side = r.choice([-1.0, 1.0])
            t.put(tapered(t, base_x + lean * w * 0.5, y0,
                          base_x + side * w * 0.28, y0 - h * 0.13,
                          tw * 0.42, tw * 0.16), tm - 1)
    top_light(t, top=1, bottom=-1)
    trunk_img = finish_sprite(t, trunk)
    if bare:
        return trunk_img

    c = _c(w, h, crown)
    cx = base_x + lean * w
    cy = h * (0.30 if not conifer else 0.34)

    if conifer:
        mask = np.zeros((h, w), dtype=bool)
        yy, xx = c.coords()
        for i, frac in enumerate((0.28, 0.44, 0.60, 0.76)):
            tier_y = h * frac
            half = w * (0.11 + i * 0.075)
            drop = h * 0.13
            band = (yy >= tier_y - drop) & (yy <= tier_y + h * 0.03)
            taper = np.abs(xx - cx) <= half * np.clip(
                (yy - (tier_y - drop)) / max(drop, 1), 0, 1)
            mask |= band & taper
    else:
        # Overlapping clumps rather than one ellipse.
        mask = np.zeros((h, w), dtype=bool)
        clumps = [(0.0, 0.0, 1.0), (-0.62, 0.22, 0.68), (0.60, 0.20, 0.66),
                  (-0.30, -0.34, 0.60), (0.32, -0.30, 0.62), (0.0, 0.40, 0.66)]
        for fx, fy, sc in clumps:
            mask |= blob(c, cx + fx * w * crown_r, cy + fy * h * crown_r * 0.62,
                         w * crown_r * 0.52 * sc, h * crown_r * 0.40 * sc,
                         r, wobble=0.22)

    canopy(c, mask, r, len(ramp(crown)))

    # Light each clump from its own upper left, so the mass has form.
    yy, xx = c.coords()
    for fx, fy, sc in ([(0.0, 0.0, 1.0)] if conifer else
                       [(0.0, 0.0, 1.0), (-0.62, 0.22, 0.68), (0.60, 0.20, 0.66),
                        (-0.30, -0.34, 0.60), (0.32, -0.30, 0.62), (0.0, 0.40, 0.66)]):
        ccx = cx + fx * w * crown_r
        ccy = cy + fy * h * crown_r * 0.62
        lit = ((ccx - xx) + (ccy - yy)) / max(w, h)
        near = ((xx - ccx) ** 2 + (yy - ccy) ** 2) < (w * crown_r * 0.55 * sc) ** 2
        c.shade(near & mask & (lit > 0.10), +1)
        c.shade(near & mask & (lit < -0.16), -1)

    # The trunk casts into the canopy above it.
    c.shade(mask & (np.abs(xx - cx) < tw * 1.3) & (yy > cy), -1)
    return compose(trunk_img, finish_sprite(c, crown))


# --- rocks and ore ---------------------------------------------------------
def boulder(w: int, h: int, seed: int, *, rock: str = 'stone',
            vein: str | None = None, cap: str | None = None,
            size: float = 0.40) -> np.ndarray:
    """A rock. Ore adds veins; a snow rock adds a cap."""
    r = rng(seed)
    c = _c(w, h, rock)
    cx, cy = w / 2, h - h * size * 0.62
    mask = blob(c, cx, cy, w * size, h * size * 0.72, r, wobble=0.2)
    mask &= c.coords()[0] <= h - 1
    c.put(mask, _mid(rock))
    dome(c)
    img = finish_sprite(c, rock)

    if vein:
        v = _c(w, h, vein)
        for _ in range(5):
            vx = int(r.integers(int(cx - w * size * 0.7), int(cx + w * size * 0.7)))
            vy = int(r.integers(int(cy - h * size * 0.4), int(cy + h * size * 0.5)))
            v.put(disc(v, vx, vy, r.uniform(1.2, 2.2)) & mask, _mid(vein) + 1)
        dome(v, strength=0.7)
        img = compose(img, finish_sprite(v, vein, outline=False))

    if cap:
        s = _c(w, h, cap)
        yy, xx = s.coords()
        s.put(mask & (yy <= cy - h * size * 0.18), len(ramp(cap)) - 2)
        dome(s, strength=0.6)
        img = compose(img, finish_sprite(s, cap, outline=False))
    return img


# --- plants ----------------------------------------------------------------
def tuft(w: int, h: int, seed: int, *, ramp_name: str = 'grass',
         blades: int = 11, spread: float = 0.34, tall: float = 0.55,
         tip: str | None = None) -> np.ndarray:
    """Grass, reeds, wheat, moss — anything that grows in a clump."""
    r = rng(seed)
    c = _c(w, h, ramp_name)
    mm = _mid(ramp_name)
    for i in range(blades):
        x = w / 2 + r.uniform(-w * spread, w * spread)
        top = h - h * tall * r.uniform(0.6, 1.15)
        c.put(stroke(c, [(int(x), h - 1), (int(x + r.uniform(-2.5, 2.5)), int(top))]),
              mm + int(r.integers(-1, 3)))
    img = finish_sprite(c, ramp_name, outline=False)
    if not tip:
        return img
    t = _c(w, h, tip)
    for i in range(max(3, blades // 3)):
        x = int(w / 2 + r.uniform(-w * spread, w * spread))
        y = int(h - h * tall * r.uniform(0.75, 1.1))
        t.put(ellipse(t, x, y, 1.6, 2.6), len(ramp(tip)) - 3)
    return compose(img, finish_sprite(t, tip, outline=False))


def flower_patch(w: int, h: int, seed: int, petal: str, stem: str = 'grass') -> np.ndarray:
    """A few stems with blooms."""
    r = rng(seed)
    s = _c(w, h, stem)
    heads = []
    for _ in range(4):
        x = int(w / 2 + r.uniform(-w * 0.28, w * 0.28))
        y = int(h - h * r.uniform(0.4, 0.7))
        s.put(stroke(s, [(x, h - 1), (x, y)]), _mid(stem))
        heads.append((x, y))
    img = finish_sprite(s, stem, outline=False)

    p = _c(w, h, petal)
    for x, y in heads:
        p.put(disc(p, x, y, 2.6), len(ramp(petal)) - 3)
        p.put(disc(p, x, y, 1.1), len(ramp(petal)) - 1)
    return compose(img, finish_sprite(p, petal, outline=False))


def cactus_prop(w: int, h: int, seed: int) -> np.ndarray:
    """A column with two arms, and spine dots."""
    r = rng(seed)
    c = _c(w, h, 'cactus')
    mm = _mid('cactus')
    c.put(tapered(c, w / 2, h - 1, w / 2, h * 0.16, w * 0.13, w * 0.11), mm)
    c.put(tapered(c, w * 0.30, h * 0.66, w * 0.30, h * 0.40, w * 0.08, w * 0.07), mm)
    c.put(tapered(c, w * 0.30, h * 0.66, w / 2, h * 0.66, w * 0.08, w * 0.08), mm)
    c.put(tapered(c, w * 0.70, h * 0.56, w * 0.70, h * 0.32, w * 0.08, w * 0.07), mm)
    c.put(tapered(c, w * 0.70, h * 0.56, w / 2, h * 0.56, w * 0.08, w * 0.08), mm)
    dome(c, strength=0.9)
    for _ in range(14):
        c.shade(disc(c, r.integers(0, w), r.integers(int(h * 0.2), h - 2), 0.6), +2)
    return finish_sprite(c, 'cactus')


# --- built things ----------------------------------------------------------
def building(w: int, h: int, seed: int, *, wall: str = 'parchment',
             roof: str = 'cloth_red', timber: str | None = 'oak_bark',
             storeys: float = 1.0, door: bool = True) -> np.ndarray:
    """A house: walls, a pitched roof, a door and a window."""
    r = rng(seed)
    base_y = h - 1
    wall_top = h * (0.46 - 0.10 * (storeys - 1))

    c = _c(w, h, wall)
    mm = _mid(wall)
    c.put(rect(c, int(w * 0.12), int(wall_top), int(w * 0.88), base_y), mm)
    top_light(c, top=1, bottom=-1)
    img = finish_sprite(c, wall)

    rf = _c(w, h, roof)
    yy, xx = rf.coords()
    pitch = (yy >= h * 0.10) & (yy <= wall_top + 1)
    span = np.abs(xx - w / 2) <= (yy - h * 0.10) / max(wall_top - h * 0.10, 1) * (w * 0.52)
    rf.put(pitch & span, _mid(roof))
    rf.shade(rf.solid() & (xx > w / 2), -1)
    top_light(rf, top=2, bottom=-1)
    img = compose(img, finish_sprite(rf, roof))

    if timber:
        t = _c(w, h, timber)
        tm = _mid(timber)
        if door:
            t.put(rect(t, int(w * 0.42), int(h * 0.74), int(w * 0.58), base_y), tm)
        t.put(rect(t, int(w * 0.18), int(wall_top + h * 0.10),
                   int(w * 0.30), int(wall_top + h * 0.22)), tm - 1)
        img = compose(img, finish_sprite(t, timber))
    return img


def post_thing(w: int, h: int, seed: int, *, post: str = 'oak_bark',
               head: str | None = None, head_ramp: str = 'flame',
               head_shape: str = 'disc') -> np.ndarray:
    """Torches, lampposts, signposts, braziers: a post with something on top."""
    c = _c(w, h, post)
    c.put(tapered(c, w / 2, h - 1, w / 2, h * 0.30, w * 0.075, w * 0.06), _mid(post))
    top_light(c)
    img = finish_sprite(c, post)
    if not head:
        return img

    t = _c(w, h, head_ramp)
    tm = len(ramp(head_ramp)) - 3
    if head_shape == 'disc':
        t.put(disc(t, w / 2, h * 0.24, w * 0.15), tm)
    elif head_shape == 'flame':
        yy, xx = t.coords()
        flame = (np.abs(xx - w / 2) * 2.4 + np.abs(yy - h * 0.18) * 1.1) < w * 0.30
        t.put(flame & (yy <= h * 0.34), tm)
        t.put(disc(t, w / 2, h * 0.22, w * 0.07), tm + 2)
    elif head_shape == 'board':
        t.put(rect(t, int(w * 0.14), int(h * 0.16), int(w * 0.86), int(h * 0.34)), tm)
    elif head_shape == 'bowl':
        t.put(ellipse(t, w / 2, h * 0.30, w * 0.24, h * 0.07), tm)
        t.put(ellipse(t, w / 2, h * 0.24, w * 0.18, h * 0.06), tm + 2)
    dome(t, strength=0.7)
    return compose(img, finish_sprite(t, head_ramp))


def box(w: int, h: int, seed: int, *, body: str = 'oak_wood',
        band: str | None = 'iron', lid_open: bool = False,
        rounded: bool = False) -> np.ndarray:
    """Chests, crates, barrels, workbenches, anvils."""
    c = _c(w, h, body)
    mm = _mid(body)
    x0, x1 = int(w * 0.16), int(w * 0.84)
    y0 = int(h * (0.34 if not lid_open else 0.44))
    if rounded:
        c.put(ellipse(c, w / 2, (y0 + h - 1) / 2, w * 0.33, (h - y0) / 2), mm)
    else:
        c.put(rect(c, x0, y0, x1, h - 1), mm)
    top_light(c, top=2, bottom=-1)
    if lid_open:
        c.put(rect(c, x0, int(h * 0.22), x1, int(h * 0.30)), mm - 2)
    img = finish_sprite(c, body)

    if band:
        b = _c(w, h, band)
        bm = _mid(band)
        for frac in (0.52, 0.78):
            b.put(rect(b, x0, int(h * frac), x1, int(h * frac) + 1), bm)
        if not lid_open:
            b.put(rect(b, int(w * 0.44), int(h * 0.48), int(w * 0.56), int(h * 0.60)), bm + 1)
        img = compose(img, finish_sprite(b, band, outline=False))
    return img


def opening(w: int, h: int, seed: int, *, frame: str = 'stone',
            dark: str = 'dark_bark', ladder: bool = False,
            stairs: bool = False) -> np.ndarray:
    """A hole in the ground: dungeon entrance, exit and stairs."""
    r = rng(seed)
    c = _c(w, h, frame)
    mm = _mid(frame)
    cx, cy = w / 2, h * 0.70
    ring = blob(c, cx, cy, w * 0.42, h * 0.26, r, wobble=0.18)
    c.put(ring, mm)
    dome(c, strength=0.8)
    img = finish_sprite(c, frame)

    d = _c(w, h, dark)
    inner = ellipse(d, cx, cy + h * 0.02, w * 0.30, h * 0.17)
    d.put(inner, 1)
    img = compose(img, finish_sprite(d, dark, outline=False))

    if ladder:
        l = _c(w, h, 'oak_bark')
        lm = _mid('oak_bark')
        for x in (int(w * 0.42), int(w * 0.58)):
            l.put(rect(l, x, int(h * 0.34), x + 1, int(h * 0.84)), lm)
        for y in range(int(h * 0.40), int(h * 0.82), max(3, int(h * 0.10))):
            l.put(rect(l, int(w * 0.42), y, int(w * 0.59), y), lm + 1)
        img = compose(img, finish_sprite(l, 'oak_bark', outline=False))
    if stairs:
        s = _c(w, h, frame)
        for i in range(4):
            y = int(h * 0.56 + i * h * 0.055)
            half = w * (0.26 - i * 0.045)
            s.put(rect(s, int(cx - half), y, int(cx + half), y + 1), mm + 2 - i)
        img = compose(img, finish_sprite(s, frame, outline=False))
    return img


def effect(w: int, h: int, seed: int, *, ramp_name: str, kind: str) -> np.ndarray:
    """Hit sparks, bursts, puffs, splashes — small, bright, short-lived."""
    r = rng(seed)
    c = _c(w, h, ramp_name)
    top = len(ramp(ramp_name)) - 2
    cx, cy = w / 2, h / 2
    if kind == 'spark':
        for i in range(8):
            a = i * np.pi / 4
            c.put(stroke(c, [(cx + np.cos(a) * 3, cy + np.sin(a) * 3),
                             (cx + np.cos(a) * w * 0.42, cy + np.sin(a) * h * 0.42)]), top)
        c.put(disc(c, cx, cy, w * 0.14), top)
    elif kind == 'scatter':
        for _ in range(9):
            a = r.uniform(0, 6.28)
            d = r.uniform(w * 0.14, w * 0.45)
            c.put(disc(c, cx + np.cos(a) * d, cy + np.sin(a) * d, r.uniform(1.2, 2.4)),
                  top - int(r.integers(0, 3)))
    elif kind == 'puff':
        for _ in range(5):
            c.put(disc(c, cx + r.uniform(-6, 6), cy + r.uniform(-5, 5),
                       r.uniform(4.0, 7.0)), top - 2)
        dome(c, strength=0.9)
    elif kind == 'splash':
        c.put(ellipse(c, cx, cy + h * 0.16, w * 0.34, h * 0.12), top - 1)
        for _ in range(6):
            c.put(disc(c, cx + r.uniform(-10, 10), cy - r.uniform(0, 9),
                       r.uniform(1.2, 2.2)), top)
    elif kind == 'zzz':
        for i, (dx, dy, sc) in enumerate([(-5, 5, 3), (1, 0, 4), (7, -6, 5)]):
            x0, y0 = cx + dx - sc, cy + dy - sc
            c.put(stroke(c, [(x0, y0), (x0 + sc * 2, y0)]), top)
            c.put(stroke(c, [(x0 + sc * 2, y0), (x0, y0 + sc * 2)]), top)
            c.put(stroke(c, [(x0, y0 + sc * 2), (x0 + sc * 2, y0 + sc * 2)]), top)
    return finish_sprite(c, ramp_name, outline=False)


def plank_panel(w: int, h: int, seed: int, *, body: str = 'oak_wood',
                vertical: bool = True, boards: int = 4,
                gap_ramp: str | None = None) -> np.ndarray:
    """
    A built surface: walls, floors, fences.

    `box` gives these a flat face with nothing on it, which at 32px reads as a
    coloured square rather than carpentry. Boards with a lit edge and a dark
    gap are what say "someone made this".
    """
    r = rng(seed)
    c = _c(w, h, body)
    mm = _mid(body)
    x0, x1 = int(w * 0.10), int(w * 0.90)
    y0, y1 = int(h * 0.30), h - 1
    c.put(rect(c, x0, y0, x1, y1), mm)

    span = (x1 - x0) if vertical else (y1 - y0)
    step = max(2, span // boards)
    for i in range(1, boards):
        at = (x0 if vertical else y0) + i * step
        if vertical:
            c.put(rect(c, at, y0, at, y1), 0)
            c.shade(rect(c, at + 1, y0, at + 1, y1), +1)
        else:
            c.put(rect(c, x0, at, x1, at), 0)
            c.shade(rect(c, x0, at + 1, x1, at + 1), +1)

    c.put(rect(c, x0, y0, x1, y0), mm + 2)
    c.shade(rect(c, x0, y1, x1, y1), -1)
    for _ in range(3):
        gx = int(r.integers(x0 + 1, x1))
        gy = int(r.integers(y0 + 1, y1))
        c.shade(rect(c, gx, gy, gx + int(r.integers(2, 5)), gy), -2)
    return finish_sprite(c, body)


def mushroom_prop(w: int, h: int, seed: int, cap: str = 'cloth_red') -> np.ndarray:
    """Stalks with domed caps and pale spots."""
    r = rng(seed)
    s = _c(w, h, 'cloth_cream')
    heads = []
    for dx, sc in ((-0.16, 1.0), (0.14, 0.75)):
        x = int(w / 2 + dx * w)
        top = int(h - h * 0.34 * sc)
        s.put(tapered(s, x, h - 1, x, top, w * 0.045, w * 0.035), _mid('cloth_cream'))
        heads.append((x, top, sc))
    img = finish_sprite(s, 'cloth_cream')

    k = _c(w, h, cap)
    km = len(ramp(cap)) - 3
    for x, top, sc in heads:
        k.put(ellipse(k, x, top, w * 0.16 * sc, h * 0.10 * sc), km)
        for _ in range(3):
            k.shade(disc(k, x + r.uniform(-4, 4) * sc, top + r.uniform(-2, 1),
                         0.9), +2)
    dome(k, strength=0.8)
    return compose(img, finish_sprite(k, cap))


def chest_prop(w: int, h: int, seed: int, *, body: str = 'oak_wood',
               band: str = 'iron', open_lid: bool = False,
               lock: str | None = 'gold') -> np.ndarray:
    """
    A chest built from boards, iron straps and a lock.

    The old builder drew a rectangle, two horizontal lines and a square: at 32px
    that was all there was room for. At 128 a chest can have a domed lid, plank
    seams, riveted strapping and a shadow where the lid overhangs the body —
    which is the difference between a container and a brown box.
    """
    r = rng(seed)
    c = _c(w, h, body)
    mm = _mid(body)
    yy, xx = c.coords()

    x0, x1 = int(w * 0.14), int(w * 0.86)
    lid_top = int(h * (0.30 if not open_lid else 0.20))
    lid_bot = int(h * (0.52 if not open_lid else 0.40))
    y1 = h - 1

    # Body.
    c.put(rect(c, x0, lid_bot, x1, y1), mm)
    # Domed lid.
    lid = (((xx - w / 2) / ((x1 - x0) / 2)) ** 2
           + ((yy - lid_bot) / max(lid_bot - lid_top, 1)) ** 2 <= 1.0) & (yy <= lid_bot)
    c.put(lid, mm + 1)
    c.shade(lid & (xx > w / 2), -1)
    c.put(lid & (yy < lid_top + 3), mm + 3)                  # highlight along the lid
    c.shade(rect(c, x0, lid_bot, x1, lid_bot + 2), -3)       # shadow under the lid
    c.shade(rect(c, x1 - 3, lid_bot, x1, y1), -1)            # shaded side
    # Plank seams.
    for x in range(x0 + int(w * 0.12), x1, max(6, int(w * 0.13))):
        c.put(rect(c, x, lid_bot + 3, x, y1 - 1), max(mm - 3, 0))
    c.shade(rect(c, x0, y1 - 2, x1, y1), -2)                 # it sits on the ground
    img = finish_sprite(c, body)

    # Iron strapping with rivets.
    b = _c(w, h, band)
    bm = _mid(band)
    for x in (x0 + int(w * 0.06), x1 - int(w * 0.06)):
        strap = rect(b, x - 2, lid_top + 2, x + 2, y1 - 2) & (c.alpha > 0)
        b.put(strap, bm)
        b.put(rect(b, x - 2, lid_top + 2, x + 2, lid_top + 3), bm + 2)
        for ry in range(lid_top + 6, y1 - 4, max(8, int(h * 0.10))):
            b.put(disc(b, x, ry, 1.4), bm + 2)
    b.put(rect(b, x0, lid_bot - 1, x1, lid_bot + 1), bm)     # rim
    img = compose(img, finish_sprite(b, band, outline=False))

    if lock and not open_lid:
        k = _c(w, h, lock)
        km = len(ramp(lock)) - 3
        k.put(rect(k, int(w / 2) - 4, lid_bot - 4, int(w / 2) + 4, lid_bot + 6), km)
        k.put(rect(k, int(w / 2) - 4, lid_bot - 4, int(w / 2) + 4, lid_bot - 3), km + 2)
        k.put(disc(k, w / 2, lid_bot + 1, 1.6), max(km - 3, 0))
        img = compose(img, finish_sprite(k, lock, outline=False))

    if open_lid:
        # The dark interior, so an open chest reads as empty rather than solid.
        d = _c(w, h, 'dark_bark')
        d.put(rect(d, x0 + 3, lid_bot - 1, x1 - 3, lid_bot + int(h * 0.08)), 1)
        img = compose(img, finish_sprite(d, 'dark_bark', outline=False))
    return img


def barrel_prop(w: int, h: int, seed: int, *, body: str = 'oak_wood',
                band: str = 'iron') -> np.ndarray:
    """Staves bulging at the middle, bound by hoops, with a lid."""
    c = _c(w, h, body)
    mm = _mid(body)
    yy, xx = c.coords()
    top, bot = int(h * 0.20), h - 1
    mid = (top + bot) / 2
    # Bulge: the silhouette is what says barrel.
    half = w * 0.30 * (1 + 0.22 * np.sin((yy - top) / max(bot - top, 1) * np.pi))
    body_mask = (yy >= top) & (yy <= bot) & (np.abs(xx - w / 2) <= half)
    c.put(body_mask, mm)
    c.shade(body_mask & (xx > w / 2), -1)
    c.shade(body_mask & (np.abs(xx - w / 2) > half - 3), -2)
    # Staves.
    for x in range(int(w * 0.22), int(w * 0.78), max(5, int(w * 0.075))):
        c.put(body_mask & (np.abs(xx - x) < 0.6), max(mm - 3, 0))
    # Lid.
    c.put(ellipse(c, w / 2, top, w * 0.30, h * 0.055), mm + 2)
    c.shade(ellipse(c, w / 2, top, w * 0.22, h * 0.035), -1)
    img = finish_sprite(c, body)

    b = _c(w, h, band)
    bm = _mid(band)
    for frac in (0.30, 0.62, 0.90):
        y = int(top + (bot - top) * frac)
        b.put(body_mask & (np.abs(yy - y) <= 1.5), bm)
        b.put(body_mask & (np.abs(yy - (y - 1)) <= 0.5), bm + 2)
    return compose(img, finish_sprite(b, band, outline=False))


def well_prop(w: int, h: int, seed: int) -> np.ndarray:
    """A stone ring with a post-and-beam roof, a rope and a bucket."""
    r = rng(seed)
    c = _c(w, h, 'stone')
    mm = _mid('stone')
    yy, xx = c.coords()
    ring_top = int(h * 0.56)
    c.put(ellipse(c, w / 2, ring_top, w * 0.34, h * 0.11), mm + 1)
    c.put(rect(c, int(w * 0.16), ring_top, int(w * 0.84), h - 1)
          & (np.abs(xx - w / 2) <= w * 0.34), mm)
    c.put(ellipse(c, w / 2, h - int(h * 0.06), w * 0.34, h * 0.09), mm)
    # Stone courses and blocks.
    for i, y in enumerate(range(ring_top + 4, h - 2, max(5, int(h * 0.07)))):
        c.put(rect(c, 0, y, w - 1, y) & c.solid(), max(mm - 3, 0))
        for x in range(int(w * 0.18) + (i % 2) * 8, int(w * 0.84), 16):
            c.put(rect(c, x, y, x, min(y + 5, h - 2)) & c.solid(), max(mm - 3, 0))
    c.shade(c.solid() & (xx > w * 0.58), -1)
    # The dark water inside.
    c.put(ellipse(c, w / 2, ring_top, w * 0.26, h * 0.075), 0)
    img = finish_sprite(c, 'stone')

    t = _c(w, h, 'oak_bark')
    tm = _mid('oak_bark')
    for x in (int(w * 0.22), int(w * 0.78)):
        t.put(rect(t, x - 2, int(h * 0.20), x + 2, ring_top), tm)
    t.put(rect(t, int(w * 0.16), int(h * 0.17), int(w * 0.84), int(h * 0.21)), tm + 1)
    img = compose(img, finish_sprite(t, 'oak_bark'))

    rp = _c(w, h, 'dead_plant')
    rp.put(rect(rp, int(w / 2), int(h * 0.21), int(w / 2), int(h * 0.44)),
           len(ramp('dead_plant')) - 3)
    img = compose(img, finish_sprite(rp, 'dead_plant', outline=False))

    bk = _c(w, h, 'spruce_wood')
    bm2 = _mid('spruce_wood')
    bk.put(rect(bk, int(w / 2) - 7, int(h * 0.44), int(w / 2) + 7, int(h * 0.54)), bm2)
    bk.put(rect(bk, int(w / 2) - 7, int(h * 0.44), int(w / 2) + 7, int(h * 0.45)), bm2 + 2)
    return compose(img, finish_sprite(bk, 'spruce_wood'))


def furnace_prop(w: int, h: int, seed: int, *, lit: bool = False) -> np.ndarray:
    """
    A stone furnace with a firebox, a lintel and a flue.

    The flat grey box it replaces gave no clue what it was for. The opening is
    the whole read: a dark arch low in the front, glowing when it is burning,
    with soot above it and a lintel stone over the top.
    """
    r = rng(seed)
    c = _c(w, h, 'stone')
    mm = _mid('stone')
    yy, xx = c.coords()
    x0, x1 = int(w * 0.16), int(w * 0.84)
    top = int(h * 0.20)

    c.put(rect(c, x0, top, x1, h - 1), mm)
    # Flue, narrower, rising out of the back.
    c.put(rect(c, int(w * 0.30), int(h * 0.06), int(w * 0.50), top), mm - 1)
    # Stone courses, staggered.
    for i, y in enumerate(range(top + 4, h - 2, max(6, int(h * 0.09)))):
        c.put(rect(c, x0, y, x1, y), max(mm - 3, 0))
        for x in range(x0 + 6 + (i % 2) * 12, x1, 22):
            c.put(rect(c, x, y, x, min(y + 6, h - 2)), max(mm - 3, 0))
    c.shade(c.solid() & (xx > w * 0.58), -1)
    c.put(c.solid() & (xx < x0 + 3), mm + 2)
    c.shade(rect(c, x0, h - 3, x1, h - 1), -2)
    img = finish_sprite(c, 'stone')

    # Lintel over the opening.
    l = _c(w, h, 'stone')
    l.put(rect(l, int(w * 0.24), int(h * 0.50), int(w * 0.76), int(h * 0.57)), mm + 2)
    l.shade(rect(l, int(w * 0.24), int(h * 0.57), int(w * 0.76), int(h * 0.58)), -3)
    img = compose(img, finish_sprite(l, 'stone', outline=False))

    # The firebox: an arch, dark or glowing.
    fire_ramp = 'flame' if lit else 'dark_bark'
    f = _c(w, h, fire_ramp)
    arch_cx, arch_cy = w / 2, int(h * 0.78)
    arch = (ellipse(f, arch_cx, arch_cy, w * 0.20, h * 0.22)
            & (yy >= int(h * 0.60)) & (yy <= h - int(h * 0.08)))
    if lit:
        f.put(arch, 1)
        f.put(arch & (yy > h * 0.70), len(ramp('flame')) - 4)
        for _ in range(7):
            f.put(disc(f, arch_cx + r.uniform(-9, 9), h * 0.80 + r.uniform(-6, 5),
                       r.uniform(2.0, 4.5)) & arch, len(ramp('flame')) - 2)
        f.put(disc(f, arch_cx, h * 0.84, w * 0.055) & arch, len(ramp('flame')) - 1)
    else:
        f.put(arch, 1)
        f.shade(arch & (yy < h * 0.70), +1)
    img = compose(img, finish_sprite(f, fire_ramp, outline=False))

    # Soot above the mouth.
    sm = _c(w, h, 'coal')
    sm.put(rect(sm, int(w * 0.34), int(h * 0.44), int(w * 0.66), int(h * 0.50)), 1)
    return compose(img, finish_sprite(sm, 'coal', outline=False))
