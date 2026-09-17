#!/usr/bin/env node
/**
 * loop-test.mjs — walk the whole progression in a real browser.
 *
 * The smoke test proves the game runs. This proves it can be *finished*: down
 * three dungeon levels, loot a chest, kill the Warden, build and restore the
 * antenna, and broadcast. Each step asserts on game state through the dev
 * handle rather than on pixels, so a failure names the step that broke.
 *
 * Needs the dev server (the handle is not exposed in production builds).
 *
 * Usage: node scripts/loop-test.mjs [url]
 */
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] || 'http://localhost:3000/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// The agent proxy's certificate trips one console error per run on an outside
// request; it says nothing about the game, so it is not counted.
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('ERR_CERT_AUTHORITY_INVALID')) return;
  errors.push(m.text());
});

await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 });
await wait(1200);
await page.getByText('Create World', { exact: true }).click();
await wait(6000);

const tap = async (code, ms = 120) => {
  await page.keyboard.down(code);
  await wait(ms);
  await page.keyboard.up(code);
};

/** Put items straight in the pack; this test is about the loop, not the grind. */
const give = (type, count) =>
  page.evaluate(([t, n]) => {
    const s = window.__buns.state;
    const free = s.player.inventory.findIndex((x) => x === null);
    s.player.inventory[free] = { type: t, count: n };
    return free;
  }, [type, count]);

const readState = (fn) => page.evaluate(fn);

check('dev handle available', await readState(() => !!window.__buns));

// --- 1. Quest log names a first objective --------------------------------
const firstQuest = await readState(() => {
  const s = window.__buns.state;
  return s.questsDone.length === 0;
});
check('run starts with nothing completed', firstQuest);

// --- 2. The surface must actually carry what the run needs ------------
// Walking rather than injecting: an earlier version of this test placed its own
// shaft, and so never noticed that the world spawned none at all — no iron, no
// copper, no way underground, no ending.
const census = await page.evaluate(async () => {
  const s = window.__buns.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let cx = -6; cx <= 6; cx += 2) {
    for (let cy = -6; cy <= 6; cy += 2) {
      s.player.x = cx * 1024;
      s.player.y = cy * 1024;
      await sleep(80);
    }
  }
  await sleep(500);
  const counts = {};
  for (const [, list] of s.resources) {
    for (const r of list) counts[r.type] = (counts[r.type] || 0) + 1;
  }
  return { chunks: s.generatedChunks.size, counts };
});
check('the surface spawns iron ore', (census.counts.iron_ore ?? 0) > 0, `${census.counts.iron_ore ?? 0} in ${census.chunks} chunks`);
check('the surface spawns copper ore', (census.counts.copper_ore ?? 0) > 0, `${census.counts.copper_ore ?? 0} in ${census.chunks} chunks`);
check('the surface spawns collapsed shafts', (census.counts.dungeon_entrance ?? 0) > 0, `${census.counts.dungeon_entrance ?? 0} in ${census.chunks} chunks`);

// --- 3. Descend through a shaft the world generated ---------------------
await give('iron_pickaxe', 1);
const foundShaft = await readState(() => {
  const s = window.__buns.state;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type === 'dungeon_entrance') {
        s.player.x = r.x - 40;
        s.player.y = r.y - 40;
        s.selectedResourceId = r.id;
        s.player.selectedSlot = s.player.inventory.findIndex((i) => i && i.type === 'iron_pickaxe');
        return true;
      }
    }
  }
  return false;
});
check('a real shaft can be reached', foundShaft);

for (let i = 0; i < 8; i++) {
  await tap('Space', 60);
  await wait(120);
}
await wait(600);
const depth1 = await readState(() => window.__buns.state.level);
check('entering a shaft lands underground', depth1.kind === 'dungeon' && depth1.depth === 1, JSON.stringify(depth1));

// --- 4. The level is populated and finishable ---------------------------
const level = await readState(() => {
  const s = window.__buns.state;
  let chests = 0, stairs = 0, exits = 0, ore = 0;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type === 'loot_chest') chests += 1;
      if (r.type === 'stairs_down') stairs += 1;
      if (r.type === 'dungeon_exit') exits += 1;
      if (r.type.endsWith('_ore')) ore += 1;
    }
  }
  return { chests, stairs, exits, ore, enemies: s.enemies.length };
});
check('level has chests', level.chests > 0, `${level.chests}`);
check('level has a way down', level.stairs > 0, `${level.stairs}`);
check('level has a way out', level.exits > 0, `${level.exits}`);
check('level has ore in the walls', level.ore > 0, `${level.ore}`);
check('level is inhabited', level.enemies > 0, `${level.enemies} mob(s)`);

// --- 4. Loot a chest -----------------------------------------------------
await readState(() => {
  const s = window.__buns.state;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type === 'loot_chest') {
        s.player.x = r.x - 40;
        s.player.y = r.y - 40;
        s.selectedResourceId = r.id;
        return;
      }
    }
  }
});
for (let i = 0; i < 6; i++) {
  await tap('Space', 60);
  await wait(120);
}
const looted = await readState(() => ({
  chests: window.__buns.state.progress.chestsLooted,
  items: window.__buns.state.items.length,
}));
check('a chest can be looted', looted.chests > 0, `${looted.chests} chest(s), ${looted.items} item(s) on the floor`);

