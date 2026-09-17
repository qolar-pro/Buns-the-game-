import { describe, expect, it } from 'vitest';
import { fbm, hash, noise2D, reseedNoise } from '../noise';

/**
 * World generation must be reproducible: the same seed has to rebuild the same
 * world, or saved games drift away from the terrain they were created on.
 */
describe('noise determinism', () => {
  it('produces the same value for the same input within a seed', () => {
    reseedNoise(1234);
    const a = noise2D(12.5, -7.25);
    const b = noise2D(12.5, -7.25);
    expect(a).toBe(b);
  });

  it('reproduces an entire sample grid after reseeding with the same seed', () => {
    const sample = () => {
      const out: number[] = [];
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) out.push(fbm(x * 0.37, y * 0.37, 3));
      }
      return out;
    };

    reseedNoise(2026);
    const first = sample();
    reseedNoise(999);   // move away
    sample();
    reseedNoise(2026);  // and back
    expect(sample()).toEqual(first);
  });

  it('gives different worlds for different seeds', () => {
    reseedNoise(1);
    const a = Array.from({ length: 32 }, (_, i) => fbm(i * 0.5, i * 0.25, 3));
    reseedNoise(2);
    const b = Array.from({ length: 32 }, (_, i) => fbm(i * 0.5, i * 0.25, 3));
    expect(a).not.toEqual(b);
  });

  it('keeps noise2D within its expected range', () => {
    reseedNoise(7);
    for (let i = 0; i < 500; i++) {
      const v = noise2D(i * 0.13, i * -0.29);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('hashes deterministically and varies with position', () => {
    reseedNoise(42);
    expect(hash(3, 4)).toBe(hash(3, 4));
    expect(hash(3, 4)).not.toBe(hash(4, 3));
  });

  it('is unaffected by the order chunks are generated in', () => {
    reseedNoise(555);
    const forward: number[] = [];
    for (let x = 0; x < 16; x++) forward.push(fbm(x, 0, 3));

    reseedNoise(555);
    const backward: number[] = [];
    for (let x = 15; x >= 0; x--) backward.push(fbm(x, 0, 3));
    backward.reverse();

    expect(backward).toEqual(forward);
  });
});
