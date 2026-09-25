#!/usr/bin/env python3
"""
Export every colour ramp as JSON, for the tools that are not Python.

The brief generator and the palette exporter are both Node scripts, and both
need the real colours. Re-declaring them there would mean two copies of the
palette that can disagree, which is the whole class of bug this project keeps
finding. So the ramps are exported from the one place that defines them.

The output is committed, so `npm run art:brief` works in a clone without a
Python toolchain.

Run: python3 dump_ramps.py [out.json]
"""
from __future__ import annotations

import json
import os
import sys

import palettes


def main(out_path: str) -> int:
    names = sorted(set(list(palettes.REFERENCE) + list(palettes._DERIVED_SOURCES)))
    out: dict[str, list[str]] = {}
    for name in names:
        rows = palettes.ramp(name)
        out[name] = ['#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)
                     for c in rows]

    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w') as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write('\n')
    total = sum(len(v) for v in out.values())
    print(f'{out_path}  {len(out)} ramps, {total} colours')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'ramps.json'))
