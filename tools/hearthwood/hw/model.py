"""
Character models: one model, rotated.

The old pipeline generated four separate images per character, one per facing,
and hoped they matched. They never quite did — a cow seen from the left was a
different cow from the one seen from the front, because nothing tied them
together but a prompt.

Here a character is built ONCE as a small set of ellipsoids in model space, and
every facing is that same model rotated about its vertical axis. Left really is
right mirrored, back really is front turned around, and the walk frames are the
same limbs swinging. Nothing can drift, because there is only one thing.

Model space:
    x  right (+) / left (-)
    y  up (+), 0 at the feet
    z  toward the camera (-) / away (+)

The camera sits at -z looking toward +z, so a part with a smaller z is nearer
and gets drawn later. Facing is a rotation about y:
    down (toward camera) 0 deg, left +90, up 180, right -90.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from scipy import ndimage

from hw.core import EMPTY, clean_rgba, declump, grade, render
from palettes import ramp

#: 4x4 ordered dither, centred on zero so it perturbs a band boundary both ways
#: rather than brightening everything.
_BAYER = (np.array([
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
], dtype=np.float32) + 0.5) / 16.0 - 0.5

FACINGS = ('down', 'left', 'right', 'up')
_ANGLE = {'down': 0.0, 'left': 90.0, 'up': 180.0, 'right': -90.0}


@dataclass
class Part:
    """One ellipsoid of a creature, in model space."""
    ramp: str
    pos: tuple[float, float, float]
    size: tuple[float, float, float]
    #: Ramp step to bias this part by, so a muzzle reads lighter than a flank.
    tone: int = 0
    #: Swing amplitude in degrees for the walk cycle; legs and arms use it.
    swing: float = 0.0
    #: Phase offset in cycles, so opposite limbs alternate.
    phase: float = 0.0
    #: Pivot height for the swing. Limbs rotate about the hip or shoulder.
    pivot_y: float | None = None
    #: Bob amplitude, in model units, applied with the gait.
    bob: float = 0.0
    #: Drawn only when this fraction of the part faces the camera. Faces and
    #: tails use it so a face does not show through the back of a head.
    front_only: bool = False
    back_only: bool = False
    #: Flatten toward the viewer, for ears and fins that are thin plates.
    plate: bool = False


@dataclass
class CharModel:
    """A character: its parts, how tall it stands, and how it walks."""
    parts: list[Part]
    #: Model height in units; the sprite is scaled so this fills the cell.
    height: float
    #: Vertical bob of the whole body across the gait, in model units.
    body_bob: float = 0.035
    #: Lean into each step, in degrees.
    lean: float = 2.2
    #: Extra ramp step for the whole model, e.g. a paler variant.
    tone: int = 0
    name: str = ''


def _rotate_y(x: float, z: float, degrees: float) -> tuple[float, float]:
    a = np.radians(degrees)
    ca, sa = np.cos(a), np.sin(a)
    return x * ca + z * sa, -x * sa + z * ca


def _swing(part: Part, phase: float) -> Part:
    """Rotate a limb about its pivot for this point in the gait."""
    if part.swing == 0.0:
        return part
    t = (phase + part.phase) % 1.0
    angle = np.sin(t * 2 * np.pi) * part.swing
    px, py, pz = part.pos
    pivot = part.pivot_y if part.pivot_y is not None else py + part.size[1]
    dy = py - pivot
    a = np.radians(angle)
    # Swing in the model's own forward plane (y/z), so a leg steps forward and
    # back rather than sideways whichever way the character is facing.
    ny = pivot + dy * np.cos(a)
    nz = pz + dy * -np.sin(a)
    return replace(part, pos=(px, ny, nz))


_EXTENT_CACHE: dict[int, tuple[float, float, float]] = {}


def _extent(model: CharModel) -> tuple[float, float, float]:
    """
    The model's real bounding box in model units, over every phase of the gait.

    The declared `height` used to drive the projection directly, on the
    assumption that a model occupies exactly 0..height. None of them did. The
    biped's feet are ellipsoids centred at y=0.015 with a vertical radius of
    0.032, so their bottoms sat at y=-0.017 and were **cut flat by the bottom of
    the frame** on every character in the game; meanwhile nothing reached the
    declared 0.88, so 29 rows at the top of every cell were empty. The sprite
    was simultaneously clipped and floating.

    Measuring the model instead means a character is fitted to its cell by
    construction, and a part added later cannot silently push a foot off the
    frame. Measured once per model and over ALL phases, never per frame, so the
    character does not breathe against the cell edge as it walks.
    """
    key = id(model)
    hit = _EXTENT_CACHE.get(key)
    if hit is not None:
        return hit

    y_lo, y_hi, x_half = 1e9, -1e9, 0.0
    for step in range(16):
        phase = step / 16
        bob = np.sin(phase * 4 * np.pi) * model.body_bob * model.height
        for part in model.parts:
            p = _swing(part, phase)
            x, y, z = p.pos
            rx, ry, rz = p.size
            y = y + bob + p.bob * np.sin(phase * 4 * np.pi)
            y_lo = min(y_lo, y - ry)
            y_hi = max(y_hi, y + ry)
            # Worst case across facings: a part's x extent on screen is its
            # widest rotated half-width, which is bounded by max(rx, rz).
            reach = abs(x) if abs(x) > abs(z) else abs(z)
            x_half = max(x_half, reach + max(abs(rx), abs(rz)))

    out = (y_lo, y_hi, x_half)
    _EXTENT_CACHE[key] = out
    return out


def silhouette(model: CharModel, facing: str, phase: float,
               w: int, h: int) -> np.ndarray:
    """
    The model's shape for this facing and phase, before any shading.

    This is the thing that must mirror between the left and right rows. The
    finished pixels do not, and should not: the whole set is lit from the upper
    left, so a character walking left has the light on its face and the same
    character walking right has it on its back. Testing the rendered pixels for
    mirroring would be testing for a bug.
    """
    return _project(model, facing, phase, w, h)[1] > 0


def render_model(model: CharModel, facing: str, phase: float,
                 w: int, h: int) -> np.ndarray:
    """
    Draw one frame: this model, turned to `facing`, at this point in its gait.

    `phase` runs 0..1 over one full stride. A still frame uses 0.
    """
    idx, alpha, ramp_id, ramp_names, lean = _project(model, facing, phase, w, h)

    if lean != 0.0 and alpha.any():
        idx, alpha, ramp_id = _lean(idx, alpha, ramp_id, lean)

    return _paint(idx, alpha, ramp_id, ramp_names)


def _project(model: CharModel, facing: str, phase: float, w: int, h: int):
    """Place every part on screen. Shared by `silhouette` and `render_model`."""
    angle = _ANGLE[facing]
    y_lo, y_hi, x_half = _extent(model)

    # Fit the model to the cell, leaving a one-pixel margin so the outline has
    # somewhere to go, and honour whichever axis is tighter. A character wider
    # than it is tall (the scorpion) would otherwise have its claws clipped.
    margin = 1.0
    scale_y = (h - 1 - 2 * margin) / max(y_hi - y_lo, 1e-6)
    scale_x = (w - 1 - 2 * margin) / max(2 * x_half, 1e-6)
    scale = min(scale_y, scale_x)

    # Whole-body bob and lean, shared by every part so the character moves as one.
    bob = np.sin(phase * 4 * np.pi) * model.body_bob * model.height

    # The lean goes with the direction of travel, so it flips between the left
    # and right rows and is absent walking toward or away from the camera —
    # nobody leans sideways. Shearing every row the same screen direction was
    # what stopped the left and right frames being mirrors of each other, since
    # a shear is the one operation here that does not survive a flip.
    lean_dir = {'left': 1.0, 'right': -1.0, 'down': 0.0, 'up': 0.0}[facing]
    lean = np.sin(phase * 2 * np.pi) * model.lean * lean_dir

    placed = []
    for part in model.parts:
        p = _swing(part, phase)
        x, y, z = p.pos
        rx, ry, rz = p.size

        # Turn the part with the body.
        x, z = _rotate_y(x, z, angle)
        # The silhouette across the screen uses the rotated x and z extents.
        sx, sz = _rotate_y(rx, rz, angle)
        screen_rx = max(abs(sx), abs(sz) * 0.55) if not p.plate else max(abs(sx), 0.02)

        facing_camera = -z  # nearer the camera is more negative z
        if p.front_only and facing_camera < 0:
            continue
        if p.back_only and facing_camera > 0:
            continue

        placed.append((z, x, y + bob + p.bob * np.sin(phase * 4 * np.pi),
                       screen_rx, ry, p))

    # Painter's algorithm: furthest first.
    placed.sort(key=lambda t: -t[0])

    steps_by_ramp = {p.ramp: len(ramp(p.ramp)) for _, _, _, _, _, p in placed}
    idx = np.full((h, w), EMPTY, dtype=np.int16)
    alpha = np.zeros((h, w), dtype=np.float32)
    ramp_id = np.full((h, w), -1, dtype=np.int16)
    ramp_names = sorted(steps_by_ramp)

    yy, xx = np.mgrid[0:h, 0:w]
    cx = (w - 1) / 2.0

    for z, x, y, rx, ry, p in placed:
        # Model space to screen: x across, y up from the bottom row.
        px = cx + x * scale
        # y_lo maps to the last usable row, so the feet stand on the cell floor.
        py = (h - 1 - margin) - (y - y_lo) * scale
        prx = max(rx * scale, 0.6)
        pry = max(ry * scale, 0.6)

        d = ((xx - px) / prx) ** 2 + ((yy - py) / pry) ** 2
        mask = d <= 1.0
        if not mask.any():
            continue

        steps = steps_by_ramp[p.ramp]

        # Light this part: one sun from the upper left, plus the part's own
        # curvature falling off toward its edge.
        lit = ((px - xx) / prx + (py - yy) / pry) * 0.5
        light = lit * 0.62 + (1 - d) * 0.38

        # Quantise to FOUR FLAT BANDS, not to a gradient.
        #
        # This used to be `rint` of a continuous expression, which is a smooth
        # ramp rounded off: every ellipsoid came out airbrushed, and a
        # nine-colour sprite read as a soft blob rather than as pixel art. The
        # styles this is aiming at do the opposite — Minecraft's default blocks
        # carry four or five shades with hard steps between them, and it is the
        # hard steps that make sixteen pixels legible.
        #
        # So: pick a band, and hold it flat across the whole region. The bands
        # sit on the middle of the ramp, keeping the extremes for the outline
        # and for specular hits.
        #
        # An ordered dither breaks the band boundaries. Without it four flat
        # bands on a curved surface draw three concentric contour lines, which
        # reads as a topographic map; with it the boundary dissolves into a
        # checker that the eye takes as texture. It is deterministic (a fixed
        # Bayer matrix indexed by pixel position) so the sprite is still
        # reproducible, and declumping afterwards removes any stray it leaves.
        dither = _BAYER[yy % 4, xx % 4]
        level = np.clip(light * 3.6 + dither * 0.55, 0.0, 3.999).astype(int)

        base = steps // 2 - 1 + p.tone
        shade = base + level

        idx = np.where(mask, np.clip(shade, 0, steps - 1), idx)
        alpha = np.where(mask, 1.0, alpha)
        ramp_id = np.where(mask, ramp_names.index(p.ramp), ramp_id)

    return idx, alpha, ramp_id, ramp_names, lean


def _lean(idx, alpha, ramp_id, degrees: float):
    """Shear the whole frame a little, so the body leans into the step."""
    h, w = idx.shape
    shift = np.tan(np.radians(degrees)) * (h - 1 - np.arange(h))
    out_i = np.full_like(idx, EMPTY)
    out_a = np.zeros_like(alpha)
    out_r = np.full_like(ramp_id, -1)
    for y in range(h):
        s = int(round(shift[y]))
        if s == 0:
            out_i[y], out_a[y], out_r[y] = idx[y], alpha[y], ramp_id[y]
        else:
            out_i[y] = np.roll(idx[y], s)
            out_a[y] = np.roll(alpha[y], s)
            out_r[y] = np.roll(ramp_id[y], s)
            if s > 0:
                out_a[y, :s] = 0
                out_i[y, :s] = EMPTY
            else:
                out_a[y, s:] = 0
                out_i[y, s:] = EMPTY
    return out_i, out_a, out_r


#: The one outline colour, shared by every character in the game.
#:
#: Each part used to be rimmed with step 0 of *its own* ramp. That is a
#: perfectly sensible-sounding rule that does not work: step 0 of the skin ramp
#: is a mid tan, so a face was outlined in a colour a shade off the face, and
#: the figure had no contour at all against the ground. The styles this is
#: aiming at all share the opposite convention — Terraria outlines every sprite
#: in one near-black, and that single dark contour is most of why its sprites
#: stay legible against any background.
#:
#: This is the palette floor from the brief, which is what the floor is for: the
#: darkest colour in the game, warm rather than black.
OUTLINE = np.array([0x1c, 0x12, 0x0b], dtype=np.uint8)


def _paint(idx, alpha, ramp_id, ramp_names) -> np.ndarray:
    """Render each part through its own ramp, then rim, clean and grade."""
    h, w = idx.shape
    solid = alpha > 0

    # Internal edges keep the per-part rim: where two parts of different ramps
    # meet, a step-0 line of the nearer part's own colour separates them without
    # cutting the figure up with black.
    border = solid & ~ndimage.binary_erosion(solid, border_value=0)
    idx = np.where(border, 0, idx)

    # Declump the ramp and the step TOGETHER. Cleaning the index map alone
    # reaches a fixed point that still leaves colour strays, because two parts
    # drawn from different ramps at the same step are different colours — the
    # index map thinks they agree and the eye does not. The joint key is what
    # the viewer actually sees.
    joint = ramp_id.astype(np.int32) * 64 + idx.astype(np.int32)
    joint = np.where(solid, joint, -1)
    for _ in range(8):
        cleaned = declump(joint, 1, mask=solid)
        if np.array_equal(cleaned, joint):
            break
        joint = cleaned
    idx = np.where(solid, joint % 64, idx).astype(np.int16)
    ramp_id = np.where(solid, joint // 64, ramp_id).astype(np.int16)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    for i, name in enumerate(ramp_names):
        pal = ramp(name)
        m = (ramp_id == i) & solid
        if not m.any():
            continue
        safe = np.clip(idx, 0, len(pal) - 1)
        rgb = (pal[safe] * 255).astype(np.uint8)
        out[m] = np.concatenate([rgb[m], np.full((m.sum(), 1), 255, np.uint8)], axis=1)

    out = grade(out)

    # The outline goes on AFTER the grade, so it stays the exact palette floor
    # instead of being lifted by the same curve that lifts the blacks in the
    # art. It is the one colour in the sprite that is not supposed to be lit.
    #
    # It is grown OUTWARD from the silhouette rather than eaten inward, because
    # eating it inward costs the sprite a pixel of its shape everywhere — at
    # this size an arm is four pixels wide and can't spare one. The model is
    # fitted with a margin so there is room for it.
    # Only around parts thick enough to carry a contour — a hat brim or a staff
    # two pixels wide would otherwise become a line of pure outline. See
    # `hw.core.outline_rgba`, which applies the same rule to props and items.
    core = ndimage.binary_erosion(solid, border_value=0)
    thick = ndimage.binary_dilation(core, border_value=0) & solid
    ring = ndimage.binary_dilation(thick, border_value=0) & ~solid
    out[ring, 0:3] = OUTLINE
    out[ring, 3] = 255

    return clean_rgba(out, wrap=False, erase=False)


def sheet(model: CharModel, cols: int, w: int, h: int) -> np.ndarray:
    """
    The full walk sheet: one row per facing, `cols` frames across.

    Rows are down, left, right, up — the order the engine already expects. Every
    cell is the same model; only the rotation and the gait phase change.
    """
    out = np.zeros((h * len(FACINGS), w * cols, 4), dtype=np.uint8)
    for row, facing in enumerate(FACINGS):
        for col in range(cols):
            phase = col / cols
            frame = render_model(model, facing, phase, w, h)
            out[row * h:(row + 1) * h, col * w:(col + 1) * w] = frame
    return out
