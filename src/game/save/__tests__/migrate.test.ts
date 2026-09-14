import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrate, needsMigration } from '../migrate';
import { CURRENT_VERSION, SaveError, validate } from '../schema';
import { applySave, serialize } from '../serialize';
import type { GameState } from '../../core/types';

/** The real save captured from the pre-overhaul build, before any refactoring. */
const V0_FIXTURE = JSON.parse(readFileSync('docs/fixtures/save-v0.json', 'utf8'));

function emptyState(): GameState {
  return {
    player: {}, resources: new Map(), items: [], animals: [], time: 0,
  } as unknown as GameState;
}

describe('validate', () => {
  it('accepts the real pre-overhaul save', () => {
    expect(() => validate(V0_FIXTURE)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validate('nope')).toThrow(SaveError);
    expect(() => validate(null)).toThrow(SaveError);
  });

  it('names the missing field rather than failing vaguely', () => {
    const broken = { ...V0_FIXTURE };
    delete (broken as Record<string, unknown>).animals;
    expect(() => validate(broken)).toThrow(/missing data/i);
  });

  it('refuses a save from a newer build instead of mangling it', () => {
    expect(() => validate({ version: 99, world: {} })).toThrow(/newer version/i);
  });

  it('rejects a v1 save with no world', () => {
    expect(() => validate({ version: 1 })).toThrow(SaveError);
  });
});

describe('migrate v0 -> current', () => {
  it('reports that the fixture needs migrating', () => {
    expect(needsMigration(validate(V0_FIXTURE))).toBe(true);
  });

  it('produces a save at the current version', () => {
    const out = migrate(validate(V0_FIXTURE));
    expect(out.version).toBe(CURRENT_VERSION);
  });

  it('preserves the world data exactly', () => {
    const out = migrate(validate(V0_FIXTURE));
    expect(out.world.resources).toEqual(V0_FIXTURE.resources);
    expect(out.world.animals).toEqual(V0_FIXTURE.animals);
    expect(out.world.items).toEqual(V0_FIXTURE.items);
    expect(out.world.time).toBe(V0_FIXTURE.time);
    expect(out.world.player.x).toBe(V0_FIXTURE.player.x);
    expect(out.world.player.inventory).toEqual(V0_FIXTURE.player.inventory);
  });

  it('fills in the metadata v0 never stored', () => {
    const out = migrate(validate(V0_FIXTURE));
    expect(typeof out.seed).toBe('number');
    expect(out.playtimeMs).toBe(0);
    expect(out.name).toBeTruthy();
  });

  it('is idempotent: migrating an already-current save changes nothing', () => {
    const once = migrate(validate(V0_FIXTURE));
    const twice = migrate(validate(once));
    expect(twice).toEqual(once);
  });
});

describe('applySave', () => {
  it('loads the pre-overhaul fixture onto live state', () => {
    const state = emptyState();
    applySave(state, V0_FIXTURE);

    expect(state.resources.size).toBe(V0_FIXTURE.resources.length);
    expect(state.animals.length).toBe(V0_FIXTURE.animals.length);
    expect(state.player.x).toBe(V0_FIXTURE.player.x);
  });

  it('backfills equipment for saves that predate it', () => {
    const state = emptyState();
    const noEquipment = JSON.parse(JSON.stringify(V0_FIXTURE));
    delete noEquipment.player.equipment;
    applySave(state, noEquipment);
    expect(state.player.equipment).toEqual({ head: null, torso: null, legs: null, feet: null, back: null });
  });

  it('round-trips through serialize without losing world data', () => {
    const state = emptyState();
    applySave(state, V0_FIXTURE);
    const saved = serialize(state, { name: 'Slot 1', playtimeMs: 1234 });

    const reloaded = emptyState();
    applySave(reloaded, saved);
    expect(reloaded.resources.size).toBe(state.resources.size);
    expect(reloaded.animals).toEqual(state.animals);
    expect(saved.playtimeMs).toBe(1234);
  });

  it('throws a readable error rather than a white screen', () => {
    const state = emptyState();
    expect(() => applySave(state, { garbage: true })).toThrow(SaveError);
  });
});
