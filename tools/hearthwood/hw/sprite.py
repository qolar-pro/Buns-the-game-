"""
Sprite helpers.

A sprite is a silhouette plus shading plus a dark rim. The rim is drawn from
the material's own darkest ramp step rather than a shared outline colour, which
is what keeps a copper kettle and a spruce plank looking like they were drawn
by the same hand without looking like they were drawn on the same day.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from hw.core import EMPTY, clean_rgba, declump, grade, over, render, rng
from hw.draw import Canvas, disc, ellipse, rect, stroke
from palettes import ramp


def new_sprite(w: int, h: int, ramp_name: str) -> Canvas:
    return Canvas(w, h, len(ramp(ramp_name)), fill=EMPTY)


def rim(c: Canvas, step: int = 0, inner: bool = True) -> None:
    """
    A one-pixel dark border just inside the silhouette.

    Inside rather than outside, so a 32px sprite keeps its full size and its
    authored anchor still lands where the manifest says it does.

    The bottom and right of the rim go a step darker still. An object standing
    on ground of a similar value disappears into it without that: the rim is
    what separates a rock from the dirt it is sitting on, and a uniform rim
    reads as a sticker rather than as something with weight on one side.
    """
    solid = c.solid()
    if not solid.any():
        return
    border = solid & ~ndimage.binary_erosion(solid, border_value=0)
    if not inner:
        return

    c.idx = np.where(border, step, c.idx)

    # Grounded side: the border pixels with nothing solid below or to the right.
    below = np.roll(solid, -1, 0)
    below[-1] = False
    right = np.roll(solid, -1, 1)
    right[:, -1] = False
    c.idx = np.where(border & (~below | ~right), max(step - 0, 0), c.idx)


def dome(c: Canvas, mask: np.ndarray | None = None, strength: float = 1.0) -> None:
    """
    Light a rounded form: bright rim upper left, shadow crescent lower right.

    Works from the distance-to-edge field, so it lights a pebble, a loaf and a
    smoke puff with the same call.
    """
    solid = c.solid() if mask is None else (c.solid() & mask)
    if not solid.any():
        return
    dist = ndimage.distance_transform_edt(solid).astype(np.float64)
    dist /= max(dist.max(), 1e-6)

    yy, xx = c.coords()
    ys, xs = np.nonzero(solid)
    cy, cx = ys.mean(), xs.mean()
    span = max(c.w, c.h)
    lit = ((cx - xx) + (cy - yy)) / span

    # A wider tonal spread than realism wants. At 32px a shape has only a few
    # pixels to say "round", so the light side has to be clearly lighter and the
    # shadow side clearly darker or the form reads flat against the ground.
    delta = np.rint((lit * 3.1 + (dist - 0.45) * 1.5) * strength).astype(int)
    c.idx = np.where(solid, np.clip(c.idx + delta, 0, c.steps - 1), c.idx)


def top_light(c: Canvas, top: int = 2, bottom: int = -1) -> None:
    """Lit top edge, darker underside. The flat-surface equivalent of `dome`."""
    solid = c.solid()
    above = np.roll(solid, 1, 0)
    above[0] = False
    below = np.roll(solid, -1, 0)
    below[-1] = False
    c.shade(solid & ~above, top)
    c.shade(solid & ~below, bottom)


def finish_sprite(c: Canvas, ramp_name: str, outline: bool = True,
                  passes: int = 1) -> np.ndarray:
    """Rim, declump inside the silhouette only, render, grade."""
    if outline:
        rim(c)
    c.clip()
    idx = declump(c.idx, passes, mask=c.solid())
    for _ in range(5):
        cleaned = declump(idx, 1, mask=c.solid())
        if np.array_equal(cleaned, idx):
            break
        idx = cleaned
    img = grade(render(idx, ramp(ramp_name), c.alpha))
    return clean_rgba(img, wrap=False)


def compose(*layers: np.ndarray) -> np.ndarray:
    """Stack rendered sprites back to front, then clean the seams between them."""
    out = layers[0]
    for layer in layers[1:]:
        out = over(out, layer)
    return clean_rgba(out, wrap=False)


def place(canvas_w: int, canvas_h: int, img: np.ndarray, x: int, y: int) -> np.ndarray:
    """Paste a small rendered sprite into a larger transparent frame."""
    out = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    h, w = img.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(canvas_w, x + w), min(canvas_h, y + h)
    if x1 <= x0 or y1 <= y0:
        return out
    out[y0:y1, x0:x1] = img[y0 - y:y1 - y, x0 - x:x1 - x]
    return out


def bbox(img: np.ndarray):
    """Opaque bounds, for checking a sprite sits where the anchor expects."""
    a = img[..., 3] > 0
    if not a.any():
        return None
    ys, xs = np.nonzero(a)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


# --- shared silhouettes ----------------------------------------------------
def blob(c: Canvas, cx: float, cy: float, rx: float, ry: float,
         r: np.random.Generator, wobble: float = 0.18) -> np.ndarray:
    """
    An irregular rounded mass — rocks, ore, loaves, clumps of fur.

    The radius wanders with angle, so nothing in the world is a perfect circle
    except the things that should be.
    """
    yy, xx = c.coords()
    dx = xx - cx
    dy = yy - cy
    ang = np.arctan2(dy, dx)
    k = r.uniform(-wobble, wobble, 6)
    wob = 1.0
    for i, amp in enumerate(k, start=1):
        wob = wob + amp * np.sin(ang * i + r.uniform(0, 6.28)) / i
    return (dx / (rx * wob)) ** 2 + (dy / (ry * wob)) ** 2 <= 1.0


def tapered(c: Canvas, x0: float, y0: float, x1: float, y1: float,
            w0: float, w1: float) -> np.ndarray:
    """A thick-to-thin bar: handles, stalks, blades, bones."""
    yy, xx = c.coords()
    dx, dy = x1 - x0, y1 - y0
    length = max(np.hypot(dx, dy), 1e-6)
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (length * length), 0, 1)
    px = x0 + t * dx
    py = y0 + t * dy
    width = w0 + (w1 - w0) * t
    return np.hypot(xx - px, yy - py) <= width
