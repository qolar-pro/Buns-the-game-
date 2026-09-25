"""
Hearthwood colour ramps.

Every material in the game gets exactly one ramp of 7-9 colours, dark to light,
and a texture may use only its own ramp plus at most two accents. That rule is
what makes 248 textures drawn by a script look like one artist drew them: the
constraint is the style.

Two kinds of ramp live here:

  REFERENCE  — the ramps handed to us, used verbatim. They already carry the
               house hue shift, so they are not re-derived; re-deriving them
               would quietly change art that is already signed off.

  DERIVED    — built by `build_ramp` from a handful of source colours, which
               sorts them by OKLab lightness, spreads them over N steps, and
               applies the hue shift. Every new material is made this way, so a
               new material cannot drift off-style by accident.

The hue shift: rotate from about -6 deg at the darkest step to +6 deg at the
lightest. Shadows lean warm red-brown, highlights lean honey. Greys stay grey,
because the rotation is scaled by chroma and a near-neutral colour has almost
none to rotate.
"""
from __future__ import annotations

import numpy as np

from hw.oklab import (
    hex_to_rgb,
    lab_to_lch,
    lch_to_lab,
    oklab_to_rgb,
    rgb_to_hex,
    rgb_to_oklab,
)

# The darkest and lightest the world is allowed to get. No pure black, no pure
# white: both read as holes punched in the art at this palette size.
FLOOR = '#1c120b'
CEIL = '#fff7e6'

#: Hue rotation at the dark and light ends of a ramp, in degrees.
HUE_SHIFT = (-6.0, 6.0)

#: Extra chroma over the source colours. Warmth sells the "cozy" more than hue does.
CHROMA_GAIN = 1.07


# --- reference ramps -------------------------------------------------------
# Given, and used as given.
REFERENCE: dict[str, list[str]] = {
    'oak_wood':   ['#50351f', '#6d4c28', '#8b6432', '#a67c41', '#bc9351', '#cda763', '#dcb978', '#e8cb8f'],
    'spruce_wood':['#2f2015', '#432d1a', '#573b23', '#6a4a2c', '#7c5935', '#8e6941', '#9f794c', '#ae895a'],
    'oak_bark':   ['#2f2216', '#42301e', '#574127', '#6b5031', '#81623c', '#967549', '#aa8858', '#bb9967'],
    'dark_bark':  ['#1c120b', '#27190f', '#342215', '#412a1a', '#4f3421', '#5f3f28', '#6e4b31'],
    'stone':      ['#35312d', '#45403b', '#57514b', '#6a635c', '#7d766e', '#908880', '#a29a90', '#b3aca1', '#c3bdb2'],
    'dirt':       ['#3b2416', '#4d301d', '#5f3d26', '#714b2f', '#855938', '#976944', '#a87a52'],
    'path':       ['#5c4a2c', '#716036', '#867440', '#99864b', '#aa9656', '#baa462', '#c7b16e'],
    'pebble':     ['#5b554f', '#756e67', '#8f8880', '#aaa399'],
    'moss':       ['#33401f', '#435228', '#556633', '#687a3e', '#7c8e4a', '#90a257', '#a2b266'],
    'smoke':      ['#8b8178', '#a89e94', '#c4bab0', '#ddd5cb', '#efe9e1'],
}


def _hue_shift(ramp_rgb: np.ndarray) -> np.ndarray:
    """Rotate hue from HUE_SHIFT[0] at the dark end to HUE_SHIFT[1] at the light end."""
    lch = lab_to_lch(rgb_to_oklab(ramp_rgb))
    n = len(ramp_rgb)
    t = np.linspace(0.0, 1.0, n) if n > 1 else np.zeros(1)
    degrees = HUE_SHIFT[0] + t * (HUE_SHIFT[1] - HUE_SHIFT[0])

    # Scale the rotation by how much chroma there is to rotate. A stone ramp has
    # almost none, so it stays stone; an oak ramp has plenty, so it warms.
    weight = np.clip(lch[..., 1] / 0.06, 0.0, 1.0)
    lch[..., 2] = (lch[..., 2] + degrees * weight) % 360.0
    lch[..., 1] = lch[..., 1] * CHROMA_GAIN
    return oklab_to_rgb(lch_to_lab(lch))


def build_ramp(sources: list[str], steps: int = 8, shift: bool = True) -> list[str]:
    """
    Make a ramp from a few source colours.

    Sorts them by OKLab lightness, resamples to `steps` evenly spaced by
    lightness, then applies the house hue shift. This is how every material that
    is not in REFERENCE gets its colours, so a new material is a list of two or
    three colours rather than an eight-colour design problem.
    """
    rgb = np.array([hex_to_rgb(s) for s in sources])
    lab = rgb_to_oklab(rgb)
    order = np.argsort(lab[:, 0])
    lab = lab[order]

    # Resample along lightness. Interpolating in Lab rather than sRGB is what
    # keeps the mid-steps from going grey and muddy.
    src_t = np.linspace(0.0, 1.0, len(lab))
    dst_t = np.linspace(0.0, 1.0, steps)
    out = np.stack([np.interp(dst_t, src_t, lab[:, i]) for i in range(3)], axis=-1)

    # Clamp to the world's floor and ceiling lightness.
    lo = rgb_to_oklab(hex_to_rgb(FLOOR))[0]
    hi = rgb_to_oklab(hex_to_rgb(CEIL))[0]
    out[:, 0] = np.clip(out[:, 0], lo, hi)

    rgb_out = oklab_to_rgb(out)
    if shift:
        rgb_out = _hue_shift(rgb_out)
    return [rgb_to_hex(c) for c in rgb_out]


