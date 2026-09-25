"""
The cast.

Each character is ONE model. Its four facings are that model turned about its
vertical axis and its walk frames are its own limbs swinging, so a cow seen
from the left is provably the same cow seen from the front — not a second cow
that happens to look similar.

Two body plans cover everyone:

  biped     — villagers, the player, the husk, the warden. Head, torso, two
              arms, two legs, arms and legs swinging in opposition.
  quadruped — cows, wolves, scorpions. Barrel body, head forward, four legs on
              a diagonal gait.

Anything else is those plans with parts added: a hat, a staff, a tail, a stinger.
"""
from __future__ import annotations

from hw.model import CharModel, Part


def biped(*, skin: str, top: str, legs: str, height: float = 1.0,
          bulk: float = 1.0, head: float = 1.0, hat: str | None = None,
          hat_wide: float = 0.0, pack: str | None = None,
          staff: str | None = None, tone: int = 0,
          hair: str | None = None) -> CharModel:
    """
    A person. Arms and legs swing in opposition; the body bobs twice a stride.

    The model is mirror-symmetric across x on purpose: left and right limbs sit
    at the same depth and are told apart only by their gait phase. An earlier
    version offset them in z so they would not overlap in profile, which made
    the body chiral — and a chiral model seen from the left is not the mirror of
    the same model seen from the right, which is exactly the consistency this
    system exists to guarantee. The limbs separate across the stride anyway.
    """
    b = bulk
    parts: list[Part] = [
        # Legs first: they sit behind the torso in the draw order by depth.
        Part(legs, (-0.10 * b, 0.00, 0.0), (0.065 * b, 0.16, 0.065),
             swing=26, phase=0.0, pivot_y=0.34, tone=-1),
        Part(legs, (0.10 * b, 0.00, 0.0), (0.065 * b, 0.16, 0.065),
             swing=26, phase=0.5, pivot_y=0.34),

        # Torso: taller than wide, and narrower front to back, so the profile
        # view is slimmer than the front view the way a person is.
        Part(top, (0.0, 0.31, 0.0), (0.135 * b, 0.195, 0.095 * b)),
        # Arms.
        Part(top, (-0.145 * b, 0.315, 0.0), (0.042 * b, 0.135, 0.042),
             swing=22, phase=0.5, pivot_y=0.49, tone=-1),
        Part(top, (0.145 * b, 0.315, 0.0), (0.042 * b, 0.135, 0.042),
             swing=22, phase=0.0, pivot_y=0.49, tone=-1),
        # Hands, so the arms end in something.
        Part(skin, (-0.145 * b, 0.185, 0.0), (0.042, 0.042, 0.042),
             swing=22, phase=0.5, pivot_y=0.49),
        Part(skin, (0.145 * b, 0.185, 0.0), (0.042, 0.042, 0.042),
             swing=22, phase=0.0, pivot_y=0.49),

        # Feet, so the legs end in something and the character stands on the
        # ground rather than stopping above it.
        Part(legs, (-0.10 * b, 0.015, -0.025), (0.072 * b, 0.032, 0.085),
             swing=26, phase=0.0, pivot_y=0.34, tone=-2),
        Part(legs, (0.10 * b, 0.015, -0.025), (0.072 * b, 0.032, 0.085),
             swing=26, phase=0.5, pivot_y=0.34, tone=-2),

        # Head. Slightly taller than wide, which reads as a head rather than a
        # ball once the hat sits on it.
        Part(skin, (0.0, 0.60, 0.0), (0.108 * head, 0.115 * head, 0.100 * head),
             tone=1, bob=0.004),
    ]

    # A face, front only. Two dark eyes are the whole difference between a
    # character and a mannequin at this size.
    eye = 0.021 * head
    for side in (-1, 1):
        parts.append(Part('dark_bark', (0.045 * side * head, 0.615, -0.098 * head),
                          (eye, eye * 1.15, eye), tone=-4, bob=0.004,
                          front_only=True))

    if hair:
        parts.append(Part(hair, (0.0, 0.70 * 1.0, 0.01),
                          (0.125 * head, 0.075 * head, 0.115 * head), tone=0))
    if hat:
        # Crown then brim: a brim alone reads as a plank balanced on a head.
        parts.append(Part(hat, (0.0, 0.705, 0.0),
                          (0.092 * head, 0.048, 0.088 * head), tone=1))
        parts.append(Part(hat, (0.0, 0.678, 0.0),
                          (0.125 * head + hat_wide, 0.020,
                           0.118 * head + hat_wide), tone=2))
    if pack:
        parts.append(Part(pack, (0.0, 0.34, 0.135), (0.115, 0.13, 0.06), tone=-1))
    if staff:
        parts.append(Part(staff, (0.21, 0.40, 0.0), (0.022, 0.42, 0.022), tone=0))

    return CharModel(parts, height=0.88 * height, tone=tone)


