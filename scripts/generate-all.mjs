#!/usr/bin/env node
/**
 * generate-all.mjs — generate every asset in the catalogue via Replicate.
 *
 * Resumable: skips any asset whose raw PNG already exists, so a failed or
 * interrupted run can simply be re-run. Concurrency-limited to stay inside
 * Replicate's rate limits.
 *
 * Usage:
 *   node scripts/generate-all.mjs                 # everything missing
 *   node scripts/generate-all.mjs --only items    # one atlas
 *   node scripts/generate-all.mjs --id tree       # one asset (re-generates)
 *   node scripts/generate-all.mjs --force         # ignore existing files
 *   node scripts/generate-all.mjs --concurrency 6
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';
import { generateAsset, DEFAULT_MODEL } from './lib/replicate.mjs';

// Load .env.local without a dotenv dependency.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const ONLY = flag('only', null);
const ID = flag('id', null);
const FORCE = argv.includes('--force');
const CONCURRENCY = Number(flag('concurrency', 5));
const LOG = 'assets-src/generation.log';

let work = CATALOG;
if (ONLY) work = work.filter((a) => a.atlas === ONLY || a.cat === ONLY);
if (ID) work = work.filter((a) => a.id === ID);

const outPath = (a) => join('assets-src', a.atlas, `${a.id}.png`);
if (!FORCE && !ID) work = work.filter((a) => !existsSync(outPath(a)));

console.log(`model: ${DEFAULT_MODEL}`);
console.log(`generating ${work.length} of ${CATALOG.length} asset(s), concurrency ${CONCURRENCY}\n`);
if (!work.length) {
  console.log('nothing to do — all assets already generated (use --force to regenerate)');
  process.exit(0);
}

await mkdir('assets-src', { recursive: true });

let done = 0;
const failures = [];
const started = Date.now();

async function worker(queue) {
  for (;;) {
    const a = queue.shift();
    if (!a) return;
    const label = `${a.atlas}/${a.id}`;
    try {
      const r = await generateAsset({
        id: a.id,
        prompt: a.prompt,
        category: a.cat,
        width: a.gw,
        height: a.gh,
        outDir: join('assets-src', a.atlas),
      });
      done += 1;
      console.log(`[${done}/${work.length}] ok   ${label.padEnd(28)} ${(r.bytes / 1024).toFixed(0)} KB`);
      appendFileSync(LOG, `ok\t${label}\t${r.prediction}\t${r.model}\n`);
    } catch (err) {
      done += 1;
      failures.push({ label, error: err.message });
      console.log(`[${done}/${work.length}] FAIL ${label.padEnd(28)} ${err.message.slice(0, 90)}`);
      appendFileSync(LOG, `fail\t${label}\t${err.message}\n`);
    }
  }
}

const queue = [...work];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\ndone in ${mins} min — ${work.length - failures.length} ok, ${failures.length} failed`);
for (const f of failures) console.log(`  FAILED ${f.label}: ${f.error.slice(0, 120)}`);
process.exit(failures.length ? 1 : 0);
