/**
 * How the player holds what they are holding.
 *
 * The old draw code had one rule for everything: if the item name contains
 * "axe", "pickaxe" or "sword" it is 100 units, otherwise 50, rotated 45 degrees
 * and nudged by facing. So a lantern was swung like a sword, a shield was held
 * like a torch, and a loaf of bread was brandished at 45 degrees.
 *
 * A grip says three things: how big the thing is in the hand, where the hand is
 * relative to the body, and how it is oriented. Grips are per KIND, not per
 * item, so a new sword inherits the sword grip and nothing has to be drawn.
 */
import type { ItemType } from '../core/types';

export type GripKind =
  | 'tool' | 'blade' | 'bow' | 'shield' | 'lamp' | 'block' | 'food' | 'small';

export interface Grip {
  /** Drawn size in world units. */
  size: number;
  /** Offset from the player's centre, along facing and across it. */
  forward: number;
  side: number;
  /** Height up the body: 0 at the feet, 1 at the head. */
  height: number;
  /** Rotation in radians, applied before the facing flip. */
  angle: number;
  /** Drawn behind the player when they face away. */
  behindWhenUp: boolean;
}

/**
 * One grip per kind of thing.
 *
 * Long tools are held out and angled, so the head is clear of the body and the
 * swing reads. Blades are held closer and steeper. Blocks are carried low in
 * front with both hands, which is also where the placement ghost appears, so
 * the held block and the preview line up. Lamps hang from the hand.
 */
export const GRIPS: Record<GripKind, Grip> = {
  tool:   { size: 74, forward: 26, side: 6, height: 0.52, angle: -0.70, behindWhenUp: true },
  blade:  { size: 66, forward: 22, side: 4, height: 0.56, angle: -0.95, behindWhenUp: true },
  bow:    { size: 70, forward: 20, side: 0, height: 0.54, angle: 0.0, behindWhenUp: true },
  shield: { size: 58, forward: 14, side: -14, height: 0.50, angle: 0.0, behindWhenUp: false },
  lamp:   { size: 44, forward: 18, side: 8, height: 0.38, angle: 0.0, behindWhenUp: true },
  block:  { size: 52, forward: 24, side: 0, height: 0.30, angle: 0.0, behindWhenUp: false },
  food:   { size: 38, forward: 16, side: 6, height: 0.52, angle: 0.0, behindWhenUp: true },
  small:  { size: 34, forward: 16, side: 6, height: 0.50, angle: -0.4, behindWhenUp: true },
};

/** Items whose grip is not implied by their name. */
const EXPLICIT: Partial<Record<ItemType, GripKind>> = {
  bow: 'bow',
  crossbow: 'bow',
  arrow: 'small',
  iron_arrow: 'small',
  lantern: 'lamp',
  torch: 'lamp',
  torch_bundle: 'lamp',
  signal_core: 'lamp',
  power_cell: 'lamp',
  throwing_knife: 'blade',
  relic_blade: 'blade',
  wardens_key: 'small',
  survivors_log: 'small',
  village_charter: 'small',
  trade_token: 'small',
  quiver: 'shield',
  leather_backpack: 'shield',
};

const BLOCKS = new Set<ItemType>([
  'wall', 'floor', 'door', 'anvil', 'workbench', 'chest', 'furnace', 'bed',
  'campfire', 'fence', 'antenna', 'antenna_frame', 'supply_crate',
]);

const FOODS = new Set<ItemType>([
  'bread', 'meat_pie', 'omelet', 'ration', 'egg', 'cactus_flesh',
  'raw_beef', 'cooked_beef', 'raw_pork', 'cooked_pork', 'mutton',
  'cooked_mutton', 'raw_chicken', 'cooked_chicken',
]);

/** Which grip an item uses. */
export function gripFor(type: ItemType): Grip {
  const explicit = EXPLICIT[type];
  if (explicit) return GRIPS[explicit];
  if (BLOCKS.has(type)) return GRIPS.block;
  if (FOODS.has(type)) return GRIPS.food;
  if (type.endsWith('_shield')) return GRIPS.shield;
  if (type.endsWith('_sword')) return GRIPS.blade;
  if (type.endsWith('_axe') || type.endsWith('_pickaxe') || type === 'prospectors_pick') {
    return GRIPS.tool;
  }
  return GRIPS.small;
}

export interface HeldPose {
  /** World position of the item's centre. */
  x: number;
  y: number;
  size: number;
  angle: number;
  /** True when the item should be drawn before the player, not after. */
  behind: boolean;
}

/**
 * Where to draw the held item this frame.
 *
 * `playerX`/`playerY` are the sprite's top-left, matching how the rest of the
 * draw pass talks about the player.
 */
export function heldPose(
  type: ItemType,
  facing: 'left' | 'right' | 'up' | 'down',
  playerX: number,
  playerY: number,
  playerSize: number,
): HeldPose {
  const grip = gripFor(type);
  const cx = playerX + playerSize / 2;
  const feet = playerY + playerSize;
  const y = feet - playerSize * grip.height;

  // `forward` runs along the facing, `side` across it, so one grip serves all
  // four directions without four sets of numbers to keep in step.
  let x = cx;
  let yy = y;
  let angle = grip.angle;

  if (facing === 'right') {
    x = cx + grip.forward;
    yy = y + grip.side * 0.25;
  } else if (facing === 'left') {
    x = cx - grip.forward;
    yy = y + grip.side * 0.25;
    angle = -angle;
  } else if (facing === 'down') {
    x = cx + grip.side;
    yy = y + grip.forward * 0.35;
  } else {
    x = cx - grip.side;
    yy = y - grip.forward * 0.18;
  }

  return {
    x,
    y: yy,
    size: grip.size,
    angle,
    behind: facing === 'up' && grip.behindWhenUp,
  };
}
