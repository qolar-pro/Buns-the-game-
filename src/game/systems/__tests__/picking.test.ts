/**
 * What is under the pointer.
 *
 * The precise hit test — box, then the sprite's own collider polygon — existed
 * and was used for resources only. Animals had a second copy of it with a
 * different anchor convention, and nothing else in the world could be clicked
 * at all. Overlaps resolved by map iteration order rather than by what was
 * drawn on top.
 */
import { describe, expect, it } from 'vitest';
import { applyPick, pickAt } from '../picking';
import { makeState } from './helpers';
import type { GameState, Resource } from '../../core/types';

const deps = {
  colliders: new Map(),
  getResourceDimensions: () => ({ w: 100, h: 100 }),
  getAnimalSpriteInfo: () => ({ w: 100, h: 100, imgUrl: 'characters/cow' }),
};

function withResource(state: GameState, id: string, x: number, y: number): void {
  const res = {
    id, x, y, type: 'rock', hits: 0, maxHits: 3, scale: 1, opacity: 1,
  } as Resource;
  const key = `${Math.floor(x / 1024)},${Math.floor(y / 1024)}`;
  const list = state.resources.get(key) ?? [];
  list.push(res);
  state.resources.set(key, list);
}

function base(): GameState {
  const s = makeState([]);
  s.player.x = 500;
  s.player.y = 500;
  return s;
}

describe('pickAt', () => {
  it('finds nothing in empty space', () => {
    expect(pickAt(base(), 400, 400, deps)).toBeNull();
  });

  it('finds a resource under the point', () => {
    const s = base();
    withResource(s, 'r1', 520, 520);
    const pick = pickAt(s, 560, 560, deps);
    expect(pick).toMatchObject({ kind: 'resource', id: 'r1' });
  });

  it('misses a point outside the sprite box', () => {
    const s = base();
    withResource(s, 'r1', 520, 520);
    expect(pickAt(s, 900, 900, deps)).toBeNull();
  });

  it('returns the topmost of two overlapping things', () => {
    // Iteration order used to decide this, which meant the thing you clicked
    // was not always the thing you could see.
    const s = base();
    withResource(s, 'behind', 520, 500);
    withResource(s, 'infront', 520, 560);
    expect(pickAt(s, 560, 570, deps)?.id).toBe('infront');
  });

  it('can pick an animal, an npc, an enemy and a dropped item', () => {
    const s = base();
    s.animals = [{ id: 'a1', type: 'cow', x: 560, y: 560 } as never];
    expect(pickAt(s, 560, 520, deps)).toMatchObject({ kind: 'animal', id: 'a1' });

    const n = base();
    n.npcs = [{ id: 'n1', role: 'villager', x: 560, y: 560 } as never];
    expect(pickAt(n, 560, 520, deps)).toMatchObject({ kind: 'npc', id: 'n1' });

    const e = base();
    e.enemies = [{ id: 'e1', type: 'crawler', x: 560, y: 560 } as never];
    expect(pickAt(e, 560, 520, deps)).toMatchObject({ kind: 'enemy', id: 'e1' });

    const i = base();
    i.items = [{ id: 'i1', type: 'wood', x: 560, y: 560 } as never];
    expect(pickAt(i, 560, 560, deps)).toMatchObject({ kind: 'item', id: 'i1' });
  });

  it('refuses anything out of reach', () => {
    const s = base();
    withResource(s, 'far', 3000, 3000);
    expect(pickAt(s, 3050, 3050, deps, 600)).toBeNull();
    expect(pickAt(s, 3050, 3050, deps)).not.toBeNull();
  });
});

describe('applyPick', () => {
  it('writes a resource pick into the selection the game reads', () => {
    const s = base();
    applyPick(s, { kind: 'resource', id: 'r1', distance: 10 });
    expect(s.selectedResourceId).toBe('r1');
    expect(s.selectedAnimalId).toBeNull();
  });

  it('writes an animal pick, and clears the other', () => {
    const s = base();
    s.selectedResourceId = 'stale';
    applyPick(s, { kind: 'animal', id: 'a1', distance: 10 });
    expect(s.selectedAnimalId).toBe('a1');
    expect(s.selectedResourceId).toBeNull();
  });

  it('clears both on a miss', () => {
    const s = base();
    s.selectedResourceId = 'stale';
    s.selectedAnimalId = 'stale';
    applyPick(s, null);
    expect(s.selectedResourceId).toBeNull();
    expect(s.selectedAnimalId).toBeNull();
  });
});

describe('the hit test matches what is drawn', () => {
  it('uses the renderer’s own sizes for mobs, people and items', async () => {
    // This is the bug class that keeps recurring: the same number written down
    // twice, once where it is drawn and once where it is clicked. They drift,
    // and then you can see a thing and cannot click it. Importing the constants
    // rather than copying them is what stops it, and this asserts the import is
    // still what happens.
    const { MOB_SIZE, NPC_SIZE, DEFAULT_MOB_SIZE } = await import('../../render/EntityRenderer');
    const { ITEM_DRAW_SIZE } = await import('../../render/Renderer');

    const s = base();
    s.enemies = [{ id: 'warden', type: 'warden', x: 600, y: 600 } as never];
    const size = MOB_SIZE.warden ?? DEFAULT_MOB_SIZE;
    // Just inside the top of the drawn sprite is a hit; just above it is not.
    expect(pickAt(s, 600, 600 - size + 4, deps)?.id).toBe('warden');
    expect(pickAt(s, 600, 600 - size - 8, deps)).toBeNull();

    const n = base();
    n.npcs = [{ id: 'e1', role: 'elder', x: 600, y: 600 } as never];
    expect(pickAt(n, 600, 600 - NPC_SIZE.elder + 4, deps)?.id).toBe('e1');
    expect(pickAt(n, 600, 600 - NPC_SIZE.elder - 8, deps)).toBeNull();

    const i = base();
    i.items = [{ id: 'i1', type: 'wood', x: 600, y: 600 } as never];
    const half = ITEM_DRAW_SIZE / 2;
    expect(pickAt(i, 600 + half - 2, 600, deps)?.id).toBe('i1');
    expect(pickAt(i, 600 + half + 6, 600, deps)).toBeNull();
  });

  it('gives each mob kind its own hitbox, not one size for all', () => {
    // Before, everything that was not the Warden used 120. A crawler is 90 and
    // a sentinel is 140, so half the bestiary was clickable in the wrong place.
    const sizes = new Set<number>();
    for (const kind of ['crawler', 'husk', 'sentinel', 'warden'] as const) {
      const s = base();
      s.enemies = [{ id: 'x', type: kind, x: 600, y: 600 } as never];
      let top = 600;
      for (let y = 600; y > 300; y -= 2) {
        if (pickAt(s, 600, y, deps)) top = y;
      }
      sizes.add(600 - top);
    }
    expect(sizes.size).toBeGreaterThan(2);
  });
});
