import { describe, expect, it } from 'vitest';
import { BUILD_GRID, PLACEABLE, isPlaceable, placeHeld } from '../building';
import { makeState } from './helpers';
import type { EntityType, GameState, ItemType } from '../../core/types';

/** Records what a placement attempt did, so the assertions can read it. */
function harness(state: GameState, room = true) {
  const placed: { type: EntityType; x: number; y: number }[] = [];
  const removed: ItemType[] = [];
  return {
    placed,
    removed,
    deps: {
      getResourceDimensions: () => ({ w: 62, h: 26 }),
      spawnResource: (type: EntityType, x: number, y: number) => {
        if (!room) return false;
        placed.push({ type, x, y });
        return true;
      },
      removeFromInventory: (type: ItemType) => {
        removed.push(type);
      },
      onPlaced: () => {},
    },
  };
}

function stateHolding(type: ItemType): GameState {
  const s = makeState([{ type, count: 4 }]);
  s.player.selectedSlot = 0;
  s.player.x = 500;
  s.player.y = 500;
  s.player.facing = 'right';
  return s;
}

describe('placeHeld', () => {
  it('refuses items that are not placeable', () => {
    const s = stateHolding('wood');
    const h = harness(s);
    expect(placeHeld(s, h.deps)).toBe(false);
    expect(h.placed).toHaveLength(0);
    expect(h.removed).toHaveLength(0);
  });

  it('consumes exactly one of the held item on success', () => {
    const s = stateHolding('torch');
    const h = harness(s);
    expect(placeHeld(s, h.deps)).toBe(true);
    expect(h.removed).toEqual(['torch']);
  });

  it('leaves the inventory alone when there is no room', () => {
    const s = stateHolding('torch');
    const h = harness(s, false);
    expect(placeHeld(s, h.deps)).toBe(false);
    expect(h.removed).toHaveLength(0);
  });

  it('snaps structural pieces so neighbours line up', () => {
    // Two walls placed from positions inside the same cell must land together,
    // which is the whole point of snapping.
    const a = stateHolding('wall');
    const b = stateHolding('wall');
    b.player.x = a.player.x + 10;
    b.player.y = a.player.y + 10;

    const ha = harness(a);
    const hb = harness(b);
    placeHeld(a, ha.deps);
    placeHeld(b, hb.deps);

    expect(ha.placed[0]).toEqual(hb.placed[0]);
    // And the piece is centred in its cell.
    expect((ha.placed[0].x - (BUILD_GRID - 62) / 2) % BUILD_GRID).toBe(0);
  });

  it('does not snap props, so they land where you aimed', () => {
    const a = stateHolding('torch');
    const b = stateHolding('torch');
    b.player.x = a.player.x + 10;

    const ha = harness(a);
    const hb = harness(b);
    placeHeld(a, ha.deps);
    placeHeld(b, hb.deps);

    expect(hb.placed[0].x - ha.placed[0].x).toBe(10);
  });

  it('places in front of the player, following their facing', () => {
    const up = stateHolding('torch');
    up.player.facing = 'up';
    const down = stateHolding('torch');
    down.player.facing = 'down';

    const hu = harness(up);
    const hd = harness(down);
    placeHeld(up, hu.deps);
    placeHeld(down, hd.deps);

    expect(hu.placed[0].y).toBeLessThan(hd.placed[0].y);
  });
});

describe('PLACEABLE', () => {
  it('agrees with isPlaceable', () => {
    for (const key of Object.keys(PLACEABLE)) {
      expect(isPlaceable(key as ItemType)).toBe(true);
    }
    expect(isPlaceable('wood')).toBe(false);
  });

  it('snaps every structural piece and no prop', () => {
    expect(PLACEABLE.wall?.snap).toBe(true);
    expect(PLACEABLE.floor?.snap).toBe(true);
    expect(PLACEABLE.door?.snap).toBe(true);
    expect(PLACEABLE.torch?.snap).toBe(false);
    expect(PLACEABLE.campfire?.snap).toBe(false);
  });
});
