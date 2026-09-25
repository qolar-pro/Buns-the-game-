"""
World props: all 69 of them.

Frame sizes follow the shape of the thing: 32x48 for anything that stands tall,
32x32 for everything else, and each is planted on the bottom row of its frame
because that is where the engine anchors it.

Run: python3 gen_world.py [outdir]
"""
from __future__ import annotations

import json
import os
import sys

from hw.checks import report, save
from hw.core import outline_rgba
from hw.materials import log_end
from hw.architecture import house, stall
from hw.props import (anvil_prop, barrel_prop, bed_prop, chest_prop,
                     furnace_prop, well_prop, workbench_prop)
from hw.props import (
    boulder, box, cactus_prop, effect, flower_patch, mushroom_prop,
    opening, plank_panel, post_thing, tree, tuft,
)

#: Authored world sizes, exported from the engine's asset manifest.
_SIZES_PATH = os.path.join(os.path.dirname(__file__), 'world_sizes.json')
with open(_SIZES_PATH) as fh:
    WORLD_SIZES = json.load(fh)

#: Sprite width in pixels. Height follows from the shape the game wants.
#:
#: 32 was too coarse for anything with construction in it: a house at 32x48 has
#: eleven pixels of roof, which is not enough for shingles, a window frame and
#: an eave. At 128 the same building gets rows of tiles, mullioned glass and a
#: shadow under the overhang, and the world stops reading as placeholder.
WIDTH = 128


def frame_for(name: str) -> tuple[int, int]:
    """
    Pixel size for a prop, taken from its authored world size.

    The art used to be sized by hand — 32x32 or 32x48, chosen per asset — while
    the manifest separately authored how big the thing is in the world. Two
    numbers for one shape drift: a torch authored 60x110 tall and drawn 32x32
    square is squashed to two thirds its height, with its collider squashed to
    match. Deriving one from the other means they cannot disagree.
    """
    ws = WORLD_SIZES.get(f'world/{name}')
    if not ws:
        return (WIDTH, WIDTH)
    h = round(WIDTH * ws['h'] / ws['w'] / 4) * 4
    return (WIDTH, max(64, min(256, h)))


# Kept as names so the table below stays readable; both now resolve per asset.
TALL = 'tall'
FLAT = 'flat' 

PROPS: dict[str, tuple] = {}


def add(name: str, size, fn, seed: int, materials: int = 1) -> None:
    PROPS[name] = (size, fn, seed, materials)


# --- ground detail ---------------------------------------------------------
add('tall_grass',  FLAT, lambda w, h, s: tuft(w, h, s, blades=13, tall=0.62), 3001)
add('flowers_a',   FLAT, lambda w, h, s: flower_patch(w, h, s, 'parchment'), 3002, materials=2)
add('flowers_b',   FLAT, lambda w, h, s: flower_patch(w, h, s, 'cloth_red'), 3003, materials=2)
add('pebbles',     FLAT, lambda w, h, s: boulder(w, h, s, rock='pebble', size=0.22), 3004)
add('twigs',       FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='oak_bark',
                                              blades=5, tall=0.30, spread=0.40), 3005)
add('mushroom',    FLAT, lambda w, h, s: mushroom_prop(w, h, s), 3006, materials=2)

# --- trees and wood --------------------------------------------------------
add('tree',        TALL, lambda w, h, s: tree(w, h, s), 3010, materials=2)
add('small_tree',  TALL, lambda w, h, s: tree(w, h, s, crown_r=0.30, trunk_w=0.06), 3011, materials=2)
add('sapling',     FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='grass',
                                              blades=4, tall=0.42), 3012)
# A cut stump seen from above is a log end, which the material library already
# knows how to draw. It was a plain brown oval, because `box(rounded=True)` is a
# filled ellipse and nothing more.
add('trunk',       FLAT, lambda w, h, s: log_end(min(w, h), s, 'oak_wood'), 3013)
add('bush',        FLAT, lambda w, h, s: tree(w, h, s, crown_r=0.46,
                                              trunk_w=0.028, crown='moss'), 3014, materials=2)
add('pine_tree',   TALL, lambda w, h, s: tree(w, h, s, crown='pine',
                                              trunk='dark_bark', conifer=True), 3015, materials=2)