# --- derived ramps ---------------------------------------------------------
# Each is a handful of source colours; the shape of the ramp is computed.
_DERIVED_SOURCES: dict[str, tuple[list[str], int]] = {
    # Vegetation. Greens rotate toward yellow-green in the grade, so these start
    # a little cooler than they end up.
    'grass':        (['#2d3d19', '#4a6b2a', '#7fa33f', '#b4cc6a'], 8),
    'leaf':         (['#26361a', '#3f5a28', '#628a3a', '#8fb757'], 8),
    'pine':         (['#1d2e20', '#2c4630', '#3f6242', '#5c8459'], 8),
    'reed':         (['#33421c', '#587433', '#86a748', '#bcd383'], 8),
    'cactus':       (['#24401f', '#3a6431', '#568c46', '#83b968'], 8),
    'wheat':        (['#6b4a1c', '#a87f2c', '#d4ab48', '#f0d68b'], 8),
    'dead_plant':   (['#3a2c1a', '#5a4527', '#7d6339', '#a5874f'], 7),

    # Snow and ice. Near-neutral, so the shift barely touches them.
    'snow':         (['#8f9aa8', '#b9c3cd', '#dde4ec', '#fbfdff'], 8),
    'ice':          (['#2d4a5c', '#4a7c96', '#79b3c9', '#b6e2ee'], 8),

    # Sand and desert rock.
    'sand':         (['#6d5228', '#a3803f', '#c9a75c', '#e8d192'], 8),
    'sandstone':    (['#5e4526', '#8a6a3c', '#b08e58', '#d4b783'], 8),

    # Wet ground and swamp.
    'marsh':        (['#2a2417', '#413823', '#584c31', '#716243'], 7),
    'bog':          (['#22301c', '#354828', '#4c6438', '#68804d'], 7),

    # Metals. Cooler and shorter, as metal wants fewer steps and harder edges.
    'iron':         (['#2b2f36', '#4a525c', '#6e7883', '#9aa4b0', '#c8d0d8'], 6),
    'copper':       (['#3d2013', '#7a3d1d', '#b8642c', '#e09a52'], 6),
    'gold':         (['#4a3208', '#8a6415', '#c79a2c', '#f0d071'], 6),
    'titanium':     (['#1e3038', '#365660', '#598792', '#93c4cd'], 6),
    'steel_dark':   (['#1b1f26', '#33393f', '#4e565e', '#727b85'], 6),

    # Ores: the rock ramp carries them; these are the accent veins.
    'coal':         (['#17161a', '#2a282f', '#3f3c45', '#57535c'], 6),

    # Organic / creature.
    'skin':         (['#6b3f27', '#a4703f', '#d09a63', '#f0cb9a'], 8),
    'cloth_red':    (['#4a1a16', '#7d2c22', '#b04732', '#dd7a56'], 7),
    'cloth_blue':   (['#1c2740', '#2f4268', '#4a6393', '#7b93c0'], 7),
    'cloth_green':  (['#233520', '#3a5432', '#567a46', '#82a96c'], 7),
    'cloth_cream':  (['#6a5636', '#9c855c', '#c6b189', '#eddfc0'], 7),
    'fur_white':    (['#7d7062', '#a89b8b', '#cfc4b5', '#f2ece1'], 8),
    'fur_brown':    (['#332214', '#523720', '#75522f', '#9c7446'], 8),
    'hide_pink':    (['#7a4038', '#ab6155', '#d28c7c', '#efbcaa'], 8),

    # Light and magic.
    'flame':        (['#5e1b06', '#a8420a', '#e0821a', '#ffd166'], 7),
    'glow_green':   (['#1d3a1e', '#2f6b33', '#4fa855', '#a6e6a0'], 6),
    'glow_blue':    (['#13294a', '#22508c', '#3f8bd0', '#a2d8f5'], 6),
    'blood':        (['#3a0f0d', '#6b1d17', '#9c3226', '#c85f45'], 6),

    # Parchment and UI.
    'parchment':    (['#5c4935', '#9b8566', '#dccaa8', '#fff7e6'], 7),
    'walnut':       (['#1c130d', '#3d2e22', '#5c4935', '#8a7050'], 7),
}

DERIVED: dict[str, list[str]] = {
    name: build_ramp(src, steps) for name, (src, steps) in _DERIVED_SOURCES.items()
}

#: Every ramp in the game, by name.
RAMPS: dict[str, list[str]] = {**REFERENCE, **DERIVED}


def ramp(name: str) -> np.ndarray:
    """A ramp as an (n, 3) float array in 0..1 sRGB, dark to light."""
    return np.array([hex_to_rgb(c) for c in RAMPS[name]])


def ramp_hex(name: str) -> list[str]:
    return list(RAMPS[name])


if __name__ == '__main__':
    for name in sorted(RAMPS):
        print(f'{name:14s} {len(RAMPS[name])}  ' + ' '.join(RAMPS[name]))
