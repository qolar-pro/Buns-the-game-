/**
 * Villages have to be findable, stable and worth the walk.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { reseedNoise } from '../../world/noise';
import { biomeAt } from '../../world/biomes';
import { generateVillage, hasVillage, villageId } from '../../world/village';
import { STOCK, offersFor, trade } from '../trade';
import { REQUESTS, handIn, requestsFor } from '../requests';
import { makeState } from './helpers';
import type { GameState, Npc, NpcRole } from '../../core/types';

/** How many chunks in a square of this size carry a village. */
function villageCount(half = 30): number {
  let n = 0;
  for (let cx = -half; cx <= half; cx++) {
    for (let cy = -half; cy <= half; cy++) if (hasVillage(cx, cy)) n += 1;
  }
  return n;
}

function firstVillage(half = 30): { cx: number; cy: number } {
  for (let r = 2; r <= half; r++) {
    for (let cx = -r; cx <= r; cx++) {
      for (let cy = -r; cy <= r; cy++) {
        if (Math.max(Math.abs(cx), Math.abs(cy)) !== r) continue;
        if (hasVillage(cx, cy)) return { cx, cy };
      }
    }
  }
  throw new Error('no village generated anywhere');
}

describe('hasVillage', () => {
  beforeEach(() => reseedNoise(42));

  it('puts villages on the map without crowding it', () => {
    const total = (61 * 61);
    const n = villageCount();
    expect(n).toBeGreaterThan(5);
    expect(n / total).toBeLessThan(0.08);
  });

  it('leaves the first chunks around spawn empty', () => {
    // The opening minute should be the player alone with the trees.
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) expect(hasVillage(cx, cy)).toBe(false);
    }
  });

  it('never builds in the fen', () => {
    for (let cx = -30; cx <= 30; cx++) {
      for (let cy = -30; cy <= 30; cy++) {
        if (hasVillage(cx, cy)) expect(biomeAt(cx, cy)).not.toBe('swamp');
      }
    }
  });

  it('puts one within reach of spawn', () => {
    const { cx, cy } = firstVillage();
    expect(Math.hypot(cx, cy)).toBeLessThan(18);
  });

  it('still generates villages on other seeds', () => {
    for (const seed of [1, 7, 1337]) {
      reseedNoise(seed);
      expect(villageCount(25), `no villages on seed ${seed}`).toBeGreaterThan(2);
    }
  });
});

describe('generateVillage', () => {
  beforeEach(() => reseedNoise(42));

  it('is identical every visit', () => {
    const { cx, cy } = firstVillage();
    const a = generateVillage(cx, cy);
    const b = generateVillage(cx, cy);
    expect(b.buildings.map((x) => x.id)).toEqual(a.buildings.map((x) => x.id));
    expect(b.residents.map((x) => x.id)).toEqual(a.residents.map((x) => x.id));
    expect(b.buildings.map((x) => x.x)).toEqual(a.buildings.map((x) => x.x));
  });

  it('always has a hall and a well', () => {
    const { cx, cy } = firstVillage();
    const types = generateVillage(cx, cy).buildings.map((b) => b.type);
    expect(types).toContain('village_hall');
    expect(types).toContain('well');
  });

  it('is inhabited, with someone to trade with and someone to ask', () => {
    const { cx, cy } = firstVillage();
    const roles = generateVillage(cx, cy).residents.map((r) => r.role);
    expect(roles).toContain('trader');
    expect(roles).toContain('elder');
  });

  it('gives every building a home in its own chunk', () => {
    const { cx, cy } = firstVillage();
    const v = generateVillage(cx, cy);
    for (const b of v.buildings) {
      expect(b.x).toBeGreaterThanOrEqual(cx * 1024 - 128);
      expect(b.x).toBeLessThanOrEqual((cx + 1) * 1024 + 128);
    }
    expect(v.id).toBe(villageId(cx, cy));
  });

  it('does not let a stray axe swing level a house', () => {
    const { cx, cy } = firstVillage();
    for (const b of generateVillage(cx, cy).buildings) {
      expect(b.maxHits).toBeGreaterThan(20);
    }
  });
});

