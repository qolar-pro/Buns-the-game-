#!/usr/bin/env python3
"""
Build every Hearthwood texture, straight into the game's asset-build directory.

The old pipeline generated painterly images and then processed them — chroma
key, flood fill, trim, outline — because it had to rescue whatever the model
returned. Nothing here needs rescuing: these come out of the generator at the
exact size, with clean alpha and a fixed palette, so they go straight to the
packer.

Run:  python3 build_all.py [assets-build-dir]
"""
from __future__ import annotations

import os
import sys
import time

import gen_characters
import gen_items
import gen_terrain
import gen_ui
import gen_world


def main(root: str) -> int:
    started = time.time()
    plan = [
        ('terrain', gen_terrain.build, f'{root}/terrain'),
        ('world', gen_world.build, f'{root}/world'),
        ('items', gen_items.build, f'{root}/items'),
        ('ui', gen_ui.build, f'{root}/ui'),
        ('characters', gen_characters.build, f'{root}/characters'),
    ]

    total = 0
    failures = []
    for name, build, out in plan:
        os.makedirs(out, exist_ok=True)
        rows = build(out)
        bad = [r for r in rows if not r.get('ok', True)]
        total += len(rows)
        failures.extend((name, r) for r in bad)
        print(f'{name:11s} {len(rows):3d} assets, {len(rows) - len(bad):3d} ok')

    print(f'\n{total} assets in {time.time() - started:.1f}s')
    if failures:
        print(f'{len(failures)} FAILED:')
        for group, r in failures:
            detail = ', '.join(f'{k}={v}' for k, v in r.items()
                               if k in ('colours', 'lone', 'seam', 'mirrored'))
            print(f'  {group}/{r["name"]}: {detail}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '../../assets-build'))
