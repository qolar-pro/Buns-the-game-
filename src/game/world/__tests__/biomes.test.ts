/**
 * The biome map has to be a map, not a curiosity.
 *
 * Every assertion here is about whether a player actually meets these biomes:
 * that each exists at all, that home is the common one, and that the others are
 * a walk away rather than a pilgrimage. The world generator already shipped a
 * "quarry biome" gated above its own noise field's maximum, which fired never
 * and which nothing noticed — thresholds get measured now, not guessed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { reseedNoise } from '../noise';
import { BIOMES, biomeAt, biomeStrength, climateAt } from '../biomes';
import type { Biome } from '../biomes';

/** Share of the map each biome covers, over a wide sample. */
function distribution(half = 40): Record<Biome, number> {
  const counts: Record<string, number> = { grassland: 0, desert: 0, snow: 0, swamp: 0 };
  let n = 0;
  for (let cx = -half; cx <= half; cx++) {
    for (let cy = -half; cy <= half; cy++) {
      counts[biomeAt(cx, cy)] += 1;
      n += 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n])) as Record<Biome, number>;
}

/** Chunks from the origin to the nearest chunk of this biome. */
function nearest(biome: Biome, half = 40): number {
  let best = Infinity;
  for (let cx = -half; cx <= half; cx++) {
    for (let cy = -half; cy <= half; cy++) {
      if (biomeAt(cx, cy) === biome) best = Math.min(best, Math.hypot(cx, cy));
    }
  }
  return best;
}

describe('biomeAt', () => {
  beforeEach(() => reseedNoise(42));

  it('puts every biome on the map', () => {
    const d = distribution();
    for (const biome of BIOMES) {
      expect(d[biome], `${biome} never generates`).toBeGreaterThan(0.05);
    }
  });

  it('keeps grassland the home biome', () => {
    const d = distribution();
    expect(d.grassland).toBeGreaterThan(0.35);
    expect(d.grassland).toBeLessThan(0.6);
  });

  it('puts every biome within a short walk of spawn', () => {
    // A chunk is 1024 units and the player crosses one in about 3.5 seconds, so
    // 12 chunks is roughly a minute of walking. A gated material behind a
    // twenty-minute hike is a material the player never gets.
    for (const biome of BIOMES) {
      expect(nearest(biome), `${biome} is too far from spawn`).toBeLessThan(12);
    }
  });

  it('is deterministic for a seed', () => {
    const first = biomeAt(7, -3);
    reseedNoise(42);
    expect(biomeAt(7, -3)).toBe(first);
  });

  it('gives a different map for a different seed', () => {
    const before = distribution(20);
    reseedNoise(1337);
    const after = distribution(20);
    expect(after).not.toEqual(before);
  });

  it('still covers every biome on other seeds', () => {
    for (const seed of [1, 7, 1337, 99999]) {
      reseedNoise(seed);
      const d = distribution(30);
      for (const biome of BIOMES) {
        expect(d[biome], `${biome} missing on seed ${seed}`).toBeGreaterThan(0.02);
      }
    }
  });
});

describe('climateAt', () => {
  beforeEach(() => reseedNoise(42));

  it('stays in range', () => {
    for (let i = -20; i <= 20; i += 3) {
      const { temp, moisture } = climateAt(i, i * 2);
      expect(temp).toBeGreaterThanOrEqual(0);
      expect(temp).toBeLessThanOrEqual(1);
      expect(moisture).toBeGreaterThanOrEqual(0);
      expect(moisture).toBeLessThanOrEqual(1);
    }
  });
});

describe('biomeStrength', () => {
  beforeEach(() => reseedNoise(42));

  it('is always a usable blend factor', () => {
    for (let cx = -20; cx <= 20; cx += 2) {
      for (let cy = -20; cy <= 20; cy += 2) {
        const s = biomeStrength(cx, cy);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is full strength in grassland, which has no border to fade', () => {
    for (let cx = -20; cx <= 20; cx++) {
      for (let cy = -20; cy <= 20; cy++) {
        if (biomeAt(cx, cy) === 'grassland') expect(biomeStrength(cx, cy)).toBe(1);
      }
    }
  });
});