// --- 5. Reach the bottom -------------------------------------------------
for (const depth of [2, 3]) {
  await readState(() => {
    const s = window.__buns.state;
    for (const [, list] of s.resources) {
      for (const r of list) {
        if (r.type === 'stairs_down') {
          s.player.x = r.x - 40;
          s.player.y = r.y - 40;
          s.selectedResourceId = r.id;
          return;
        }
      }
    }
  });
  for (let i = 0; i < 6; i++) {
    await tap('Space', 60);
    await wait(150);
  }
  await wait(400);
  const lvl = await readState(() => window.__buns.state.level);
  check(`stairs lead to depth ${depth}`, lvl.kind === 'dungeon' && lvl.depth === depth, JSON.stringify(lvl));
}

const warden = await readState(() => window.__buns.state.enemies.some((e) => e.type === 'warden'));
check('the Warden guards the bottom', warden);

// --- 6. Kill it ----------------------------------------------------------
await give('relic_blade', 1);
await readState(() => {
  const s = window.__buns.state;
  const w = s.enemies.find((e) => e.type === 'warden');
  s.player.x = w.x - 30;
  s.player.y = w.y - 30;
  s.player.health = 100;
  // Interact prefers a selected resource; clear the stairs left over from the
  // descent so the press lands on the Warden.
  s.selectedResourceId = null;
  s.player.selectedSlot = s.player.inventory.findIndex((i) => i && i.type === 'relic_blade');
});
for (let i = 0; i < 40 && !(await readState(() => window.__buns.state.progress.wardenDefeated)); i++) {
  await readState(() => {
    const s = window.__buns.state;
    s.player.health = 100; // this is a loop test, not a difficulty test
    s.selectedResourceId = null;
    const w = s.enemies.find((e) => e.type === 'warden');
    if (w) { s.player.x = w.x - 30; s.player.y = w.y - 30; }
  });
  await tap('Space', 60);
  await wait(120);
}
const wardenDown = await readState(() => {
  const s = window.__buns.state;
  // A drop counts whether it is still on the floor or already picked up —
  // the pickup radius usually gets to it first.
  return {
    defeated: s.progress.wardenDefeated,
    drops: [
      ...s.items.map((i) => i.type),
      ...s.player.inventory.filter(Boolean).map((i) => i.type),
    ],
  };
});
check('the Warden can be killed', wardenDown.defeated);
check('it drops a signal core', wardenDown.drops.includes('signal_core'), wardenDown.drops.join(','));

// --- 7. Surface, build, broadcast ---------------------------------------
await readState(() => {
  const s = window.__buns.state;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type === 'dungeon_exit') {
        s.player.x = r.x - 40;
        s.player.y = r.y - 40;
        s.selectedResourceId = r.id;
        return;
      }
    }
  }
});

// Climbing out of depth 3 goes up one level at a time.
for (let i = 0; i < 12; i++) {
  await tap('Space', 60);
  await wait(150);
  const lvl = await readState(() => window.__buns.state.level);
  if (lvl.kind === 'surface') break;
  await readState(() => {
    const s = window.__buns.state;
    for (const [, list] of s.resources) {
      for (const r of list) {
        if (r.type === 'dungeon_exit') {
          s.player.x = r.x - 40;
          s.player.y = r.y - 40;
          s.selectedResourceId = r.id;
          return;
        }
      }
    }
  });
}
const surfaced = await readState(() => window.__buns.state.level.kind);
check('the exit leads back to the surface', surfaced === 'surface', surfaced);

await give('antenna', 1);
await give('copper_wiring', 20);
await give('signal_core', 1);
await readState(() => {
  const s = window.__buns.state;
  const cx = Math.floor(s.player.x / 1024);
  const cy = Math.floor(s.player.y / 1024);
  const key = `${cx},${cy}`;
  const list = s.resources.get(key) ?? [];
  list.push({
    id: 'test-antenna', x: s.player.x + 40, y: s.player.y, type: 'antenna',
    hits: 0, maxHits: 99, scale: 1, opacity: 1, antennaProgress: 0,
  });
  s.resources.set(key, list);
  s.selectedResourceId = 'test-antenna';
  s.player.selectedSlot = s.player.inventory.findIndex((i) => i && i.type === 'copper_wiring');
});
for (let i = 0; i < 30; i++) {
  await tap('Space', 50);
  await wait(70);
  const p = await readState(() => {
    const s = window.__buns.state;
    for (const [, list] of s.resources) {
      for (const r of list) if (r.id === 'test-antenna') return r.antennaProgress ?? 0;
    }
    return -1;
  });
  if (p >= 100) break;
}
const restored = await readState(() => {
  const s = window.__buns.state;
  for (const [, list] of s.resources) {
    for (const r of list) if (r.id === 'test-antenna') return r.antennaProgress ?? 0;
  }
  return -1;
});
check('wiring restores the antenna', restored >= 100, `${restored}%`);

await readState(() => {
  const s = window.__buns.state;
  s.selectedResourceId = 'test-antenna';
  s.player.selectedSlot = s.player.inventory.findIndex((i) => i && i.type === 'signal_core');
});
for (let i = 0; i < 10; i++) {
  await tap('Space', 60);
  await wait(150);
  if (await readState(() => window.__buns.state.progress.broadcast)) break;
}
check('installing the core ends the run', await readState(() => window.__buns.state.progress.broadcast));

const endingVisible = await page.getByText('RESCUED', { exact: false }).isVisible().catch(() => false);
check('the ending screen shows', endingVisible);

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