def quadruped(*, coat: str, under: str | None = None, head_ramp: str | None = None,
              length: float = 1.0, stance: float = 1.0, height: float = 1.0,
              snout: float = 0.0, ears: float = 0.0, tail: float = 0.0,
              horns: str | None = None, tone: int = 0,
              leg_len: float = 0.185) -> CharModel:
    """An animal. Diagonal gait: front-left moves with back-right."""
    under = under or coat
    head_ramp = head_ramp or coat
    L = length
    parts: list[Part] = [
        # Four legs, diagonal pairs in phase.
        Part(under, (-0.095 * stance, 0.0, 0.125 * L), (0.04, leg_len, 0.04),
             swing=26, phase=0.0, pivot_y=leg_len * 2.0, tone=-1),
        Part(under, (0.095 * stance, 0.0, 0.125 * L), (0.04, leg_len, 0.04),
             swing=26, phase=0.5, pivot_y=leg_len * 2.0, tone=-1),
        Part(under, (-0.095 * stance, 0.0, -0.125 * L), (0.04, leg_len, 0.04),
             swing=26, phase=0.5, pivot_y=leg_len * 2.0, tone=-1),
        Part(under, (0.095 * stance, 0.0, -0.125 * L), (0.04, leg_len, 0.04),
             swing=26, phase=0.0, pivot_y=leg_len * 2.0, tone=-1),

        # Barrel body. Deliberately smaller than it wants to be: an ellipsoid
        # sized to a real animal's proportions fills a 32px cell edge to edge
        # and every profile view becomes one featureless oval with feet.
        Part(coat, (0.0, leg_len * 2.1, 0.0),
             (0.115, 0.098, 0.185 * L), bob=0.004),
        # Neck, one step darker, so the head reads as a separate mass rather
        # than a bulge on the front of the body.
        Part(under, (0.0, leg_len * 2.25, -0.175 * L),
             (0.062, 0.062, 0.055), tone=-2),
        # Head, pushed well clear of the barrel and toned up.
        Part(head_ramp, (0.0, leg_len * 2.45, -0.265 * L),
             (0.092, 0.088, 0.088), tone=2, bob=0.006),
        # Eyes, front of the head only.
        Part('dark_bark', (0.048, leg_len * 2.5, -0.33 * L),
             (0.019, 0.021, 0.019), tone=-4, bob=0.006),
        Part('dark_bark', (-0.048, leg_len * 2.5, -0.33 * L),
             (0.019, 0.021, 0.019), tone=-4, bob=0.006),
    ]

    if snout:
        parts.append(Part(head_ramp, (0.0, leg_len * 2.36, -0.345 * L),
                          (0.05, 0.042, 0.055 * snout), tone=3))
    if ears:
        for side in (-1, 1):
            parts.append(Part(head_ramp, (0.072 * side, leg_len * 2.72, -0.25 * L),
                              (0.032 * ears, 0.045 * ears, 0.022), tone=0, plate=True))
    if horns:
        for side in (-1, 1):
            parts.append(Part(horns, (0.082 * side, leg_len * 2.78, -0.245 * L),
                              (0.026, 0.038, 0.026), tone=2))
    if tail:
        parts.append(Part(coat, (0.0, leg_len * 2.25, 0.215 * L),
                          (0.03, 0.042, 0.06 * tail), tone=-1, swing=14,
                          pivot_y=leg_len * 2.25))

    return CharModel(parts, height=0.70 * height, body_bob=0.028, lean=1.2, tone=tone)


#: Everyone in the game, and the sheet width the engine expects for each.
CAST: dict[str, tuple[CharModel, int]] = {
    # The player: a farmer in a wide straw hat, red shirt, blue overalls.
    'player': (biped(skin='skin', top='cloth_red', legs='cloth_blue',
                     hat='wheat', hat_wide=0.055, height=1.0), 8),

    # Livestock.
    'cow':     (quadruped(coat='fur_white', under='fur_brown', head_ramp='fur_white',
                          length=1.15, snout=1.2, ears=1.0, tail=1.0,
                          horns='parchment', height=1.05), 3),
    'pig':     (quadruped(coat='hide_pink', length=0.95, snout=1.5, ears=0.9,
                          tail=0.7, height=0.86, leg_len=0.11), 3),
    'sheep':   (quadruped(coat='fur_white', under='dead_plant', head_ramp='dead_plant',
                          length=0.95, ears=0.8, height=0.9, leg_len=0.12), 3),
    'chicken': (quadruped(coat='fur_white', under='gold', head_ramp='fur_white',
                          length=0.6, stance=0.6, ears=0.0, tail=0.8,
                          height=0.62, leg_len=0.10), 3),

    # Biome natives.
    'scorpion':   (quadruped(coat='gold', under='copper', length=0.9, stance=1.4,
                             height=0.5, leg_len=0.07, tail=1.8), 3),
    'frost_wolf': (quadruped(coat='fur_white', under='fur_white', length=1.2,
                             snout=1.4, ears=1.2, tail=1.4, height=0.92,
                             leg_len=0.15), 3),
    'bog_lurker': (biped(skin='bog', top='moss', legs='bog', bulk=1.25,
                         head=1.1, height=0.92, tone=-1), 3),

    # Villagers: the same body plan, different cloth. A trader is a villager
    # with a pack, an elder is a villager with a staff and grey robes.
    'villager': (biped(skin='skin', top='cloth_green', legs='dark_bark'), 3),
    'trader':   (biped(skin='skin', top='cloth_blue', legs='dark_bark',
                       pack='oak_wood', hat='dark_bark', hat_wide=0.03), 3),
    'elder':    (biped(skin='skin', top='stone', legs='stone',
                       staff='oak_wood', hair='smoke', height=0.96), 3),

    # Hostiles.
    'husk':     (biped(skin='dead_plant', top='marsh', legs='marsh',
                       bulk=0.95, height=1.02, tone=-1), 3),
    'crawler':  (quadruped(coat='dark_bark', under='coal', length=0.85,
                           stance=1.5, height=0.46, leg_len=0.07), 3),
    'sentinel': (biped(skin='stone', top='iron', legs='stone', bulk=1.2,
                       head=0.9, height=1.12), 3),
    'warden':   (biped(skin='steel_dark', top='titanium', legs='steel_dark',
                       bulk=1.5, head=1.05, height=1.3), 3),
}
