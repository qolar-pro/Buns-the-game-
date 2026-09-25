"""
Terrain: the nine ground tiles.

All seamless, all 32x32, all lit from the upper left. These are the only
textures the player sees edge to edge across the whole screen, so they carry the
lowest contrast of anything in the set — a ground tile that competes with the
props standing on it makes the world unreadable.

Run: python3 gen_terrain.py [outdir]
"""
from __future__ import annotations

import sys

from hw.checks import report, save
from hw.materials import (
    cobble, grass_top, marsh_ground, planks, rough_stone, sand_ground,
    snow_ground, soil,
)

#: Terrain is drawn at 128 world units per tile, so 128px is 1:1 — every pixel
#: of the texture is a pixel on screen at the design resolution, with nothing
#: upscaled and nothing lost.
SIZE = 128

#: id -> (builder, seed). Seeds are fixed so any tile can be re-made exactly.
TILES = {
    'grass':         (lambda s: grass_top(SIZE, s, 'grass', blades=72), 1001),
    # The variant is the same field with drier patches, so the two blend into
    # each other in game rather than reading as two different lawns.
    'grass_variant': (lambda s: grass_top(SIZE, s, 'moss', blades=48), 1002),
    'dirt':          (lambda s: soil(SIZE, s, 'dirt', pebbles=7), 1003),
    'sand':          (lambda s: sand_ground(SIZE, s), 1004),
    'stone_floor':   (lambda s: cobble(SIZE, s, 'stone', cells=4), 1005),
    'wood_floor':    (lambda s: planks(SIZE, s, 'oak_wood', boards=4), 1006),
    'snow':          (lambda s: snow_ground(SIZE, s), 1007),
    'marsh':         (lambda s: marsh_ground(SIZE, s), 1008),
    'cracked_earth': (lambda s: cobble(SIZE, s, 'sandstone', cells=3), 1009),
}


def build(out_dir: str):
    rows = []
    for name, (fn, seed) in TILES.items():
        img = fn(seed)
        save(img, f'{out_dir}/{name}.png')
        rows.append(report(name, img, seamless=True, budget=11))
    return rows


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/terrain'
    import os
    os.makedirs(out, exist_ok=True)
    for row in build(out):
        flag = 'ok ' if row['ok'] else 'FAIL'
        print(f"{flag} {row['name']:15s} colours={row['colours']:2d} "
              f"lone={row['lone']} seam={row['seam']}")
