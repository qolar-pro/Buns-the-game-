/**
 * Can every entity in the game actually be painted?
 *
 * This file exists because of the worst bug of the project: `PROP_TYPES` was a
 * hardcoded list of twelve entity types written early on, `isWorldObject` asked
 * only that list, and the draw dispatch had no fallback. Every entity added
 * afterwards — all the dungeon fittings, every biome plant, every village
 * building, the crops, the walls — existed in the world with working colliders,
 * gates and drop tables, and was never drawn. A dungeon was an empty floor.
 *
 * Not one of 149 unit tests or 59 browser checks caught it, because they all
 * assert on game state, and the state was perfectly correct. The only way to
 * catch this class is to ask the question the renderer asks.
 */
import { describe, expect, it } from 'vitest';
import { isWorldObject } from '../PropRenderer';
import { idForEntity } from '../../assets/colliders';
import { FRAMES } from '../../assets/frames';
import { metaFor } from '../../assets/manifest';
import { ENTITY_TYPES } from '../../core/entities';

describe('every entity is drawable', () => {
  it('resolves to a frame the atlas actually contains', () => {
    const missing = ENTITY_TYPES.filter((type) => !(idForEntity(type) in FRAMES));
    expect(missing, `no atlas frame for: ${missing.join(', ')}`).toEqual([]);
  });

  it('is accepted by the renderer', () => {
    // The exact question Renderer.ts asks before drawing a resource. An entity
    // that answers false here is invisible in game, however correct its state.
    const undrawn = ENTITY_TYPES.filter((type) => !isWorldObject(type));
    expect(undrawn, `never painted: ${undrawn.join(', ')}`).toEqual([]);
  });

  it('has an authored world size, so it is not drawn at atlas scale', () => {
    const unsized = ENTITY_TYPES.filter((type) => {
      const meta = metaFor(idForEntity(type));
      return !meta?.worldSize || meta.worldSize.w <= 0;
    });
    expect(unsized, `no authored size: ${unsized.join(', ')}`).toEqual([]);
  });
});
