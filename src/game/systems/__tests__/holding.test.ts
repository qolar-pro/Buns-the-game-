/**
 * Holding and placing.
 *
 * Both replaced a rule that keyed on substrings of the item name — "contains
 * axe" decided how big a thing was drawn — which meant every item added after
 * that rule was written got whichever branch its spelling happened to fall in.
 */
import { describe, expect, it } from 'vitest';
import { GRIPS, gripFor, heldPose } from '../holding';
import { BUILD_GRID, PLACEABLE, ghostTarget, placeHeld } from '../building';
import { CRAFTING_RECIPES } from '../../core/recipes';
import { makeState } from './helpers';
import type { EntityType, GameState, ItemType } from '../../core/types';

const PLAYER_SIZE = 128;
const dims = () => ({ w: 62, h: 26 });

function holding(type: ItemType): GameState {
  const s = makeState([{ type, count: 1 }]);
  s.player.selectedSlot = 0;
  s.player.x = 500;
  s.player.y = 500;
  s.player.facing = 'right';
  return s;
}

describe('gripFor', () => {
  it('gives a lantern a different grip from a sword', () => {
    // The old rule sized by name substring, so a lantern was swung like a
    // sword and a loaf of bread was brandished at 45 degrees.
    expect(gripFor('lantern')).not.toEqual(gripFor('iron_sword'));
    expect(gripFor('bread')).not.toEqual(gripFor('iron_sword'));
  });

  it('gives every sword the same grip, and every axe the same grip', () => {
    const swords: ItemType[] = ['wooden_sword', 'stone_sword', 'iron_sword', 'titanium_sword'];
    for (const s of swords) expect(gripFor(s)).toEqual(GRIPS.blade);
    const axes: ItemType[] = ['wooden_axe', 'stone_axe', 'iron_axe', 'titanium_axe'];
    for (const a of axes) expect(gripFor(a)).toEqual(GRIPS.tool);
  });

  it('carries every placeable low, where the ghost appears', () => {
    for (const type of Object.keys(PLACEABLE) as ItemType[]) {
      if (type === 'sapling' || type === 'wheat_seeds' || type === 'torch') continue;
      expect(gripFor(type).height, `${type} is not carried`).toBeLessThan(0.45);
    }
  });

  it('gives every craftable item a grip', () => {
    for (const recipe of CRAFTING_RECIPES) {
      expect(gripFor(recipe.output), `${recipe.output}`).toBeTruthy();
    }
  });
});

describe('heldPose', () => {
  it('puts the item on the side the player faces', () => {
    const right = heldPose('iron_axe', 'right', 500, 500, PLAYER_SIZE);
    const left = heldPose('iron_axe', 'left', 500, 500, PLAYER_SIZE);
    expect(right.x).toBeGreaterThan(500 + PLAYER_SIZE / 2);
    expect(left.x).toBeLessThan(500 + PLAYER_SIZE / 2);
  });

  it('mirrors left and right about the player', () => {
    const centre = 500 + PLAYER_SIZE / 2;
    const right = heldPose('iron_axe', 'right', 500, 500, PLAYER_SIZE);
    const left = heldPose('iron_axe', 'left', 500, 500, PLAYER_SIZE);
    expect(right.x - centre).toBeCloseTo(centre - left.x, 5);
  });

  it('hides a long tool behind the player when they walk away', () => {
    expect(heldPose('iron_axe', 'up', 500, 500, PLAYER_SIZE).behind).toBe(true);
    // A shield is strapped to the arm and stays in front.
    expect(heldPose('iron_shield', 'up', 500, 500, PLAYER_SIZE).behind).toBe(false);
  });

  it('keeps the item within reach of the body', () => {
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      const pose = heldPose('iron_axe', facing, 500, 500, PLAYER_SIZE);
      const d = Math.hypot(pose.x - (500 + PLAYER_SIZE / 2), pose.y - (500 + PLAYER_SIZE / 2));
      expect(d, facing).toBeLessThan(PLAYER_SIZE);
    }
  });
});

describe('ghostTarget', () => {
  it('shows nothing when the held item cannot be placed', () => {
    expect(ghostTarget(holding('wood'), dims, () => false)).toBeNull();
  });

  it('previews exactly where the piece will land', () => {
    // The preview and the placement must come from the same arithmetic. A
    // preview that is even one cell out is worse than no preview at all.
    const s = holding('wall');
    const ghost = ghostTarget(s, dims, () => false)!;

    const placed: { x: number; y: number }[] = [];
    placeHeld(s, {
      getResourceDimensions: dims,
      spawnResource: (_t: EntityType, x: number, y: number) => {
        placed.push({ x, y });
        return true;
      },
      removeFromInventory: () => {},
      onPlaced: () => {},
    });

    expect(placed).toHaveLength(1);
    expect(placed[0].x).toBeCloseTo(ghost.x, 5);
    expect(placed[0].y).toBeCloseTo(ghost.y, 5);
  });

  it('shows the grid cell for structural pieces and not for props', () => {
    expect(ghostTarget(holding('wall'), dims, () => false)!.snapped).toBe(true);
    expect(ghostTarget(holding('torch'), dims, () => false)!.snapped).toBe(false);
  });

  it('snaps the cell to the build grid', () => {
    const g = ghostTarget(holding('floor'), dims, () => false)!;
    expect(g.cellX % BUILD_GRID).toBe(0);
    expect(g.cellY % BUILD_GRID).toBe(0);
  });

  it('marks the spot blocked when something is already there', () => {
    expect(ghostTarget(holding('wall'), dims, () => true)!.valid).toBe(false);
    expect(ghostTarget(holding('wall'), dims, () => false)!.valid).toBe(true);
  });

  it('follows the player round as they turn', () => {
    const seen = new Set<string>();
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      const s = holding('wall');
      s.player.facing = facing;
      const g = ghostTarget(s, dims, () => false)!;
      seen.add(`${g.cellX},${g.cellY}`);
    }
    expect(seen.size).toBe(4);
  });
});
