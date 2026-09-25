"""
Material recipes.

One function per material family. Each takes a size and a seed and returns an
RGBA array, already declumped and graded. They are the vocabulary the asset
generators speak in: a crate is planks plus iron banding, a village house is
planks plus a tiled roof, a barrel is staves plus hoops.

All of them obey the same three rules: paint indices not colours, keep the
extreme ramp steps for edges and cracks, and light from the upper left.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from hw.core import EMPTY, clean_rgba, declump, fbm, grade, over, quantize, render, rng
from hw.draw import (
    Canvas, disc, edge_of, ellipse, hline, periodic_voronoi, rect,
    region_light, stamp, stroke, superellipse, vline, wobble_column,
    KNOT_STAMPS, LEAF_STAMPS,
)
from palettes import ramp


def finish(c: Canvas, ramp_name: str, passes: int = 2) -> np.ndarray:
    """
    Declump, render through the ramp and grade. Every material ends here.

    The declump runs to a fixed point rather than a fixed count. "No lone
    pixels" is a hard rule of the style — one stray pixel is what makes a
    texture read as noise at 1:1 — and a material that needs a gentler first
    pass (grass blades, plank knots) would otherwise be the one that breaks it.
    Deliberate 1px detail survives because a line's interior pixels agree with
    their neighbours along the line; only genuinely isolated pixels are caught.
    """
    c.clip()
    idx = declump(c.idx, passes, mask=c.solid())
    for _ in range(6):
        cleaned = declump(idx, 1, mask=c.solid())
        if np.array_equal(cleaned, idx):
            break
        idx = cleaned
    img = grade(render(idx, ramp(ramp_name), c.alpha))
    # Ground tiles never erase a stray — a hole in the ground is worse than the
    # stray — so the last resort recolours instead.
    return clean_rgba(img, wrap=True, erase=False)


# --- wood ------------------------------------------------------------------
def planks(size: int, seed: int, ramp_name: str = 'oak_wood', boards: int = 4,
           vertical: bool = False) -> np.ndarray:
    """
    Boards with grain, a lit top edge, a dark underside and a gap between.

    The quiet butt joint per board, staggered, is what stops four identical
    boards reading as a striped pattern.
    """
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    bh = size // boards
    grain = fbm(size, 16, 2, r, octaves=2)

    for b in range(boards):
        y0 = b * bh
        y1 = y0 + bh - 1
        band = rect(c, 0, y0, size - 1, y1)

        # Grain: stretched noise, offset per board so boards differ.
        local = np.roll(grain, r.integers(0, size), axis=1)
        c.put(band, quantize(local, steps // 2 - 1, steps - 3))

        c.put(rect(c, 0, y0, size - 1, y0), steps - 2)          # lit top edge
        c.put(rect(c, 0, y1 - 1, size - 1, y1 - 1), steps // 2 - 2)  # dark underside
        c.put(rect(c, 0, y1, size - 1, y1), 0)                   # gap

        # One butt joint, staggered across boards.
        jx = int((b * size / boards + size / boards / 2 + r.integers(-3, 4)) % size)
        c.put(rect(c, jx, y0 + 1, jx, y1 - 2), 1)

        # Long grain streaks.
        for _ in range(r.integers(1, 3)):
            sy = r.integers(y0 + 1, max(y0 + 2, y1 - 1))
            sx = r.integers(0, size)
            length = r.integers(size // 4, size // 2)
            xs = (np.arange(length) + sx) % size
            m = np.zeros((size, size), dtype=bool)
            m[sy, xs] = True
            c.shade(m, -2)

        # An occasional knot.
        if r.random() < 0.35 and bh >= 5:
            kx = int(r.integers(0, size))
            ky = int(y0 + 1 + r.integers(0, max(1, bh - 4)))
            c.put(stamp(c, KNOT_STAMPS[r.integers(0, len(KNOT_STAMPS))], kx, ky, 0), 1)

    out = finish(c, ramp_name)
    if vertical:
        out = np.rot90(out, 1)
    return out


def bark(size: int, seed: int, ramp_name: str = 'oak_bark') -> np.ndarray:
    """Vertical plates between wandering furrows, each plate lit on its left."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    tone = fbm(size, 3, 6, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps // 2 - 1, steps - 3))

    n_furrows = max(4, size // 5)
    xs = np.linspace(0, size, n_furrows, endpoint=False)
    yy, xx = c.coords()

    for fx in xs:
        col = wobble_column(size, fx, size * 0.05, r)
        furrow = np.abs(((xx - col[:, None] + size / 2) % size) - size / 2) < 1.0
        c.put(furrow, 0)
        # Plate lit on its left third, darker on its right.
        left = np.abs(((xx - (col[:, None] + 1.6) + size / 2) % size) - size / 2) < 1.2
        right = np.abs(((xx - (col[:, None] - 1.6) + size / 2) % size) - size / 2) < 1.2
        c.shade(left, +2)
        c.shade(right, -1)

    # Horizontal plate breaks: light above, dark below.
    for _ in range(max(2, size // 12)):
        by = int(r.integers(0, size))
        c.shade(hline(c, by), -2)
        c.shade(hline(c, by - 1), +1)

    return finish(c, ramp_name)


def log_end(size: int, seed: int, ramp_name: str = 'oak_wood') -> np.ndarray:
    """Square-ish growth rings, a dark pith, one radial crack, a bark rim."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=EMPTY)

    cx = cy = (size - 1) / 2
    body = disc(c, cx, cy, size * 0.46)
    c.put(body, steps - 4)

    d = superellipse(c, cx, cy, size * 0.42, size * 0.42, power=5.0)
    wob = fbm(size, 5, 5, r, octaves=2) * 0.06
    rings = ((d + wob) * size * 0.42 / 3.3) % 1.0
    c.shade(body & (rings < 0.45), -1)
    c.shade(body & (d < 0.35), +1)          # lighter heartwood
    c.put(body & (d < 0.10), 1)             # pith

    ang = r.uniform(0, 2 * np.pi)
    crack = stroke(c, [(cx, cy), (cx + np.cos(ang) * size * 0.42,
                                  cy + np.sin(ang) * size * 0.42)])
    c.put(crack & body, 0)

    rim = body & ~disc(c, cx, cy, size * 0.40)
    c.put(rim, 2)
    cambium = disc(c, cx, cy, size * 0.40) & ~disc(c, cx, cy, size * 0.37)
    c.put(cambium & body, 1)
    return finish(c, ramp_name)


# --- stone -----------------------------------------------------------------
def cobble(size: int, seed: int, ramp_name: str = 'stone', cells: int = 4) -> np.ndarray:
    """Seamless jittered Voronoi: domed stones, lit upper left, dark mortar."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    region, best, second, sites = periodic_voronoi(size, cells, r)
    lit = region_light(region, best, sites)
    tone = fbm(size, 8, 8, r, octaves=2) * 0.5

    c.idx = np.clip(steps // 2 + np.rint(lit * 2.0 + tone).astype(int), 1, steps - 1)
    c.alpha[:] = 1.0
    c.put((second - best) < 1.1, 0)   # mortar
    return finish(c, ramp_name)


def bricks(size: int, seed: int, ramp_name: str = 'cloth_red', courses: int = 5) -> np.ndarray:
    """Even courses, 1px mortar, a lit top edge and a few chips per brick."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    ch = max(3, size // courses)
    bw = max(5, size // 3)
    tone = fbm(size, 8, 8, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps // 2 - 1, steps - 3))

    for i, y in enumerate(range(0, size, ch)):
        c.put(hline(c, y + ch - 1), 0)                 # mortar row
        c.shade(hline(c, y), +2)                       # lit top
        offset = (i % 2) * (bw // 2)
        for x in range(offset, size + bw, bw):
            m = vline(c, x, y, min(size - 1, y + ch - 2))
            c.put(m, 0)
        for _ in range(2):                              # chips
            c.shade(disc(c, r.integers(0, size), y + r.integers(0, ch), 1, wrap=True), -2)
    return finish(c, ramp_name)


def rough_stone(size: int, seed: int, ramp_name: str = 'stone') -> np.ndarray:
    """Broad mottled rock face with a couple of 1px cracks. Seamless."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    tone = fbm(size, 4, 4, r, octaves=3)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps // 2 - 2, steps - 2))

    for _ in range(max(2, size // 12)):
        x = r.integers(0, size)
        col = wobble_column(size, x, size * 0.12, r)
        yy, xx = c.coords()
        crack = np.abs(((xx - col[:, None] + size / 2) % size) - size / 2) < 0.7
        span = (yy > r.integers(0, size // 2)) & (yy < r.integers(size // 2, size))
        c.put(crack & span, 0)
    return finish(c, ramp_name)


# --- ground ----------------------------------------------------------------
def soil(size: int, seed: int, ramp_name: str = 'dirt', pebbles: int = 6) -> np.ndarray:
    """Mottled mid-tones plus a handful of pebbles from the pebble ramp."""
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    # Isotropic: see the note in `grass_top` about mirrored tiles.
    tone = fbm(size, 16, 16, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps // 2 - 2, steps - 2))

    for _ in range(pebbles):
        px, py = r.integers(0, size), r.integers(0, size)
        rr = r.uniform(0.9, 1.9)
        m = disc(c, px, py, rr, wrap=True)
        c.put(m, steps - 2)
        c.shade(m & disc(c, px + 0.6, py + 0.6, rr * 0.7, wrap=True), -2)
    return finish(c, ramp_name)


def grass_top(size: int, seed: int, ramp_name: str = 'grass', blades: int = 70) -> np.ndarray:
    """
    Dense fine mottling with short blades.

    The first version used a coarse noise field and 3px vertical strokes, which
    at the 4x upscale the engine draws terrain at became corduroy: long parallel
    stripes with a visible period. Ground texture wants to be high-frequency and
    low-contrast — the eye should read "grass" without being able to find a
    single feature to latch onto and follow. So: finer noise, blades no taller
    than two pixels, and a leaning bias that changes per blade.
    """
    r = rng(seed)
    steps = len(ramp(ramp_name))
    c = Canvas(size, size, steps, fill=steps // 2)

    # One field, and a fine one. A broad component gives the tile large-scale
    # structure, and large-scale structure is exactly what shows up when the
    # renderer mirrors tiles to break the grid: two mirrored patches meet and
    # read as a butterfly. Ground has to be isotropic — no feature big enough
    # or directional enough for the eye to pair up with its own reflection.
    tone = fbm(size, 16, 16, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps // 2 - 1, steps - 3))

    n = int(blades * (size / 32) ** 2)
    for _ in range(n):
        x, y = int(r.integers(0, size)), int(r.integers(0, size))
        # Two pixels at most, and as often horizontal as vertical, so no
        # direction dominates and nothing lines up into a stripe.
        if r.random() < 0.5:
            cells = [(0, 0), (int(r.integers(-1, 2)), -1)]
        else:
            cells = [(0, 0), (1, 0)]
        c.put(stamp(c, cells, x, y, 0, wrap=True), steps - 2)
    return finish(c, ramp_name, passes=1)


def snow_ground(size: int, seed: int) -> np.ndarray:
    """Near-white drifts. Kept very low contrast so it reads as snow, not noise."""
    r = rng(seed)
    steps = len(ramp('snow'))
    c = Canvas(size, size, steps, fill=steps - 3)

    tone = fbm(size, 14, 14, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps - 4, steps - 1))

    # Speckle rather than ripples. A wind ripple is a directional feature, and
    # the renderer mirrors tiles: two mirrored ripples meet as a chevron.
    for _ in range(size // 2):
        c.shade(disc(c, r.integers(0, size), r.integers(0, size), 0.8, wrap=True), -1)
    return finish(c, 'snow')


def sand_ground(size: int, seed: int) -> np.ndarray:
    """Fine even grain with gentle ripples."""
    r = rng(seed)
    steps = len(ramp('sand'))
    c = Canvas(size, size, steps, fill=steps - 3)

    tone = fbm(size, 14, 14, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, steps - 4, steps - 1))

    ripple = fbm(size, 5, 9, r, octaves=2)
    c.shade(ripple > 0.62, -1)
    for _ in range(4):
        c.shade(disc(c, r.integers(0, size), r.integers(0, size), 1, wrap=True), -1)
    return finish(c, 'sand')


def marsh_ground(size: int, seed: int) -> np.ndarray:
    """Wet peat: dark mottling with patches of moss and standing water."""
    r = rng(seed)
    steps = len(ramp('marsh'))
    c = Canvas(size, size, steps, fill=steps // 2)

    tone = fbm(size, 15, 15, r, octaves=2)
    c.put(np.ones((size, size), dtype=bool), quantize(tone, 1, steps - 2))

    moss = fbm(size, 13, 13, r, octaves=2)
    out = finish(c, 'marsh')

    # Moss patches are a second ramp, which is allowed: it is one accent.
    mc = Canvas(size, size, len(ramp('moss')), fill=len(ramp('moss')) // 2)
    mc.put(np.ones((size, size), dtype=bool), quantize(moss, 2, len(ramp('moss')) - 2))
    moss_img = finish(mc, 'moss')
    # Moss counts as this material's one accent. Compositing happens after both
    # are rendered, so the seam between them needs its own clean-up pass.
    return clean_rgba(over(out, moss_img, moss > 0.66))


# --- vegetation ------------------------------------------------------------
def canopy(c: Canvas, mask: np.ndarray, r: np.random.Generator, steps: int,
           density: float = 1.0) -> None:
    """
    Stamp leaf shapes over a dark canopy inside `mask`.

    Holes are cut only through the dark interior, never through a leaf, so
    leaves stay whole — the difference between foliage and a sponge.
    """
    c.put(mask, 1)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return
    n = int(len(ys) * 0.55 * density)
    for _ in range(n):
        i = r.integers(0, len(ys))
        y, x = int(ys[i]), int(xs[i])
        cells = LEAF_STAMPS[r.integers(0, len(LEAF_STAMPS))]
        tone = int(r.integers(steps // 2, steps - 1))
        m = stamp(c, cells, x, y, tone, wrap=False) & mask
        c.put(m, tone)

    # Cut a few holes, interior only.
    interior = ndimage.binary_erosion(mask, iterations=2, border_value=0)
    dark = interior & (c.idx <= 2)
    ys, xs = np.nonzero(dark)
    for _ in range(min(len(ys), max(1, int(n * 0.05)))):
        i = r.integers(0, len(ys))
        c.alpha[ys[i], xs[i]] = 0.0
        c.idx[ys[i], xs[i]] = EMPTY
