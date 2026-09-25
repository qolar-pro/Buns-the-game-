"""
OKLab conversions.

Everything about the Hearthwood look — the hue shift along a ramp, the final
grade, the palette snapping — is a perceptual operation, and doing perceptual
work in sRGB gives muddy mid-tones and hue drift when you lighten. OKLab is
cheap, well behaved, and its `a`/`b` axes are close enough to uniform that a
hue rotation there means what it looks like it means.

Vectorised: every function takes and returns float arrays shaped (..., 3).
"""
from __future__ import annotations

import numpy as np

# Linear sRGB -> LMS, and the LMS -> OKLab matrix (Ottosson).
_M1 = np.array([
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
])
_M2 = np.array([
    [0.2104542553, 0.7936177850, -0.0040720468],
    [1.9779984951, -2.4285922050, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.8086757660],
])
_M1_INV = np.linalg.inv(_M1)
_M2_INV = np.linalg.inv(_M2)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)


def rgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    """rgb in 0..1 sRGB -> OKLab."""
    lin = srgb_to_linear(rgb)
    lms = lin @ _M1.T
    # Cube root, sign-safe: linear values can go slightly negative in wide input.
    lms_ = np.sign(lms) * np.abs(lms) ** (1 / 3)
    return lms_ @ _M2.T


def oklab_to_rgb(lab: np.ndarray) -> np.ndarray:
    """OKLab -> rgb in 0..1 sRGB, clipped."""
    lms_ = np.asarray(lab, dtype=np.float64) @ _M2_INV.T
    lms = lms_ ** 3
    lin = lms @ _M1_INV.T
    return np.clip(linear_to_srgb(lin), 0.0, 1.0)


def lab_to_lch(lab: np.ndarray) -> np.ndarray:
    """OKLab -> (L, chroma, hue in degrees)."""
    lab = np.asarray(lab, dtype=np.float64)
    L = lab[..., 0]
    a = lab[..., 1]
    b = lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a)) % 360.0
    return np.stack([L, C, h], axis=-1)


def lch_to_lab(lch: np.ndarray) -> np.ndarray:
    lch = np.asarray(lch, dtype=np.float64)
    L = lch[..., 0]
    C = lch[..., 1]
    h = np.radians(lch[..., 2])
    return np.stack([L, C * np.cos(h), C * np.sin(h)], axis=-1)


def hex_to_rgb(s: str) -> np.ndarray:
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def rgb_to_hex(rgb) -> str:
    v = np.clip(np.asarray(rgb, dtype=np.float64), 0, 1)
    return '#%02x%02x%02x' % tuple(int(round(x * 255)) for x in v)


def rotate_hue(rgb: np.ndarray, degrees: float) -> np.ndarray:
    """Rotate hue by `degrees` while holding L and chroma."""
    lch = lab_to_lch(rgb_to_oklab(rgb))
    lch[..., 2] = (lch[..., 2] + degrees) % 360.0
    return oklab_to_rgb(lch_to_lab(lch))