function npcOf(role: NpcRole): Npc {
  return {
    id: 'n1', role, name: 'Test', x: 0, y: 0, homeX: 0, homeY: 0,
    targetX: 0, targetY: 0, state: 'idle', timer: 0, facing: 'down',
    animFrame: 0, isMoving: false, village: 'village:3,3',
  };
}

function stateWith(slots: { type: string; count: number }[]): GameState {
  return makeState(slots as never);
}

describe('trade', () => {
  it('gives every role something to offer', () => {
    for (const role of Object.keys(STOCK) as NpcRole[]) {
      expect(offersFor(npcOf(role)).length).toBeGreaterThan(0);
    }
  });

  it('refuses when the player cannot pay, and takes nothing', () => {
    const s = stateWith([{ type: 'wheat', count: 1 }]);
    expect(trade(s, npcOf('villager'), 'v-bread')).toBe('missing-goods');
    expect(s.player.inventory.filter(Boolean)).toHaveLength(1);
  });

  it('exchanges goods when the player can pay', () => {
    const s = stateWith([{ type: 'wheat', count: 3 }]);
    expect(trade(s, npcOf('villager'), 'v-bread')).toBe('ok');
    const held = s.player.inventory.filter(Boolean).map((i) => i!.type);
    expect(held).toContain('bread');
    expect(held).not.toContain('wheat');
  });

  it('refuses an offer this person does not carry', () => {
    const s = stateWith([{ type: 'wheat', count: 9 }]);
    expect(trade(s, npcOf('trader'), 'v-bread')).toBe('unknown-offer');
  });

  it('never asks for something the game cannot produce', () => {
    // A stock line for an unobtainable item is a line no player ever uses.
    for (const offers of Object.values(STOCK)) {
      for (const offer of offers) {
        expect(offer.give.count).toBeGreaterThan(0);
        expect(offer.get.count).toBeGreaterThan(0);
        expect(offer.give.type).not.toBe(offer.get.type);
      }
    }
  });
});

describe('requests', () => {
  it('offers a stable pair per village', () => {
    const s = stateWith([]);
    const first = requestsFor(s, 'village:4,4').map((r) => r.id);
    const again = requestsFor(s, 'village:4,4').map((r) => r.id);
    expect(again).toEqual(first);
    expect(first).toHaveLength(2);
  });

  it('asks different villages for different things', () => {
    const s = stateWith([]);
    const a = requestsFor(s, 'village:4,4').map((r) => r.key);
    const b = requestsFor(s, 'village:-9,12').map((r) => r.key);
    expect(a).not.toEqual(b);
  });

  it('pays out once and only once', () => {
    const s = stateWith([]);
    const request = requestsFor(s, 'village:4,4')[0];
    s.player.inventory[0] = { type: request.want.type, count: request.want.count };

    expect(handIn(s, 'village:4,4', request.id)).toBe('ok');
    const held = s.player.inventory.filter(Boolean).map((i) => i!.type);
    expect(held).toContain(request.reward.type);

    s.player.inventory[5] = { type: request.want.type, count: request.want.count };
    expect(handIn(s, 'village:4,4', request.id)).toBe('already-done');
  });

  it('refuses a short hand-in without taking the goods', () => {
    const s = stateWith([]);
    const request = requestsFor(s, 'village:4,4')[0];
    s.player.inventory[0] = { type: request.want.type, count: request.want.count - 1 };
    expect(handIn(s, 'village:4,4', request.id)).toBe('missing-goods');
    expect(s.player.inventory[0]!.count).toBe(request.want.count - 1);
  });

  it('never rewards what it asks for', () => {
    for (const r of REQUESTS) {
      expect(r.reward.type).not.toBe(r.want.type);
      expect(r.want.count).toBeGreaterThan(0);
      expect(r.reward.count).toBeGreaterThan(0);
    }
  });
});
