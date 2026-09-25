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

    # Proportions, as fractions of standing height with y=0 at the sole.
    #
    # These were wrong in a way that is obvious once drawn and invisible in the
    # numbers: the legs were ellipsoids centred at y=0.00 with a vertical
    # radius of 0.16, so **half of each leg was below the ground** and only the
    # top 0.045 of it cleared the torso. The result was a huge egg-shaped body
    # on two stubs, which is exactly how every character in the game read.
    #
    # The figure is now laid out the way a figure is: soles at 0, knees at the
    # quarter, hips at 0.46, shoulders at 0.76, chin at 0.80, crown at 1.0 —
    # about five and a half heads, stylised short rather than anatomical, since
    # a realistic eight-head figure loses its head entirely at sprite size.
    # Shoulders are wider than hips and the waist is drawn in, so the
    # silhouette has a direction: the eye reads a torso, not an egg.
    hip, shoulder, chin = 0.395, 0.685, 0.725

    parts: list[Part] = [
        # Legs first: they sit behind the torso in the draw order by depth.
        # Centred at mid-thigh-to-ankle, not at the floor.
        Part(legs, (-0.082 * b, 0.215, 0.0), (0.060 * b, 0.180, 0.060),
             swing=26, phase=0.0, pivot_y=hip, tone=-1),
        Part(legs, (0.082 * b, 0.215, 0.0), (0.060 * b, 0.180, 0.060),
             swing=26, phase=0.5, pivot_y=hip),

        # Hips, so the legs join something instead of meeting the torso's point.
        Part(legs, (0.0, hip, 0.0), (0.108 * b, 0.052, 0.082 * b), tone=-1),

        # Torso: broad at the shoulders, drawn in at the waist. Two ellipsoids
        # rather than one, because one ellipsoid is an egg however you size it.
        Part(top, (0.0, 0.495, 0.0), (0.100 * b, 0.075, 0.074 * b), tone=-1),
        Part(top, (0.0, 0.610, 0.0), (0.137 * b, 0.092, 0.092 * b)),

        # Arms: shoulder to wrist, hanging beside the chest.
        Part(top, (-0.155 * b, 0.530, 0.0), (0.040 * b, 0.105, 0.040),
             swing=22, phase=0.5, pivot_y=shoulder, tone=-1),
        Part(top, (0.155 * b, 0.530, 0.0), (0.040 * b, 0.105, 0.040),
             swing=22, phase=0.0, pivot_y=shoulder, tone=-1),
        # Hands, so the arms end in something.
        Part(skin, (-0.155 * b, 0.425, 0.0), (0.041, 0.041, 0.041),
             swing=22, phase=0.5, pivot_y=shoulder),
        Part(skin, (0.155 * b, 0.425, 0.0), (0.041, 0.041, 0.041),
             swing=22, phase=0.0, pivot_y=shoulder),

        # Feet. Sitting ON the floor, not through it: centred at their own
        # half-height so the sole lands at y=0 exactly.
        Part(legs, (-0.082 * b, 0.028, -0.030), (0.068 * b, 0.028, 0.086),
             swing=26, phase=0.0, pivot_y=hip, tone=-2),
        Part(legs, (0.082 * b, 0.028, -0.030), (0.068 * b, 0.028, 0.086),
             swing=26, phase=0.5, pivot_y=hip, tone=-2),

        # Neck, so the head is joined to the body rather than balanced on it.
        Part(skin, (0.0, chin - 0.015, 0.0), (0.043, 0.030, 0.043), tone=-1),

        # Head. Slightly taller than wide, which reads as a head rather than a
        # ball once the hat sits on it.
        # A big head: about a quarter of standing height. Anatomically wrong
        # and legible, which is the trade every sprite at this size makes.
        Part(skin, (0.0, 0.855, 0.0), (0.122 * head, 0.128 * head, 0.114 * head),
             tone=1, bob=0.004),
    ]

    # A face, front only. Two dark eyes are the whole difference between a
    # character and a mannequin at this size.
    eye = 0.020 * head
    for side in (-1, 1):
        parts.append(Part('dark_bark', (0.050 * side * head, 0.868, -0.106 * head),
                          (eye, eye * 1.2, eye), tone=-4, bob=0.004,
                          front_only=True))
        # A single lit pixel at the top-left of each eye. It is one pixel and it
        # is the difference between a face that is looking at you and two holes.
        parts.append(Part('parchment', (0.050 * side * head - 0.008, 0.884,
                                        -0.116 * head),
                          (eye * 0.40, eye * 0.40, eye * 0.40), tone=6,
                          bob=0.004, front_only=True))
    # Brow: one darker band above the eyes, which is what stops a round head
    # reading as a balloon.
    parts.append(Part(skin, (0.0, 0.912, -0.096 * head),
                      (0.082 * head, 0.014, 0.030), tone=-2, bob=0.004,
                      front_only=True))

    if hair:
        parts.append(Part(hair, (0.0, 0.942, 0.008),
                          (0.126 * head, 0.062 * head, 0.118 * head), tone=0))
    if hat:
        # Crown then brim: a brim alone reads as a plank balanced on a head.
        parts.append(Part(hat, (0.0, 0.968, 0.0),
                          (0.106 * head, 0.052, 0.100 * head), tone=1))
        # The brim needs real thickness: at one pixel it reads as a wire
        # threaded through the character's head rather than as a hat.
        parts.append(Part(hat, (0.0, 0.928, 0.0),
                          (0.148 * head + hat_wide, 0.026,
                           0.140 * head + hat_wide), tone=2))
    if pack:
        parts.append(Part(pack, (0.0, 0.565, 0.112), (0.100, 0.105, 0.052), tone=-1))
    if staff:
        parts.append(Part(staff, (0.210, 0.480, 0.0), (0.019, 0.400, 0.019), tone=0))

    return CharModel(parts, height=height, tone=tone)


