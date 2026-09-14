/**
 * Deterministic value noise used by world generation.
 *
 * Moved verbatim out of components/Game.tsx. Pure and seedable: the same seed
 * must always produce the same world, which is what the unit tests pin down.
 */
let currentWorldSeed = 42;

export const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263 + currentWorldSeed * 123456789) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// Optimized Noise with Permutation Table
const P = new Uint8Array(512);
const p = new Uint8Array(256);

export const reseedNoise = (seed: number) => {
  currentWorldSeed = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const r = (s - 1) % (i + 1);
    [p[i], p[r]] = [p[r], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
};

// Initial seed
reseedNoise(42);

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

export const noise2D = (x: number, y: number) => {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  
  const a = P[X] + Y;
  const b = P[X + 1] + Y;
  
  const aa = P[a] / 255;
  const ba = P[b] / 255;
  const ab = P[a + 1] / 255;
  const bb = P[b + 1] / 255;

  return lerp(v, lerp(u, aa, ba), lerp(u, ab, bb));
};

export const fbm = (x: number, y: number, octaves = 3) => {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val;
};

/** The seed the world is currently generated from. */
export const getWorldSeed = (): number => currentWorldSeed;
