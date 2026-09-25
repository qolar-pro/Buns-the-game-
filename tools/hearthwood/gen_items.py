"""
Items: all 104 inventory icons.

One table, one line per item. Everything is built from the shared builders in
hw/icons.py, so a new item is a row rather than a drawing — and so the whole
inventory reads as one set of objects made by one person out of one world's
materials.

Run: python3 gen_items.py [outdir]
"""
from __future__ import annotations

import os
import sys

from hw.checks import report, save
from hw.core import outline_rgba
from hw.icons import (
    bar_stack, bow_icon, bundle, crate_icon, crossbow_icon, garment, ingot,
    leafy, loaf, mast_icon, meat, nugget, ore_chunk, panel, round_food,
    scroll_icon, tool,
)

# Each entry: id -> (callable taking a seed, seed)
ITEMS: dict[str, tuple] = {}


def add(name: str, fn, seed: int) -> None:
    ITEMS[name] = (fn, seed)


# --- raw materials ---------------------------------------------------------
add('wood',          lambda s: bar_stack('oak_wood', s), 2001)
add('stone',         lambda s: nugget('stone', s), 2002)
add('coal',          lambda s: nugget('coal', s), 2003)
add('stick',         lambda s: bundle('oak_bark', s, strands=3, tie=None), 2004)
add('sand',          lambda s: nugget('sand', s, count=4), 2005)
add('scrap_metal',   lambda s: nugget('iron', s), 2006)
add('leather',       lambda s: garment('fur_brown', 'torso', s), 2007)
add('wool',          lambda s: leafy('fur_white', s), 2008)
add('feather',       lambda s: bundle('smoke', s, strands=2, tie=None), 2009)
add('plant_fiber',   lambda s: bundle('cactus', s, strands=7), 2010)
add('thick_fur',     lambda s: leafy('fur_white', s), 2011)
add('reed_bundle',   lambda s: bundle('reed', s, strands=8), 2012)
add('glow_moss',     lambda s: leafy('glow_green', s), 2013)
add('rope',          lambda s: bundle('dead_plant', s, strands=5), 2014)
add('glass',         lambda s: panel('ice', s, boards=2), 2015)
add('cactus_flesh',  lambda s: round_food('cactus', s), 2016)
add('frost_crystal', lambda s: nugget('ice', s, count=3), 2017)
add('wheat',         lambda s: bundle('wheat', s, strands=9), 2018)
add('wheat_seeds',   lambda s: leafy('wheat', s), 2019)
add('sapling',       lambda s: bundle('grass', s, strands=3, tie=None), 2020)

# --- ores and bars ---------------------------------------------------------
for _name, _rock, _vein, _sd in [
    ('iron_ore', 'stone', 'copper', 2101),
    ('copper_ore', 'stone', 'copper', 2102),
    ('titanium_ore', 'stone', 'titanium', 2103),
    ('bog_iron', 'marsh', 'copper', 2104),
]:
    add(_name, (lambda rk, vn: (lambda s: ore_chunk(rk, vn, s)))(_rock, _vein), _sd)

for _name, _ramp, _sd in [
    ('iron_ingot', 'iron', 2110),
    ('copper_ingot', 'copper', 2111),
    ('titanium_ingot', 'titanium', 2112),
    ('trade_token', 'gold', 2113),
]:
    add(_name, (lambda rp: (lambda s: ingot(rp, s)))(_ramp), _sd)
add('copper_wiring', lambda s: bundle('copper', s, strands=6), 2114)

# --- tools and weapons -----------------------------------------------------
_TIERS = {
    'wooden': 'oak_bark', 'stone': 'stone', 'iron': 'iron', 'titanium': 'titanium',
}
_seed = 2200
for _tier, _mat in _TIERS.items():
    for _kind in ('axe', 'pickaxe', 'sword'):
        _seed += 1
        add(f'{_tier}_{_kind}',
            (lambda k, m: (lambda s: tool(k, m, seed=s)))(_kind, _mat), _seed)

add('prospectors_pick', lambda s: tool('pickaxe', 'gold', seed=s), 2250)
add('relic_blade',      lambda s: tool('sword', 'glow_blue', seed=s), 2251)
add('throwing_knife',   lambda s: tool('knife', 'iron', seed=s), 2252)
add('bow',              lambda s: bow_icon('oak_wood', s), 2253)
add('crossbow',         lambda s: crossbow_icon(s), 2254)
add('arrow',            lambda s: tool('spear', 'stone', 'oak_bark', seed=s), 2255)
add('iron_arrow',       lambda s: tool('spear', 'iron', 'oak_bark', seed=s), 2256)
add('quiver',           lambda s: garment('fur_brown', 'pack', s), 2257)
add('anvil',            lambda s: crate_icon('steel_dark', s, banded='iron'), 2258)

