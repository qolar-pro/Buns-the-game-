#!/usr/bin/env node
/**
 * audit-assets.mjs — cross-check PNG references in source against files in public/.
 *
 * Scans the source tree for string literals that look like image paths, diffs that
 * set against what actually exists on disk, and reports both directions:
 *   MISSING — referenced by code, absent from public/
 *   UNUSED  — present in public/, referenced by nothing
 *
 * Definition of done for the overhaul: both lists empty.
 * Exit code 1 if either list is non-empty, so this can gate CI.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks', 'src'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

/** Recursively list files under dir, skipping node_modules/.next/.git. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- 1. Collect every image path referenced anywhere in source -------------
// Matches quoted string literals ending in an image extension, e.g. '/tree.png',
// "sprites/world.png", `/rock${n}.png` is handled separately below.
const REF_RE = /['"`]([^'"`\n]*\.(?:png|jpg|jpeg|webp|gif|svg))['"`]/gi;
// Template literals with interpolation, e.g. `/rock${i}.png` — flag for manual review.
const TEMPLATE_RE = /`([^`\n]*\$\{[^`\n]*\}[^`\n]*\.(?:png|jpg|jpeg|webp|gif|svg))`/gi;

const referenced = new Map(); // normalised path -> Set of "file:line"
const dynamic = new Map();    // raw template -> Set of "file:line"

for (const dir of SOURCE_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    if (!SOURCE_EXT.has(extname(file))) continue;
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const where = `${rel}:${i + 1}`;
      for (const m of line.matchAll(TEMPLATE_RE)) {
        if (!dynamic.has(m[1])) dynamic.set(m[1], new Set());
        dynamic.get(m[1]).add(where);
      }
      for (const m of line.matchAll(REF_RE)) {
        const raw = m[1];
        if (raw.includes('${')) continue;      // handled as dynamic
        if (/^(https?:)?\/\//.test(raw)) continue; // remote URL, not our asset
        if (raw.startsWith('data:')) continue;
        const norm = raw.replace(/^\.?\//, '');
        if (!referenced.has(norm)) referenced.set(norm, new Set());
        referenced.get(norm).add(where);
      }
    });
  }
}

// --- 2. Collect every image actually present in public/ --------------------
const onDisk = new Set(
  walk(PUBLIC_DIR)
    .filter((f) => IMAGE_EXT.has(extname(f)))
    .map((f) => relative(PUBLIC_DIR, f)),
);

// --- 3. Expand dynamic references against what is on disk -----------------
// `/rock${n}.png` -> regex ^rock.*\.png$ ; any disk file matching counts as used,
// and the pattern itself is reported so a human can confirm the range is covered.
const dynamicMatched = new Set();
const dynamicPatterns = [];
for (const [tpl, where] of dynamic) {
  const norm = tpl.replace(/^\.?\//, '');
  const re = new RegExp('^' + norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\\\{[^}]*\\\}/g, '.*') + '$');
  const hits = [...onDisk].filter((f) => re.test(f));
  hits.forEach((h) => dynamicMatched.add(h));
  dynamicPatterns.push({ tpl, where: [...where], hits });
}

// --- 4. Diff ---------------------------------------------------------------
const missing = [...referenced.keys()].filter((r) => !onDisk.has(r)).sort();
const used = new Set([...referenced.keys(), ...dynamicMatched]);
const unused = [...onDisk].filter((f) => !used.has(f)).sort();

// --- 5. Report -------------------------------------------------------------
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

console.log(bold('\n=== ASSET AUDIT ==='));
console.log(`referenced: ${referenced.size} static + ${dynamic.size} dynamic pattern(s)`);
console.log(`on disk:    ${onDisk.size} image(s) in public/\n`);

console.log(bold(`MISSING (referenced but absent) — ${missing.length}`));
if (missing.length === 0) console.log(green('  none'));
for (const m of missing) {
  console.log(`  ${red(m)}`);
  for (const w of [...referenced.get(m)].slice(0, 3)) console.log(`      ${w}`);
}

console.log(bold(`\nUNUSED (on disk but unreferenced) — ${unused.length}`));
if (unused.length === 0) console.log(green('  none'));
for (const u of unused) {
  const bytes = statSync(join(PUBLIC_DIR, u)).size;
  console.log(`  ${yellow(u)}  (${(bytes / 1024).toFixed(0)} KB)`);
}

if (dynamicPatterns.length) {
  console.log(bold('\nDYNAMIC patterns (verify range coverage by hand)'));
  for (const { tpl, where, hits } of dynamicPatterns) {
    console.log(`  ${tpl}  -> ${hits.length} match(es) on disk`);
    where.slice(0, 2).forEach((w) => console.log(`      ${w}`));
  }
}

// --- 6. Stray images outside public/ --------------------------------------
const stray = readdirSync(ROOT)
  .filter((f) => IMAGE_EXT.has(extname(f)))
  .sort();
if (stray.length) {
  console.log(bold('\nSTRAY images at repo root (should not be here)'));
  for (const s of stray) {
    console.log(`  ${yellow(s)}  (${(statSync(join(ROOT, s)).size / 1024).toFixed(0)} KB)`);
  }
}

// --- 7. Payload total ------------------------------------------------------
const total = walk(PUBLIC_DIR)
  .filter((f) => IMAGE_EXT.has(extname(f)))
  .reduce((n, f) => n + statSync(f).size, 0);
console.log(bold(`\nTOTAL art payload in public/: ${(total / 1024 / 1024).toFixed(2)} MB`));
console.log(bold(`Budget: 2.50 MB — ${total / 1024 / 1024 <= 2.5 ? green('PASS') : red('FAIL')}\n`));

process.exit(missing.length > 0 || unused.length > 0 ? 1 : 0);
