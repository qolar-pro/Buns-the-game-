"""
The checks the style demands, as code.

Tiling especially: "looks seamless" is not a thing anyone can judge by eye on a
32px tile. A seam is an edge that is more different than the texture's own
interior edges, so that is what gets measured.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from hw.core import count_colours, lone_pixels


def seam_score(rgba: np.ndarray) -> float:
    """
    How much worse the wrap edge is than the texture's own strongest edges.

    Measured against the 90th percentile of interior edges, not the mean. A
    plank tile is mostly near-identical grain rows with a few hard board gaps;
    against the mean, the perfectly legitimate gap that lands on the wrap reads
    as a seam, and the check fails a texture that tiles correctly. Against the
    top decile, the question becomes the right one: is the join across the
    boundary any harsher than the joins the texture already contains?

    1.0 means the wrap edge is exactly as strong as the texture's strongest
    internal edge — a board gap landing on the boundary, which is correct.
    Under 1.1 is seamless. A broken tile scores well above it, because its
    boundary step has nothing internal to justify it.
    """
    a = rgba[..., :3].astype(np.float64)

    def step(u, v):
        return np.abs(u - v).mean()

    inner_v = np.array([step(a[i], a[i + 1]) for i in range(a.shape[0] - 1)])
    inner_h = np.array([step(a[:, i], a[:, i + 1]) for i in range(a.shape[1] - 1)])

    # Compared against the strongest interior edge, not the mean or a
    # percentile: a plank tile contains only three board gaps in 31 row pairs,
    # so any percentile below the very top misses them and calls a legitimate
    # gap-on-the-boundary a seam.
    ref_v = max(inner_v.max(), 1e-6)
    ref_h = max(inner_h.max(), 1e-6)
    return max(step(a[0], a[-1]) / ref_v, step(a[:, 0], a[:, -1]) / ref_h)


def tile3x3(rgba: np.ndarray) -> np.ndarray:
    """The 3x3 tiling the style guide asks to look at."""
    return np.tile(rgba, (3, 3, 1))


def report(name: str, rgba: np.ndarray, seamless: bool, budget: int,
           materials: int = 1) -> dict:
    """
    One row of the audit: colours, strays, and the seam if it must tile.

    The colour budget is per MATERIAL — one ramp plus at most two accents — not
    per file. A house is made of six materials: plaster, roof tile, timber,
    stone footings, glass and a brass handle. Judging it against one ramp's
    budget would mean the only way to pass was to build houses out of one
    substance, which is not a style rule, it is a worse building.
    """
    row = {
        'name': name,
        'colours': count_colours(rgba),
        'lone': lone_pixels(rgba),
        'budget': budget * materials,
        'seam': round(seam_score(rgba), 2) if seamless else None,
    }
    row['ok'] = (
        row['colours'] <= budget * materials
        and row['lone'] == 0
        and (row['seam'] is None or row['seam'] <= 1.6)
    )
    return row


def save(rgba: np.ndarray, path: str) -> None:
    """RGBA uint8, 8-bit, no compression tricks. Point-filtered by the engine."""
    Image.fromarray(rgba, mode='RGBA').save(path, optimize=True)
