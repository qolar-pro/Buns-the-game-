"""
The Hearthwood pipeline.

The rule that makes this look hand-drawn rather than filtered: nothing paints
with free RGB. Everything paints an INDEX MAP — a 2D array of small integers
into a ramp — cleans that map, and only then renders it through the ramp. A
gradient cannot creep in, a stray colour cannot appear, and "make the shadow one
step darker" is `idx - 1` rather than a colour-picking problem.

Order of work, every time:

    index map  ->  declump  ->  render through ramp  ->  grade

Alpha is carried alongside the index map as a separate mask, so shaping a sprite
and shading it stay independent.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from hw.oklab import lab_to_lch, lch_to_lab, oklab_to_rgb, rgb_to_oklab

EMPTY = -1  # index meaning "transparent"


# --- randomness ------------------------------------------------------------
def rng(seed: int) -> np.random.Generator:
    """Every generator takes a seed, so any texture can be re-made exactly."""
    return np.random.default_rng(seed)


# --- periodic noise --------------------------------------------------------
def value_noise(size: int, cells_x: int, cells_y: int, r: np.random.Generator) -> np.ndarray:
    """
    One octave of periodic value noise, 0..1.

    Periodic by construction: the coarse grid wraps, and the interpolation
    samples it modulo its own size, so the result tiles seamlessly. Cell counts
    set the character — (16, 2) is wood grain, (4, 4) broad tone, (8, 8) fine
    mottling.
    """
    grid = r.random((cells_y, cells_x))

    # Sample positions in grid space, wrapped.
    ys = np.arange(size) * cells_y / size
    xs = np.arange(size) * cells_x / size
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]

    def sm(t):  # smoothstep, so cells blend without visible grid lines
        return t * t * (3 - 2 * t)

    fy, fx = sm(fy), sm(fx)
    y1 = (y0 + 1) % cells_y
    x1 = (x0 + 1) % cells_x
    y0 = y0 % cells_y
    x0 = x0 % cells_x

    g00 = grid[np.ix_(y0, x0)]
    g01 = grid[np.ix_(y0, x1)]
    g10 = grid[np.ix_(y1, x0)]
    g11 = grid[np.ix_(y1, x1)]

    top = g00 * (1 - fx) + g01 * fx
    bot = g10 * (1 - fx) + g11 * fx
    return top * (1 - fy) + bot * fy


def fbm(size: int, cells_x: int, cells_y: int, r: np.random.Generator,
        octaves: int = 3, persistence: float = 0.55) -> np.ndarray:
    """Stacked periodic noise, normalised to 0..1. Still tiles."""
    total = np.zeros((size, size))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        total += amp * value_noise(size, cells_x * 2 ** o, cells_y * 2 ** o, r)
        norm += amp
        amp *= persistence
    out = total / norm
    lo, hi = out.min(), out.max()
    return (out - lo) / (hi - lo) if hi > lo else out


# --- index map operations --------------------------------------------------
def quantize(field: np.ndarray, lo: int, hi: int) -> np.ndarray:
    """
    Map a 0..1 field onto ramp steps `lo`..`hi` inclusive.

    Callers pass the MIDDLE steps of the ramp and keep the extremes for edges,
    cracks and highlights. A texture that quantizes across the whole ramp has
    nothing left to draw form with.
    """
    n = hi - lo + 1
    q = np.clip((field * n).astype(int), 0, n - 1)
    return q + lo


def declump(idx: np.ndarray, passes: int = 2, mask: np.ndarray | None = None) -> np.ndarray:
    """
    Remove lone pixels.

    A pixel that differs from all four of its neighbours takes their most common
    value. This is the single most important step: without it, quantized noise
    is salt-and-pepper and the texture does not read at 1:1. With it, the same
    noise becomes shapes.

    Wraps, so seamless textures stay seamless.
    """
    out = idx.copy()
    for _ in range(passes):
        up = np.roll(out, 1, 0)
        down = np.roll(out, -1, 0)
        left = np.roll(out, 1, 1)
        right = np.roll(out, -1, 1)

        lonely = (out != up) & (out != down) & (out != left) & (out != right)
        if mask is not None:
            lonely &= mask
        if not lonely.any():
            break

        # Most common neighbour, by pairwise agreement — resolved by the
        # neighbours' VALUES, never by their positions. Taking argmax over a
        # fixed [up, down, left, right] order is not left/right symmetric, so a
        # mirrored pair of sprites cleans differently and stops being mirrored.
        # That silently broke the one guarantee the character system exists for.
        stack = np.stack([up, down, left, right]).astype(np.int64)
        score = np.zeros(stack.shape, dtype=np.int64)
        for i in range(4):
            agree = np.zeros(stack.shape[1:], dtype=np.int64)
            for j in range(4):
                agree += (stack[i] == stack[j])
            # Agreement dominates; the value itself breaks ties, and it mirrors
            # correctly because it does not know which side it came from.
            score[i] = agree * (1 << 24) + stack[i]

        best = np.argmax(score, axis=0)
        chosen = np.take_along_axis(stack, best[None], axis=0)[0].astype(out.dtype)
        out = np.where(lonely, chosen, out)
    return out


def shade_edges(idx: np.ndarray, alpha: np.ndarray, top: int = 1, bottom: int = -1,
                steps: int | None = None) -> np.ndarray:
    """
    One light, upper left, for everything.

    Lightens the top edge of every solid run and darkens the bottom, in ramp
    steps. Applied to the index map, so the light is made of the same colours as
    the material and cannot desaturate it.
    """
    out = idx.copy()
    solid = alpha > 0
    above = np.roll(solid, 1, 0)
    below = np.roll(solid, -1, 0)
    above[0] = False
    below[-1] = False

    top_edge = solid & ~above
    bot_edge = solid & ~below
    out = np.where(top_edge, out + top, out)
    out = np.where(bot_edge, out + bottom, out)
    if steps is not None:
        out = np.clip(out, 0, steps - 1)
    return out


def round_form(idx: np.ndarray, alpha: np.ndarray, steps: int,
               strength: float = 1.6) -> np.ndarray:
    """
    Dome a blob: light rim upper left, shadow crescent lower right.

    Uses distance from the shape's edge so it works on any silhouette, not just
    circles — which is what lets one function light a pebble, a fruit and a
    smoke puff the same way.
    """
    solid = alpha > 0
    if not solid.any():
        return idx

    dist = ndimage.distance_transform_edt(solid)
    dist = dist / max(dist.max(), 1e-6)

    h, w = idx.shape
    yy, xx = np.mgrid[0:h, 0:w]
    ys, xs = np.nonzero(solid)
    cy, cx = ys.mean(), xs.mean()
    # Light direction: upper left.
    lit = ((cx - xx) + (cy - yy)) / max(h, w)

    delta = np.rint((lit * 2.2 + (dist - 0.5) * 0.8) * strength).astype(int)
    return np.clip(np.where(solid, idx + delta, idx), 0, steps - 1)


# --- rendering -------------------------------------------------------------
def render(idx: np.ndarray, ramp: np.ndarray, alpha: np.ndarray | None = None) -> np.ndarray:
    """Index map -> RGBA uint8 through a ramp."""
    h, w = idx.shape
    safe = np.clip(idx, 0, len(ramp) - 1)
    rgb = ramp[safe]
    a = np.full((h, w), 255, dtype=np.uint8) if alpha is None else \
        np.clip(np.asarray(alpha) * 255, 0, 255).astype(np.uint8)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    out[..., 3] = a
    out[a == 0, :3] = 0
    return out


# --- the grade -------------------------------------------------------------
def grade(rgba: np.ndarray) -> np.ndarray:
    """
    The single colour grade, applied to every texture with the same settings.

    This is what makes the set feel like one world rather than 248 files: a
    slight contrast pull toward mid-grey, lifted blacks so nothing is a hole, a
    warm white balance, and per-hue chroma so the reds sing, the blues sit back
    and the greens go sunlit-olive rather than mint.

    Near-neutral colours take only part of the warmth, so stone stays stone.
    """
    rgb = rgba[..., :3].astype(np.float64) / 255.0
    a = rgba[..., 3]

    lab = rgb_to_oklab(rgb)
    L = lab[..., 0]

    # Contrast about mid-grey, then lift blacks.
    L = (L - 0.5) * 0.96 + 0.5
    L = L * 0.965 + 0.03
    lab[..., 0] = L

    lch = lab_to_lch(lab)
    C, H = lch[..., 1], lch[..., 2]

    # How much this colour counts as coloured at all.
    colourfulness = np.clip(C / 0.05, 0.0, 1.0)

    def band(centre, width):
        d = np.abs(((H - centre + 180) % 360) - 180)
        return np.clip(1.0 - d / width, 0.0, 1.0)

    gain = np.ones_like(C)
    gain += band(30, 45) * 0.08    # reds / oranges
    gain += band(90, 35) * 0.04    # yellows
    gain += band(350, 30) * 0.04   # pinks
    gain -= band(230, 55) * 0.03   # blues / cyans
    gain += band(140, 55) * 0.07   # greens
    lch[..., 1] = C * (1 + (gain - 1) * colourfulness)

    # Greens rotate toward yellow-green: sunlit olive, never mint.
    lch[..., 2] = (H - band(140, 55) * 4.0 * colourfulness) % 360.0
    lab = lch_to_lab(lch)

    # Warm white balance, scaled down for near-neutrals so stone stays stone.
    warmth = 0.35 + 0.65 * colourfulness
    shadow = np.clip(1.0 - L * 1.6, 0.0, 1.0)
    light = np.clip((L - 0.55) * 2.0, 0.0, 1.0)
    lab[..., 1] += (shadow * 0.010 - light * 0.002) * warmth   # toward red-brown
    lab[..., 2] += (shadow * 0.006 + light * 0.012) * warmth   # toward honey

    out = np.zeros_like(rgba)
    out[..., :3] = np.clip(oklab_to_rgb(lab) * 255, 0, 255).astype(np.uint8)
    out[..., 3] = a
    out[a == 0, :3] = 0
    return out


# --- checks ----------------------------------------------------------------
def count_colours(rgba: np.ndarray) -> int:
    """Distinct opaque colours. The style budget is ramp length plus two."""
    vis = rgba[rgba[..., 3] > 0][:, :3]
    return 0 if len(vis) == 0 else len(np.unique(vis, axis=0))


def lone_pixels(rgba: np.ndarray) -> int:
    """Opaque pixels differing from all four neighbours. Should be zero."""
    a = rgba[..., 3] > 0
    key = rgba[..., :3].astype(np.int32)
    key = (key[..., 0] << 16) | (key[..., 1] << 8) | key[..., 2]
    key = np.where(a, key, -1)
    n = [np.roll(key, 1, 0), np.roll(key, -1, 0), np.roll(key, 1, 1), np.roll(key, -1, 1)]
    lonely = a.copy()
    for m in n:
        lonely &= (key != m)
    return int(lonely.sum())


def clean_rgba(rgba: np.ndarray, passes: int = 12, wrap: bool = True,
               erase: bool = True) -> np.ndarray:
    """
    Remove lone pixels from a rendered image.

    `finish` cleans in the index domain, which is where it belongs — but an
    asset built from two materials (a tool's handle and head, moss over peat)
    composites *after* rendering, and the seam between them can leave strays
    that no single material's cleanup could see. This is the same rule applied
    to colour: a pixel that matches none of its four neighbours takes the most
    common of them.
    """
    out = rgba.copy()
    for _ in range(passes):
        a = out[..., 3] > 0
        key = out[..., :3].astype(np.int64)
        key = (key[..., 0] << 16) | (key[..., 1] << 8) | key[..., 2]
        key = np.where(a, key, -1)

        if wrap:
            shifts = [np.roll(key, 1, 0), np.roll(key, -1, 0),
                      np.roll(key, 1, 1), np.roll(key, -1, 1)]
            imgs = [np.roll(out, 1, 0), np.roll(out, -1, 0),
                    np.roll(out, 1, 1), np.roll(out, -1, 1)]
        else:
            shifts, imgs = [], []
            for axis, amount in ((0, 1), (0, -1), (1, 1), (1, -1)):
                k = np.roll(key, amount, axis)
                i = np.roll(out, amount, axis)
                sl = [slice(None)] * 2
                sl[axis] = 0 if amount > 0 else -1
                k[tuple(sl)] = -1
                shifts.append(k)
                imgs.append(i)

        lonely = a.copy()
        for k in shifts:
            lonely &= (key != k)
        if not lonely.any():
            break

        # Pick a replacement from the neighbours' COLOURS, never from their
        # positions. Resolving by neighbour order (up, down, left, right) is not
        # left/right symmetric, so it quietly stopped a mirrored pair of frames
        # being mirrored — the one thing the character system exists to
        # guarantee. Agreement wins; a tie is broken by the colour value itself,
        # which mirrors correctly because it does not know where it came from.
        stack = np.stack(shifts)
        opaque = stack != -1

        score = np.zeros(stack.shape, dtype=np.int64)
        for i in range(4):
            agree = np.zeros(stack.shape[1:], dtype=np.int64)
            for j in range(4):
                agree += (stack[i] == stack[j]) & opaque[i] & opaque[j]
            # Agreement dominates; the key breaks ties; transparent never wins.
            score[i] = agree * (1 << 28) + stack[i] - (~opaque[i]) * (1 << 40)

        best = np.argmax(score, axis=0)
        rows = np.arange(out.shape[0])[:, None]
        cols = np.arange(out.shape[1])[None, :]
        key_pick = stack[best, rows, cols]

        picked = np.zeros_like(out)
        picked[..., 0] = (key_pick >> 16) & 0xFF
        picked[..., 1] = (key_pick >> 8) & 0xFF
        picked[..., 2] = key_pick & 0xFF
        picked[..., 3] = 255

        # A stray with no opaque neighbour at all is a one-pixel speck: drop it.
        orphan = lonely & ~opaque.any(axis=0)
        out = np.where(lonely[..., None] & ~orphan[..., None], picked, out)
        out[orphan] = 0

    # Guarantee the invariant rather than approximate it. A handful of pixels
    # can cycle forever: a one-pixel-wide sliver of three different tones, cast
    # along a limb edge by the walk-cycle shear, where every pass recolours the
    # pixel and its neighbours together and nothing settles. Those get erased,
    # and the erase repeats, because removing a stray can strand the pixel that
    # was next to it. A sliver that thin is an artefact of the shear, not drawn
    # detail, and a single stray pixel is the exact thing this rule exists to
    # keep out of the art.
    for _ in range(8):
        a = out[..., 3] > 0
        key = out[..., :3].astype(np.int64)
        key = (key[..., 0] << 16) | (key[..., 1] << 8) | key[..., 2]
        key = np.where(a, key, -1)
        lonely = a.copy()
        neighbours = []
        for axis, amount in ((0, 1), (0, -1), (1, 1), (1, -1)):
            k = np.roll(key, amount, axis)
            if not wrap:
                sl = [slice(None)] * 2
                sl[axis] = 0 if amount > 0 else -1
                k[tuple(sl)] = -1
            neighbours.append((k, np.roll(out, amount, axis)))
            lonely &= (key != k)
        if not lonely.any():
            break

        if erase:
            out[lonely] = 0
        else:
            # A ground tile is opaque everywhere, so erasing a stray would punch
            # a transparent hole in the world. Take the darkest opaque
            # neighbour's colour instead: deterministic, mirror-safe, and it
            # always exists because every neighbour is opaque.
            keys = np.stack([k for k, _ in neighbours])
            imgs = np.stack([i for _, i in neighbours])
            keys = np.where(keys < 0, np.int64(1 << 40), keys)
            pick = np.argmin(keys, axis=0)
            rows = np.arange(out.shape[0])[:, None]
            cols = np.arange(out.shape[1])[None, :]
            out = np.where(lonely[..., None], imgs[pick, rows, cols], out)

    return out


def over(base: np.ndarray, top: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Composite `top` over `base`, optionally limited to `mask`."""
    a = top[..., 3] > 0
    if mask is not None:
        a = a & mask
    return np.where(a[..., None], top, base)
