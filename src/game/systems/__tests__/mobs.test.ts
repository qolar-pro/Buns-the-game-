import { describe, expect, it } from 'vitest';
import { MOBS, enemyDrops, isNocturnal } from '../mobs';
import type { EnemyKind } from '../../core/types';

const KINDS = Object.keys(MOBS) as EnemyKind[];

describe('MOBS', () => {
  it('gives every kind survivable stats', () => {
    for (const kind of KINDS) {
      const m = MOBS[kind];
      expect(m.health).toBeGreaterThan(0);
      expect(m.damage).toBeGreaterThan(0);
      expect(m.speed).toBeGreaterThanOrEqual(0);
      expect(m.name.length).toBeGreaterThan(0);
    }
  });

  it('keeps every mob slower than a sprinting player', () => {
    // A mob that outruns the player turns every encounter into a forced fight.
    for (const kind of KINDS) expect(MOBS[kind].speed).toBeLessThan(5);
  });

  it('agrees with isNocturnal', () => {
    for (const kind of KINDS) expect(isNocturnal(kind)).toBe(MOBS[kind].nocturnal);
  });
});

describe('enemyDrops', () => {
  it('never rolls an empty stack', () => {
    // A drop of zero is worse than no drop: it spawns a pickup that vanishes.
    for (const kind of KINDS) {
      for (let i = 0; i < 50; i++) {
        for (const drop of enemyDrops(kind)) {
          expect(drop.type).toBeTruthy();
          expect(drop.count).toBeGreaterThan(0);
        }
      }
    }
  });

  it('always yields the Warden its progression drops', () => {
    for (let i = 0; i < 20; i++) {
      const types = enemyDrops('warden').map((d) => d.type);
      expect(types).toContain('signal_core');
      expect(types).toContain('wardens_key');
    }
  });

  it('leaves shades with nothing to pick up', () => {
    expect(enemyDrops('static')).toEqual([]);
  });
});
