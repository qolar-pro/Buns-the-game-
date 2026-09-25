"""
Buildings, drawn as buildings.

The first version was three shapes: a rectangle, a triangle and a smaller
rectangle for a door. At 32px that is all that fits, and it reads as a
placeholder — which is what it was. At 128px there is room for the things that
actually make a building look like one, and every one of them is a rule rather
than a drawing:

  * a foundation course, so the walls stand on something
  * boards or plaster with visible joints
  * a roof of individual shingle rows, each row lit along its top edge
  * eaves that overhang, with a shadow cast on the wall beneath them
  * windows with a frame, a sill, mullions and a diagonal glint on the glass
  * a door with panels, a handle and a step
  * a chimney, because a roofline with nothing on it reads as a tent

Contact shadows matter as much as any of it: the line where the roof meets the
wall and where the wall meets the ground is what gives a flat sprite weight.
"""
from __future__ import annotations

import numpy as np

from hw.core import rng
from hw.draw import Canvas, disc, ellipse, rect, stroke
from hw.sprite import compose, finish_sprite, new_sprite
from palettes import ramp


def _c(w: int, h: int, name: str) -> Canvas:
    return new_sprite(w, h, name)


def _mid(name: str) -> int:
    return len(ramp(name)) // 2 + 1


def shingle_roof(w: int, h: int, seed: int, *, ramp_name: str,
                 apex_y: float, eaves_y: float, overhang: float,
                 rows: int = 7) -> np.ndarray:
    """
    A pitched roof made of courses of tiles.

    Each course is drawn as a band with a light top edge and a dark bottom, and
    the tiles within it are staggered course to course — the same trick as
    brickwork, and the reason a roof reads as covered rather than painted.
    """
    r = rng(seed)
    c = _c(w, h, ramp_name)
    mm = _mid(ramp_name)
    yy, xx = c.coords()

    span = max(eaves_y - apex_y, 1)
    # The roof triangle, widening from the apex to the eaves.
    half = (yy - apex_y) / span * (w * (0.5 + overhang))
    roof = (yy >= apex_y) & (yy <= eaves_y) & (np.abs(xx - w / 2) <= half)
    c.put(roof, mm)

    # Courses.
    course_h = max(3, int(span / rows))
    for i, y0 in enumerate(range(int(apex_y), int(eaves_y) + 1, course_h)):
        band = roof & (yy >= y0) & (yy < y0 + course_h)
        c.shade(band & (yy < y0 + 1), +2)                     # lit top of course
        c.shade(band & (yy >= y0 + course_h - 1), -2)         # shadow underneath
        # Tile joints, staggered every other course.
        offset = (i % 2) * (w // 14)
        for x in range(offset, w, max(6, w // 11)):
            c.put(band & (np.abs(xx - x) < 0.6), max(mm - 3, 0))

    # The right slope sits away from the light.
    c.shade(roof & (xx > w / 2), -1)
    # Ridge.
    c.shade(roof & (yy < apex_y + 2), +2)
    # The eave edge itself, one step dark so the roof ends in a line.
    c.put(roof & (yy > eaves_y - 2), max(mm - 3, 0))
    return finish_sprite(c, ramp_name)


def window(w: int, h: int, seed: int, *, cx: float, cy: float,
           ww: float, wh: float, frame: str = 'oak_bark',
           glass: str = 'ice', lit: bool = False) -> np.ndarray:
    """A framed window with mullions, a sill and a glint."""
    f = _c(w, h, frame)
    fm = _mid(frame)
    x0, x1 = int(cx - ww / 2), int(cx + ww / 2)
    y0, y1 = int(cy - wh / 2), int(cy + wh / 2)
    f.put(rect(f, x0 - 2, y0 - 2, x1 + 2, y1 + 2), fm)
    f.put(rect(f, x0 - 2, y0 - 2, x1 + 2, y0 - 1), fm + 2)     # lit lintel
    f.put(rect(f, x0 - 3, y1 + 1, x1 + 3, y1 + 3), fm + 1)     # sill, catches light
    f.shade(rect(f, x0 - 3, y1 + 3, x1 + 3, y1 + 4), -3)       # shadow under sill
    frame_img = finish_sprite(f, frame)

    g = _c(w, h, glass)
    pane = rect(g, x0, y0, x1, y1)
    gm = len(ramp(glass)) - (2 if lit else 4)
    g.put(pane, gm)
    # A diagonal glint: the single strongest "this is glass" signal there is.
    yy, xx = g.coords()
    glint = pane & (np.abs((xx - x0) - (yy - y0) * 1.15 - ww * 0.22) < ww * 0.10)
    g.put(glint, min(gm + 2, len(ramp(glass)) - 1))
    g.shade(pane & (yy > cy), -1)
    glass_img = finish_sprite(g, glass, outline=False)

    m = _c(w, h, frame)
    m.put(rect(m, int(cx) - 1, y0, int(cx), y1), fm + 1)       # mullions
    m.put(rect(m, x0, int(cy) - 1, x1, int(cy)), fm + 1)
    return compose(frame_img, glass_img, finish_sprite(m, frame, outline=False))


def door(w: int, h: int, seed: int, *, cx: float, base_y: float,
         dw: float, dh: float, body: str = 'oak_bark',
         handle: str = 'gold') -> np.ndarray:
    """A panelled door with a handle and a step."""
    c = _c(w, h, body)
    mm = _mid(body)
    x0, x1 = int(cx - dw / 2), int(cx + dw / 2)
    y0, y1 = int(base_y - dh), int(base_y)

    c.put(rect(c, x0, y0, x1, y1), mm)
    c.put(rect(c, x0, y0, x1, y0 + 1), mm + 2)                 # lit head
    c.shade(rect(c, x1 - 1, y0, x1, y1), -2)                   # shadowed edge
    # Two recessed panels.
    for py0, py1 in ((y0 + 4, y0 + int(dh * 0.42)), (y0 + int(dh * 0.50), y1 - 4)):
        c.shade(rect(c, x0 + 3, py0, x1 - 3, py1), -1)
        c.shade(rect(c, x0 + 3, py0, x1 - 3, py0), -2)
        c.put(rect(c, x0 + 3, py1, x1 - 3, py1), mm + 1)
    img = finish_sprite(c, body)

    k = _c(w, h, handle)
    k.put(disc(k, x1 - 4, (y0 + y1) / 2, 1.8), len(ramp(handle)) - 2)
    return compose(img, finish_sprite(k, handle, outline=False))


def chimney(w: int, h: int, seed: int, *, cx: float, top_y: float,
            bottom_y: float, body: str = 'cloth_red') -> np.ndarray:
    """A brick stack with a lip. Gives the roofline something to break it."""
    r = rng(seed)
    c = _c(w, h, body)
    mm = _mid(body)
    cw = max(6, int(w * 0.09))
    x0, x1 = int(cx - cw / 2), int(cx + cw / 2)
    c.put(rect(c, x0, int(top_y), x1, int(bottom_y)), mm)
    c.put(rect(c, x0 - 2, int(top_y), x1 + 2, int(top_y) + 3), mm + 2)  # lip
    c.shade(rect(c, x1 - 1, int(top_y), x1, int(bottom_y)), -2)
    for i, y in enumerate(range(int(top_y) + 5, int(bottom_y), 4)):
        c.put(rect(c, x0, y, x1, y), max(mm - 3, 0))
        off = (i % 2) * 3
        c.put(rect(c, x0 + off + 2, y, x0 + off + 2, min(y + 3, int(bottom_y))),
              max(mm - 3, 0))
    return finish_sprite(c, body)


def house(w: int, h: int, seed: int, *, wall: str = 'cloth_cream',
          roof: str = 'cloth_red', trim: str = 'oak_bark',
          foundation: str = 'stone', storeys: float = 1.0,
          windows: int = 2, with_chimney: bool = True,
          glass_lit: bool = False) -> np.ndarray:
    """
    A cottage.

    Proportions are fractions of the frame, so the same builder makes a cottage
    and a longhouse by changing two numbers rather than by being rewritten.
    """
    r = rng(seed)
    base_y = h - 1
    found_h = h * 0.055
    wall_top = h * (0.50 - 0.09 * (storeys - 1))
    apex = h * 0.10
    overhang = 0.055

    # --- walls -------------------------------------------------------------
    c = _c(w, h, wall)
    mm = _mid(wall)
    wx0, wx1 = int(w * 0.14), int(w * 0.86)
    c.put(rect(c, wx0, int(wall_top), wx1, int(base_y - found_h)), mm)
    yy, xx = c.coords()
    # Plaster mottling, so a big flat wall is not a flat colour.
    for _ in range(int(w * h / 320)):
        c.shade(disc(c, r.integers(wx0, wx1), r.integers(int(wall_top), int(base_y)),
                     r.uniform(1.0, 2.6)), int(r.integers(-1, 2)))
    c.shade(rect(c, wx1 - 3, int(wall_top), wx1, int(base_y)), -1)   # shaded side
    c.put(rect(c, wx0, int(wall_top), wx0 + 1, int(base_y)), mm + 1)  # lit corner
    # The eave shadow: the single strongest depth cue on the whole sprite.
    for i in range(4):
        c.shade(rect(c, wx0, int(wall_top) + i, wx1, int(wall_top) + i), -3 + i)
    img = finish_sprite(c, wall)

    # --- foundation --------------------------------------------------------
    f = _c(w, h, foundation)
    fm = _mid(foundation)
    f.put(rect(f, wx0 - 2, int(base_y - found_h), wx1 + 2, base_y), fm)
    f.put(rect(f, wx0 - 2, int(base_y - found_h), wx1 + 2, int(base_y - found_h)), fm + 2)
    for x in range(wx0, wx1, max(8, w // 14)):
        f.put(rect(f, x, int(base_y - found_h) + 1, x, base_y), max(fm - 3, 0))
    img = compose(img, finish_sprite(f, foundation))

    # --- timber trim -------------------------------------------------------
    t = _c(w, h, trim)
    tm = _mid(trim)
    t.put(rect(t, wx0 - 2, int(wall_top) - 1, wx0 + 1, int(base_y - found_h)), tm)
    t.put(rect(t, wx1 - 1, int(wall_top) - 1, wx1 + 2, int(base_y - found_h)), tm - 1)
    img = compose(img, finish_sprite(t, trim))

    # --- roof --------------------------------------------------------------
    img = compose(img, shingle_roof(w, h, seed + 1, ramp_name=roof,
                                    apex_y=apex, eaves_y=wall_top + h * 0.035,
                                    overhang=overhang,
                                    rows=max(5, int(h / 26))))

    if with_chimney:
        # It has to emerge from the roof slope, not float beside it, so the
        # bottom is pushed well under the tiles at the x it stands at.
        img = compose(img, chimney(w, h, seed + 2, cx=w * 0.72,
                                   top_y=h * 0.055,
                                   bottom_y=wall_top - h * 0.02))

    # --- openings ----------------------------------------------------------
    door_w = w * 0.16
    img = compose(img, door(w, h, seed + 3, cx=w * 0.50,
                            base_y=base_y - found_h + 1,
                            dw=door_w, dh=h * (0.30 - 0.04 * (storeys - 1)),
                            body=trim))

    wy = wall_top + (base_y - found_h - wall_top) * 0.34
    spots = {1: [0.28], 2: [0.27, 0.73], 3: [0.24, 0.50, 0.76]}[max(1, min(3, windows))]
    for i, fx in enumerate(spots):
        if abs(fx - 0.5) < 0.09:
            continue  # the door is there
        img = compose(img, window(w, h, seed + 10 + i, cx=w * fx, cy=wy,
                                  ww=w * 0.13, wh=h * 0.10,
                                  frame=trim, lit=glass_lit))
    return img


def stall(w: int, h: int, seed: int, *, awning: str = 'cloth_red',
          body: str = 'oak_wood') -> np.ndarray:
    """A market stall: a striped awning over a counter stacked with crates."""
    r = rng(seed)
    base_y = h - 1
    c = _c(w, h, body)
    mm = _mid(body)
    # Counter and posts.
    c.put(rect(c, int(w * 0.14), int(h * 0.60), int(w * 0.86), int(h * 0.70)), mm + 1)
    c.shade(rect(c, int(w * 0.14), int(h * 0.70), int(w * 0.86), int(h * 0.72)), -3)
    c.put(rect(c, int(w * 0.16), int(h * 0.70), int(w * 0.20), base_y), mm - 1)
    c.put(rect(c, int(w * 0.80), int(h * 0.70), int(w * 0.84), base_y), mm - 1)
    c.put(rect(c, int(w * 0.16), int(h * 0.26), int(w * 0.20), int(h * 0.60)), mm - 1)
    c.put(rect(c, int(w * 0.80), int(h * 0.26), int(w * 0.84), int(h * 0.60)), mm - 1)
    img = finish_sprite(c, body)

    a = _c(w, h, awning)
    am = _mid(awning)
    yy, xx = a.coords()
    canopy = (yy >= h * 0.22) & (yy <= h * 0.38) & (np.abs(xx - w / 2) <= w * 0.40)
    a.put(canopy, am)
    a.put(canopy & (yy < h * 0.24), am + 2)
    # Scalloped edge and stripes.
    a.shade(canopy & (yy > h * 0.355), -2)
    for x in range(0, w, max(8, w // 12)):
        a.shade(canopy & (np.abs(xx - x) < max(3, w // 26)), -2)
    img = compose(img, finish_sprite(a, awning))

    # Goods on the counter.
    g = _c(w, h, 'dead_plant')
    for i in range(3):
        gx = w * (0.30 + i * 0.20)
        g.put(rect(g, int(gx - w * 0.055), int(h * 0.50),
                   int(gx + w * 0.055), int(h * 0.60)), _mid('dead_plant'))
        g.put(rect(g, int(gx - w * 0.055), int(h * 0.50),
                   int(gx + w * 0.055), int(h * 0.51)), _mid('dead_plant') + 2)
    return compose(img, finish_sprite(g, 'dead_plant'))