add('palm_tree',   TALL, lambda w, h, s: tree(w, h, s, crown='cactus',
                                              trunk='dead_plant', crown_r=0.34,
                                              trunk_w=0.05, lean=0.06), 3016, materials=2)
add('swamp_tree',  TALL, lambda w, h, s: tree(w, h, s, trunk='dark_bark', bare=True), 3017)
add('dead_bush',   FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='dead_plant',
                                              blades=10, tall=0.48), 3018)

# --- rocks and ore ---------------------------------------------------------
for _n, _sz, _rock, _vein, _cap, _sd in [
    ('rock_a', FLAT, 'stone', None, None, 3020),
    ('rock_b', FLAT, 'stone', None, None, 3021),
    ('rock_c', FLAT, 'stone', None, None, 3022),
    ('coal_ore', FLAT, 'stone', 'coal', None, 3023),
    ('iron_ore', FLAT, 'stone', 'copper', None, 3024),
    ('copper_ore', FLAT, 'stone', 'copper', None, 3025),
    ('titanium_ore', FLAT, 'stone', 'titanium', None, 3026),
    ('desert_rock', FLAT, 'sandstone', None, None, 3027),
    ('snow_rock', FLAT, 'stone', None, 'snow', 3028),
    ('bog_iron', FLAT, 'marsh', 'copper', None, 3029),
    ('rubble', FLAT, 'stone', None, None, 3030),
]:
    add(_n, _sz, (lambda rk, vn, cp: (lambda w, h, s: boulder(
        w, h, s, rock=rk, vein=vn, cap=cp)))(_rock, _vein, _cap), _sd)

add('ice_shard',    FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='ice',
                                               blades=7, tall=0.55, spread=0.24), 3031)
add('frost_flower', FLAT, lambda w, h, s: flower_patch(w, h, s, 'ice', 'pine'), 3032, materials=2)
add('glow_moss',    FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='glow_green',
                                               blades=9, tall=0.26, spread=0.38), 3033)
add('reeds',        FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='reed',
                                               blades=12, tall=0.80, spread=0.26), 3034)
add('lily_pad',     FLAT, lambda w, h, s: flower_patch(w, h, s, 'parchment', 'bog'), 3035, materials=2)
add('cactus',       TALL, lambda w, h, s: cactus_prop(w, h, s), 3036)

# --- crops -----------------------------------------------------------------
add('crop_seedling', FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='grass',
                                                blades=5, tall=0.22), 3040)
add('crop_growing',  FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='grass',
                                                blades=9, tall=0.48), 3041)
add('crop_wheat',    FLAT, lambda w, h, s: tuft(w, h, s, ramp_name='wheat',
                                                blades=11, tall=0.72, tip='gold'), 3042, materials=2)

# --- placeables ------------------------------------------------------------
add('workbench',  FLAT, lambda w, h, s: workbench_prop(w, h, s), 3050, materials=2)
add('furnace',    FLAT, lambda w, h, s: furnace_prop(w, h, s), 3051, materials=3)
add('furnace_lit', FLAT, lambda w, h, s: furnace_prop(w, h, s, lit=True), 3052, materials=3)
add('chest',      FLAT, lambda w, h, s: chest_prop(w, h, s), 3053, materials=3)
add('chest_open', FLAT, lambda w, h, s: chest_prop(w, h, s, open_lid=True), 3054, materials=4)
add('loot_chest', FLAT, lambda w, h, s: chest_prop(w, h, s, body='dark_bark',
                                                   band='gold', lock='gold'), 3055, materials=3)
add('crate',      FLAT, lambda w, h, s: chest_prop(w, h, s, body='spruce_wood',
                                                   band='iron', lock=None), 3056, materials=2)
add('barrel',     FLAT, lambda w, h, s: barrel_prop(w, h, s), 3057, materials=2)
add('bed',        FLAT, lambda w, h, s: bed_prop(w, h, s), 3058, materials=3)
add('anvil',      FLAT, lambda w, h, s: anvil_prop(w, h, s), 3059, materials=2)
add('wall',       FLAT, lambda w, h, s: plank_panel(w, h, s, body='oak_wood'), 3060)
add('floor',      FLAT, lambda w, h, s: plank_panel(w, h, s, body='spruce_wood',
                                                    vertical=False), 3061)
