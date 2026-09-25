#!/usr/bin/env node
/**
 * dump-world-sizes.mjs — export each asset's authored world size as JSON.
 *
 * The texture generator needs to know the shape the game wants a thing to be,
 * so it can draw it at a matching pixel aspect. Without this the two numbers
 * are authored in two places and drift: a torch authored 60x110 in the world
 * and drawn 32x32 in the atlas is a torch squashed to two thirds its height,
 * with a collider to match.
 *
 * Run: node scripts/dump-world-sizes.mjs > tools/hearthwood/world_sizes.json
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('src/game/assets/manifest.ts', 'utf8');

// The helpers all take the world width and height as their first two arguments.
const HELPERS = ['solid', 'pickup', 'decoration', 'icon', 'tile'];
const out = {};

for (const m of src.matchAll(/'([^']+)':\s*(\w+)\(([^)]*)\)/g)) {
  const [, id, helper, args] = m;
  if (!HELPERS.includes(helper)) continue;
  const nums = args.split(',').map((a) => Number(a.trim())).filter((n) => Number.isFinite(n));
  if (helper === 'icon') {
    const size = nums[0] ?? 64;
    out[id] = { w: size, h: size };
  } else if (nums.length >= 2) {
    out[id] = { w: nums[0], h: nums[1] };
  }
}

// Entries written out in full rather than through a helper.
for (const m of src.matchAll(/'([^']+)':\s*\{[^}]*worldSize:\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)/g)) {
  out[m[1]] = { w: Number(m[2]), h: Number(m[3]) };
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