# --- armour ----------------------------------------------------------------
_ARMOUR = [
    ('leather_cap', 'fur_brown', 'head'), ('leather_tunic', 'fur_brown', 'torso'),
    ('leather_pants', 'fur_brown', 'legs'), ('leather_boots', 'fur_brown', 'feet'),
    ('fur_cap', 'fur_white', 'head'), ('fur_coat', 'fur_white', 'torso'),
    ('fur_leggings', 'fur_white', 'legs'), ('fur_boots', 'fur_white', 'feet'),
    ('chainmail_coif', 'iron', 'head'), ('chainmail_hauberk', 'iron', 'torso'),
    ('chainmail_chausses', 'iron', 'legs'), ('iron_boots', 'iron', 'feet'),
    ('titanium_helm', 'titanium', 'head'), ('titanium_chestplate', 'titanium', 'torso'),
    ('titanium_greaves', 'titanium', 'legs'), ('titanium_boots', 'titanium', 'feet'),
    ('wooden_shield', 'oak_wood', 'shield'), ('iron_shield', 'iron', 'shield'),
    ('titanium_shield', 'titanium', 'shield'),
    ('leather_backpack', 'fur_brown', 'pack'),
]
_seed = 2300
for _name, _ramp, _slot in _ARMOUR:
    _seed += 1
    add(_name, (lambda rp, sl: (lambda s: garment(rp, sl, s)))(_ramp, _slot), _seed)

# --- food ------------------------------------------------------------------
_MEATS = [
    ('raw_beef', 'blood', False), ('cooked_beef', 'fur_brown', True),
    ('raw_pork', 'hide_pink', False), ('cooked_pork', 'fur_brown', True),
    ('mutton', 'blood', False), ('cooked_mutton', 'fur_brown', True),
    ('raw_chicken', 'hide_pink', False), ('cooked_chicken', 'wheat', True),
]
_seed = 2400
for _name, _ramp, _cooked in _MEATS:
    _seed += 1
    add(_name, (lambda rp, ck: (lambda s: meat(rp, s, cooked=ck)))(_ramp, _cooked), _seed)

add('egg',      lambda s: round_food('parchment', s, 6.5, 8.0), 2420)
add('bread',    lambda s: loaf('wheat', s), 2421)
add('meat_pie', lambda s: loaf('oak_wood', s, slashes=2), 2422)
add('omelet',   lambda s: loaf('gold', s, slashes=0), 2423)
add('ration',   lambda s: crate_icon('dead_plant', s, banded=None), 2424)
add('bandage',  lambda s: bundle('smoke', s, strands=6, tie='blood'), 2425)

# --- placeables (the item form of a world object) --------------------------
add('workbench', lambda s: crate_icon('oak_wood', s, banded=None), 2500)
add('furnace',   lambda s: crate_icon('stone', s, banded='coal'), 2501)
add('chest',     lambda s: crate_icon('oak_wood', s, banded='iron'), 2502)
add('bed',       lambda s: crate_icon('cloth_red', s, banded='oak_wood'), 2503)
add('campfire',  lambda s: bundle('oak_bark', s, strands=5, tie='flame'), 2504)
add('torch',     lambda s: tool('spear', 'flame', 'oak_bark', seed=s), 2505)
add('torch_bundle', lambda s: bundle('oak_bark', s, strands=6, tie='flame'), 2506)
add('lantern',   lambda s: crate_icon('copper', s, banded='flame'), 2507)
add('fence',     lambda s: panel('oak_bark', s, boards=3), 2508)
add('wall',      lambda s: panel('oak_wood', s, boards=4), 2509)
add('floor',     lambda s: panel('spruce_wood', s, boards=4), 2510)
add('door',      lambda s: panel('oak_bark', s, boards=2), 2511)
add('supply_crate', lambda s: crate_icon('spruce_wood', s, banded='iron'), 2512)

# --- the endgame and uniques ----------------------------------------------
add('antenna',        lambda s: mast_icon(s), 2600)
add('antenna_frame',  lambda s: panel('titanium', s, boards=3), 2601)
add('signal_core',    lambda s: round_food('glow_blue', s, 8.5, 8.5), 2602)
add('power_cell',     lambda s: crate_icon('glow_green', s, banded='steel_dark'), 2603)
add('wardens_key',    lambda s: tool('knife', 'gold', 'gold', seed=s), 2604)
add('survivors_log',  lambda s: scroll_icon(s, seal=None), 2605)
add('village_charter', lambda s: scroll_icon(s, seal='blood'), 2606)


def build(out_dir: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, (fn, seed) in ITEMS.items():
        img = outline_rgba(fn(seed))
        save(img, f'{out_dir}/{name}.png')
        rows.append(report(name, img, seamless=False, budget=16))
    return rows


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/items'
    rows = build(out)
    bad = [r for r in rows if not r['ok']]
    print(f'{len(rows)} items, {len(rows) - len(bad)} ok')
    for r in bad:
        print(f"  FAIL {r['name']:22s} colours={r['colours']} lone={r['lone']}")