def quadruped(*, coat: str, under: str | None = None, head_ramp: str | None = None,
              length: float = 1.0, stance: float = 1.0, height: float = 1.0,
              snout: float = 0.0, ears: float = 0.0, tail: float = 0.0,
              horns: str | None = None, tone: int = 0,
              leg_len: float = 0.185) -> CharModel:
    """An animal. Diagonal gait: front-left moves with back-right."""
    under = under or coat
    head_ramp = head_ramp or coat
    L = length

    # `leg_len` is the leg's LENGTH, hoof to shoulder — not its half-length.
    #
    # It used to be the ellipsoid's vertical *radius*, with the leg centred at
    # y=0, so half of every leg was underground and the visible part reached
    # only to y=leg_len. The barrel was then placed at 2.1 x leg_len, which is
    # above where the legs stop, and every animal in the game was a body
    # floating over four detached sausages. The same mistake the biped had, and
    # it survived the same way: the numbers look deliberate.
    #
    # Now the leg spans 0..leg_len, the belly sits exactly on top of it, and the
    # rest is measured up from the belly.
    belly = leg_len                     # where the legs end and the body starts
    barrel_ry = 0.098
    spine = belly + barrel_ry           # centre of the barrel
    withers = spine + barrel_ry * 0.55  # where the neck leaves the body

    # The leg runs a little PAST the belly, up into the barrel. An ellipsoid's
    # underside is only at its lowest at dead centre; out at the leg's own x it
    # has already curved up, so a leg that stops exactly at `belly` still leaves
    # daylight between itself and the body. Overlapping hides the join, which is
    # what a haunch does on a real animal.
    leg_top = belly + barrel_ry * 0.85
    half = leg_top / 2

    parts: list[Part] = [
        # Four legs, diagonal pairs in phase. Centred at their own mid-height
        # so the hoof lands on y=0 and the top meets the belly.
        Part(under, (-0.092 * stance, half, 0.128 * L), (0.042, half, 0.042),
             swing=26, phase=0.0, pivot_y=spine, tone=-1),
        Part(under, (0.092 * stance, half, 0.128 * L), (0.042, half, 0.042),
             swing=26, phase=0.5, pivot_y=spine, tone=-1),
        Part(under, (-0.092 * stance, half, -0.128 * L), (0.042, half, 0.042),
             swing=26, phase=0.5, pivot_y=spine, tone=-1),
        Part(under, (0.092 * stance, half, -0.128 * L), (0.042, half, 0.042),
             swing=26, phase=0.0, pivot_y=spine, tone=-1),

        # Barrel body. Deliberately smaller than it wants to be: an ellipsoid
        # sized to a real animal's proportions fills the cell edge to edge and
        # every profile view becomes one featureless oval with feet.
        Part(coat, (0.0, spine, 0.0),
             (0.115, barrel_ry, 0.185 * L), bob=0.004),
        # Neck, one step darker, so the head reads as a separate mass rather
        # than a bulge on the front of the body. Angled up and forward.
        Part(under, (0.0, withers, -0.175 * L),
             (0.058, 0.060, 0.055), tone=-2),
        # Head, pushed well clear of the barrel and toned up.
        Part(head_ramp, (0.0, withers + 0.045, -0.262 * L),
             (0.090, 0.086, 0.086), tone=2, bob=0.006),
        # Eyes, front of the head only.
        Part('dark_bark', (0.048, withers + 0.055, -0.325 * L),
             (0.019, 0.021, 0.019), tone=-4, bob=0.006, front_only=True),
        Part('dark_bark', (-0.048, withers + 0.055, -0.325 * L),
             (0.019, 0.021, 0.019), tone=-4, bob=0.006, front_only=True),
    ]

    if snout:
        parts.append(Part(head_ramp, (0.0, withers + 0.028, -0.340 * L),
                          (0.048, 0.040, 0.055 * snout), tone=3))
    if ears:
        for side in (-1, 1):
            parts.append(Part(head_ramp, (0.070 * side, withers + 0.105, -0.245 * L),
                              (0.032 * ears, 0.045 * ears, 0.022), tone=0, plate=True))
    if horns:
        for side in (-1, 1):
            parts.append(Part(horns, (0.080 * side, withers + 0.118, -0.240 * L),
                              (0.026, 0.038, 0.026), tone=2))
    if tail:
        parts.append(Part(coat, (0.0, withers - 0.010, 0.212 * L),
                          (0.03, 0.042, 0.06 * tail), tone=-1, swing=14,
                          pivot_y=withers))

    return CharModel(parts, height=height, body_bob=0.028, lean=1.2, tone=tone)


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
