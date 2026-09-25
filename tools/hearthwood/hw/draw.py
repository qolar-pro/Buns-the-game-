"""
Drawing primitives that paint ramp indices, not colours.

Every function here writes small integers into an index map and, where a sprite
is being built rather than a tile, into an alpha mask alongside it. They all
take a `wrap` flag: seamless textures draw with wrapping so a stone that falls
off the right edge comes back on the left, and sprites draw without it.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from hw.core import EMPTY


class Canvas:
    """An index map plus its alpha mask, with the ramp length it is drawn for."""

    def __init__(self, w: int, h: int, steps: int, fill: int = EMPTY):
        self.w = w
        self.h = h
        self.steps = steps
        self.idx = np.full((h, w), fill, dtype=np.int16)
        self.alpha = np.zeros((h, w), dtype=np.float32) if fill == EMPTY \
            else np.ones((h, w), dtype=np.float32)

    # --- helpers ----------------------------------------------------------
    def clip(self) -> None:
        self.idx = np.clip(self.idx, 0, self.steps - 1)

    def solid(self) -> np.ndarray:
        return self.alpha > 0

    def put(self, mask: np.ndarray, value) -> None:
        """Paint `value` (scalar or array) wherever `mask` is true, and open alpha."""
        self.idx = np.where(mask, value, self.idx)
        self.alpha = np.where(mask, 1.0, self.alpha)

    def shade(self, mask: np.ndarray, delta: int) -> None:
        """Move existing pixels up or down the ramp without opening new alpha."""
        m = mask & self.solid()
        self.idx = np.where(m, np.clip(self.idx + delta, 0, self.steps - 1), self.idx)

    def coords(self):
        return np.mgrid[0:self.h, 0:self.w]


# --- fields ----------------------------------------------------------------
def disc(c: Canvas, cx: float, cy: float, r: float, wrap: bool = False) -> np.ndarray:
    yy, xx = c.coords()
    dx = xx - cx
    dy = yy - cy
    if wrap:
        dx = (dx + c.w / 2) % c.w - c.w / 2
        dy = (dy + c.h / 2) % c.h - c.h / 2
    return dx * dx + dy * dy <= r * r


def ellipse(c: Canvas, cx: float, cy: float, rx: float, ry: float,
            wrap: bool = False) -> np.ndarray:
    yy, xx = c.coords()
    dx = xx - cx
    dy = yy - cy
    if wrap:
        dx = (dx + c.w / 2) % c.w - c.w / 2
        dy = (dy + c.h / 2) % c.h - c.h / 2
    return (dx / max(rx, 1e-6)) ** 2 + (dy / max(ry, 1e-6)) ** 2 <= 1.0


def superellipse(c: Canvas, cx: float, cy: float, rx: float, ry: float,
                 power: float = 5.0) -> np.ndarray:
    """Square-ish distance field. Used for log-end growth rings."""
    yy, xx = c.coords()
    dx = np.abs(xx - cx) / max(rx, 1e-6)
    dy = np.abs(yy - cy) / max(ry, 1e-6)
    return (dx ** power + dy ** power) ** (1.0 / power)


def rect(c: Canvas, x0: int, y0: int, x1: int, y1: int) -> np.ndarray:
    yy, xx = c.coords()
    return (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)


def hline(c: Canvas, y: int, x0: int = 0, x1: int | None = None) -> np.ndarray:
    x1 = c.w - 1 if x1 is None else x1
    return rect(c, x0, y % c.h, x1, y % c.h)


def vline(c: Canvas, x: int, y0: int = 0, y1: int | None = None) -> np.ndarray:
    y1 = c.h - 1 if y1 is None else y1
    return rect(c, x % c.w, y0, x % c.w, y1)


# --- strokes ---------------------------------------------------------------
def stroke(c: Canvas, pts, wrap: bool = False) -> np.ndarray:
    """A 1px path through a list of (x, y) points."""
    mask = np.zeros((c.h, c.w), dtype=bool)
    pts = list(pts)
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for t in range(int(n) + 1):
            x = int(round(x0 + (x1 - x0) * t / n))
            y = int(round(y0 + (y1 - y0) * t / n))
            if wrap:
                mask[y % c.h, x % c.w] = True
            elif 0 <= x < c.w and 0 <= y < c.h:
                mask[y, x] = True
    return mask


def wobble_column(h: int, x: float, amount: float, r: np.random.Generator,
                  steps: int = 4) -> np.ndarray:
    """
    An x position per row that wanders — bark furrows, cracks, drips.

    Built from a few random control points and interpolated, so it wanders
    smoothly instead of jittering per row.
    """
    ctrl = r.uniform(-amount, amount, steps + 1)
    ctrl[-1] = ctrl[0]  # close the loop so it tiles vertically
    t = np.linspace(0, steps, h)
    i = np.clip(t.astype(int), 0, steps - 1)
    f = t - i
    f = f * f * (3 - 2 * f)
    return x + ctrl[i] * (1 - f) + ctrl[i + 1] * f


# --- stamps ----------------------------------------------------------------
#: Five hand-drawn leaf shapes, 3-5px. Drawn as offsets so they can be stamped
#: anywhere, wrapped, without building a sub-image each time.
LEAF_STAMPS = [
    [(0, 0), (1, 0), (2, 0), (1, 1), (0, 1)],
    [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)],
    [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)],
    [(0, 0), (1, 0), (2, 0), (3, 1), (2, 1), (1, 1)],
    [(0, 1), (1, 0), (2, 0), (3, 0), (3, 1)],
]

#: Small knot motifs for wood, 4x3.
KNOT_STAMPS = [
    [(1, 0), (2, 0), (0, 1), (3, 1), (1, 2), (2, 2)],
    [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (3, 1), (1, 2), (2, 2)],
]


def stamp(c: Canvas, cells, x: int, y: int, value: int, wrap: bool = True) -> np.ndarray:
    """Place a list of (dx, dy) offsets at (x, y)."""
    mask = np.zeros((c.h, c.w), dtype=bool)
    for dx, dy in cells:
        px, py = x + dx, y + dy
        if wrap:
            mask[py % c.h, px % c.w] = True
        elif 0 <= px < c.w and 0 <= py < c.h:
            mask[py, px] = True
    return mask


# --- voronoi ---------------------------------------------------------------
def periodic_voronoi(size: int, cells: int, r: np.random.Generator,
                     jitter: float = 0.38):
    """
    Seamless jittered Voronoi, for cobbles and cracked ground.

    Returns (region id per pixel, distance to the nearest site, distance to the
    second nearest). The gap between first and second distance is the mortar
    line, which is why the second is returned rather than recomputed.
    """
    step = size / cells
    sites = []
    for gy in range(cells):
        for gx in range(cells):
            jx = (gx + 0.5 + r.uniform(-jitter, jitter)) * step
            jy = (gy + 0.5 + r.uniform(-jitter, jitter)) * step
            sites.append((jx, jy))
    sites = np.array(sites)

    yy, xx = np.mgrid[0:size, 0:size]
    best = np.full((size, size), np.inf)
    second = np.full((size, size), np.inf)
    region = np.zeros((size, size), dtype=np.int32)

    for i, (sx, sy) in enumerate(sites):
        dx = np.abs(xx - sx)
        dy = np.abs(yy - sy)
        dx = np.minimum(dx, size - dx)   # wrap
        dy = np.minimum(dy, size - dy)
        d = np.hypot(dx, dy)
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        region = np.where(closer, i, region)
        best = np.where(closer, d, best)

    return region, best, second, sites


def region_light(region: np.ndarray, best: np.ndarray, sites: np.ndarray) -> np.ndarray:
    """
    Per-region doming, lit upper left.

    Each Voronoi cell gets its own light ramp so a cobble floor reads as many
    domed stones rather than one noisy surface.

    The centre of a cell is its SITE, not the mean of its pixels. A stone that
    straddles the tile edge has half its pixels at x=0 and half at x=size, so
    their mean lands in the middle of the tile — nowhere near the stone — and it
    gets lit from the wrong side. That was invisible at 32px and opened a hard
    seam at 128.
    """
    size = region.shape[0]
    yy, xx = np.mgrid[0:size, 0:size]
    out = np.zeros_like(best, dtype=np.float64)
    for i in np.unique(region):
        m = region == i
        cx, cy = sites[i]
        # Offsets measured the short way round, so the light wraps with the tile.
        dx = xx - cx
        dy = yy - cy
        dx = (dx + size / 2) % size - size / 2
        dy = (dy + size / 2) % size - size / 2
        lit = (-dx - dy) / size
        dome = best / max(best[m].max(), 1e-6)
        out = np.where(m, lit * 2.0 + (1 - dome) * 0.6, out)
    return out


def edge_of(mask: np.ndarray) -> np.ndarray:
    """One-pixel border just inside a mask."""
    return mask & ~ndimage.binary_erosion(mask, border_value=0)
