/**
 * The manifest has to agree with the art.
 *
 * Two numbers describe every sprite: its size in the atlas, which the packer
 * now writes from the actual image, and its size in the world, which is
 * authored in the manifest. The engine draws the atlas rectangle into the world
 * rectangle, so if their aspect ratios disagree the sprite is stretched — and
 * the collider is derived from that stretched draw, which puts the hitbox
 * somewhere the player can see it is not.
 *
 * None of that is visible to a test of game state, which is how the last art
 * change shipped 35 entities that were never drawn at all.
 */
import { describe, expect, it } from 'vitest';
import { FRAMES } from '../frames';
import { metaFor } from '../manifest';
import { idForEntity } from '../colliders';
import { ENTITY_TYPES } from '../../core/entities';

type Frame = { w: number; h: number };

describe('manifest and atlas agree', () => {
  it('gives every entity a frame', () => {
    const missing = ENTITY_TYPES.filter((t) => !(idForEntity(t) in FRAMES));
    expect(missing, `no atlas frame: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every entity an authored world size', () => {
    const missing = ENTITY_TYPES.filter((t) => {
      const meta = metaFor(idForEntity(t));
      return !meta?.worldSize || meta.worldSize.w <= 0 || meta.worldSize.h <= 0;
    });
    expect(missing, `no world size: ${missing.join(', ')}`).toEqual([]);
  });

  it('never stretches a sprite by more than a fifth', () => {
    const stretched: string[] = [];
    for (const type of ENTITY_TYPES) {
      const id = idForEntity(type);
      const frame = (FRAMES as Record<string, Frame>)[id];
      const meta = metaFor(id);
      if (!frame || !meta?.worldSize) continue;
      const source = frame.w / frame.h;
      const world = meta.worldSize.w / meta.worldSize.h;
      const ratio = Math.max(source / world, world / source);
      if (ratio > 1.2) {
        stretched.push(
          `${type}: atlas ${frame.w}x${frame.h}, world ${meta.worldSize.w}x${meta.worldSize.h}`,
        );
      }
    }
    expect(stretched, `stretched:\n  ${stretched.join('\n  ')}`).toEqual([]);
  });

  it('keeps every anchor inside its sprite', () => {
    const bad: string[] = [];
    for (const type of ENTITY_TYPES) {
      const meta = metaFor(idForEntity(type));
      if (!meta) continue;
      const { x, y } = meta.anchor;
      if (x < 0 || x > 1 || y < 0 || y > 1) bad.push(`${type}: (${x}, ${y})`);
    }
    expect(bad).toEqual([]);
  });
});