add('door',       TALL, lambda w, h, s: box(w, h, s, body='oak_bark', band='iron'), 3062, materials=2)
add('fence',      FLAT, lambda w, h, s: plank_panel(w, h, s, body='oak_bark',
                                                    vertical=False, boards=3), 3063)

# --- posts and fire --------------------------------------------------------
add('torch',      FLAT, lambda w, h, s: post_thing(w, h, s, head='y',
                                                   head_shape='flame'), 3070, materials=2)
add('campfire_1', FLAT, lambda w, h, s: post_thing(w, h, s, post='oak_bark',
                                                   head='y', head_shape='flame'), 3071, materials=2)
add('campfire_2', FLAT, lambda w, h, s: post_thing(w, h, s, post='oak_bark',
                                                   head='y', head_shape='bowl'), 3072, materials=2)
add('brazier',    FLAT, lambda w, h, s: post_thing(w, h, s, post='iron',
                                                   head='y', head_shape='bowl'), 3073, materials=2)
add('lamppost',   TALL, lambda w, h, s: post_thing(w, h, s, post='steel_dark',
                                                   head='y', head_shape='disc',
                                                   head_ramp='gold'), 3074, materials=2)
add('signpost',   FLAT, lambda w, h, s: post_thing(w, h, s, head='y',
                                                   head_shape='board',
                                                   head_ramp='oak_wood'), 3075, materials=2)
add('antenna',    TALL, lambda w, h, s: post_thing(w, h, s, post='iron',
                                                   head='y', head_shape='disc',
                                                   head_ramp='glow_blue'), 3076, materials=2)
add('well',       FLAT, lambda w, h, s: well_prop(w, h, s), 3077, materials=4)

# --- buildings -------------------------------------------------------------
# Six materials: plaster, roof tile, timber, stone footing, glass, brass.
add('village_house', TALL, lambda w, h, s: house(w, h, s), 3080, materials=6)
add('village_hall',  TALL, lambda w, h, s: house(w, h, s, wall='oak_wood',
                                                 roof='dead_plant', trim='dark_bark',
                                                 storeys=1.35, windows=3,
                                                 glass_lit=True), 3081, materials=6)
add('market_stall',  FLAT, lambda w, h, s: stall(w, h, s), 3082, materials=3)

# --- dungeon openings ------------------------------------------------------
add('dungeon_entrance', TALL, lambda w, h, s: opening(w, h, s), 3090, materials=2)
add('dungeon_exit',     FLAT, lambda w, h, s: opening(w, h, s, ladder=True), 3091, materials=3)
add('stairs_down',      FLAT, lambda w, h, s: opening(w, h, s, stairs=True), 3092, materials=3)

# --- effects ---------------------------------------------------------------
for _n, _rp, _kd, _sd in [
    ('hit_spark', 'gold', 'spark', 3100),
    ('leaf_burst', 'leaf', 'scatter', 3101),
    ('stone_chip', 'stone', 'scatter', 3102),
    ('smoke_puff', 'smoke', 'puff', 3103),
    ('water_splash', 'glow_blue', 'splash', 3104),
    ('sleep_z', 'ice', 'zzz', 3105),
]:
    add(_n, FLAT, (lambda rp, kd: (lambda w, h, s: effect(
        w, h, s, ramp_name=rp, kind=kd)))(_rp, _kd), _sd)


def build(out_dir: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, (_size, fn, seed, materials) in PROPS.items():
        w, h = frame_for(name)
        img = outline_rgba(fn(w, h, seed))
        save(img, f'{out_dir}/{name}.png')
        row = report(name, img, seamless=False, budget=11, materials=materials)
        row['size'] = f'{w}x{h}'
        rows.append(row)
    return rows


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/world'
    rows = build(out)
    bad = [r for r in rows if not r['ok']]
    print(f'{len(rows)} props, {len(rows) - len(bad)} ok')
    for r in bad:
        print(f"  FAIL {r['name']:20s} colours={r['colours']} lone={r['lone']}")
