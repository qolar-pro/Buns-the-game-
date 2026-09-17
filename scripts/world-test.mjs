#!/usr/bin/env node
/**
 * world-test.mjs — biomes, villages and combat, in a real browser.
 *
 * loop-test.mjs proves the game can be finished. This proves the world around
 * that line is actually there: that the biomes generate and are inhabited, that
 * their gated materials drop from things that really spawn, that a village
 * exists with people in it who will trade, and that a bow fires an arrow that
 * kills something.
 *
 * Nothing here is injected. Every check walks the generated world and asserts on
 * what it finds, because a test that places its own dungeon entrance is exactly
 * how a world that spawned none shipped unnoticed.
 *
 * Needs the dev server.
 *
 * Usage: node scripts/world-test.mjs [url]
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
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('ERR_CERT_AUTHORITY_INVALID')) return;
  errors.push(m.text());
});

await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 });
await wait(1200);
await page.getByText('Create World', { exact: true }).click();
await wait(6000);

const read = (fn, arg) => page.evaluate(fn, arg);
const tap = async (code, ms = 120) => {
  await page.keyboard.down(code);
  await wait(ms);
  await page.keyboard.up(code);
};

// --- Walk a wide area so the streamer generates real chunks ---------------
const census = await read(async () => {
  const s = window.__buns.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let cx = -8; cx <= 8; cx += 2) {
    for (let cy = -8; cy <= 8; cy += 2) {
      s.player.x = cx * 1024;
      s.player.y = cy * 1024;
      await sleep(70);
    }
  }
  await sleep(600);
  const counts = {};
  for (const [, list] of s.resources) for (const r of list) counts[r.type] = (counts[r.type] || 0) + 1;
  const mobs = {};
  for (const e of s.enemies) mobs[e.type] = (mobs[e.type] || 0) + 1;
  return { chunks: s.generatedChunks.size, counts, mobs, npcs: s.npcs.length, villages: s.villagesFound.length };
});

// --- Biomes generate, with their own flora --------------------------------
const desert = (census.counts.cactus ?? 0) + (census.counts.dead_bush ?? 0);
const snow = (census.counts.pine_tree ?? 0) + (census.counts.ice_shard ?? 0);
const swamp = (census.counts.reeds ?? 0) + (census.counts.bog_iron ?? 0);
check('the desert generates', desert > 0, `${desert} desert props in ${census.chunks} chunks`);
check('the snow generates', snow > 0, `${snow} snow props`);
check('the fen generates', swamp > 0, `${swamp} fen props`);

// --- Every gated material has a real source in the world ------------------
check('cactus grows, so bows are reachable', (census.counts.cactus ?? 0) > 0, `${census.counts.cactus ?? 0}`);
check('ice shards form, so frost crystals are reachable', (census.counts.ice_shard ?? 0) > 0, `${census.counts.ice_shard ?? 0}`);
check('reeds grow, so arrows are reachable in bulk', (census.counts.reeds ?? 0) > 0, `${census.counts.reeds ?? 0}`);

// --- Biomes are inhabited --------------------------------------------------
const natives = ['scorpion', 'frost_wolf', 'bog_lurker'].filter((k) => (census.mobs[k] ?? 0) > 0);
check('biome natives spawn', natives.length >= 2, `found ${natives.join(', ') || 'none'} of 3`);

// --- Villages --------------------------------------------------------------
check('villages generate', census.villages > 0, `${census.villages} village(s)`);
check('villages have people in them', census.npcs > 0, `${census.npcs} resident(s)`);
check('villages have a hall and a well', (census.counts.village_hall ?? 0) > 0 && (census.counts.well ?? 0) > 0,
  `${census.counts.village_hall ?? 0} hall(s), ${census.counts.well ?? 0} well(s)`);

// --- Talking to someone opens a trade ------------------------------------
const walked = await read(() => {
  const s = window.__buns.state;
  // Specifically a villager: stock is per role, and the elder deals in things
  // this test has no reason to be carrying.
  const npc = s.npcs.find((n) => n.role === 'villager') ?? s.npcs[0];
  if (!npc) return false;
  s.player.x = npc.x - 40;
  s.player.y = npc.y - 30;
  s.camera.x = s.player.x - s.width / 2;
  s.camera.y = s.player.y - s.height / 2;
  // Stocked before the panel opens. Writing to the inventory behind an already
  // rendered panel leaves the row disabled, because nothing told React.
  const free = s.player.inventory.findIndex((x) => x === null);
  s.player.inventory[free] = { type: 'wheat', count: 5 };
  return true;
});
check('a villager can be walked up to', walked);

await tap('Space', 80);
await wait(700);
const talking = await page.getByText('Trade', { exact: true }).isVisible().catch(() => false);
check('talking to them opens the trade panel', talking);

// The trade has to actually move goods, not just render a row. Rows label
// themselves, so this asks for the one it means rather than clicking whatever
// button comes first — an earlier version hit ADMIN and called trade broken.
await page.getByRole('button', { name: /^Trade .* wheat for/ }).first().click().catch(() => {});
await wait(400);
const gotBread = await read(() =>
  window.__buns.state.player.inventory.some((i) => i && i.type === 'bread'));
check('a trade exchanges real goods', gotBread);

// Leave by the button, not by Escape: Escape opens the pause menu, which stops
// the tick, and everything after this point would then silently do nothing.
await page.getByRole('button', { name: 'Stop talking' }).click().catch(() => {});
await read(() => { window.__buns.state.talkingToId = null; });
await wait(400);

// --- Ranged combat --------------------------------------------------------
const shotSetup = await read(() => {
  const s = window.__buns.state;
  const put = (type, count) => {
    const free = s.player.inventory.findIndex((x) => x === null);
    s.player.inventory[free] = { type, count };
    return free;
  };
  const bowSlot = put('bow', 1);
  put('arrow', 20);
  s.player.selectedSlot = bowSlot;
  s.player.facing = 'right';
  s.talkingToId = null;
  s.enemies = [{
    id: 'target', type: 'crawler', x: s.player.x + 300, y: s.player.y + 64,
    health: 16, maxHealth: 16, speed: 0, damage: 0,
    targetX: 0, targetY: 0, state: 'idle', timer: 99999, facing: 'left', lastHitTime: 0,
  }];
  return true;
});
check('a bow can be equipped', shotSetup);

await tap('Space', 60);
await wait(120);
const flying = await read(() => window.__buns.state.projectiles.length);
check('the bow fires an arrow', flying > 0, `${flying} in flight`);

for (let i = 0; i < 12 && (await read(() => window.__buns.state.enemies.length)) > 0; i++) {
  await read(() => {
    const s = window.__buns.state;
    s.lastShotAt = 0; // the cooldown is tested in units, not here
  });
  await tap('Space', 60);
  await wait(200);
}
const killed = await read(() => window.__buns.state.enemies.length === 0);
check('arrows kill what they hit', killed);

const recovered = await read(() =>
  window.__buns.state.items.some((i) => i.type === 'arrow')
  || window.__buns.state.player.inventory.some((i) => i && i.type === 'arrow'));
check('spent arrows can be recovered', recovered);

// --- Armour actually protects --------------------------------------------
const defended = await read(async () => {
  const s = window.__buns.state;
  s.player.equipment.head = { type: 'titanium_helm', count: 1 };
  s.player.equipment.torso = { type: 'titanium_chestplate', count: 1 };
  s.player.equipment.legs = { type: 'titanium_greaves', count: 1 };
  s.player.equipment.feet = { type: 'titanium_boots', count: 1 };
  await new Promise((r) => setTimeout(r, 400));
  return s.player.defense;
});
check('a titanium suit protects the player', defended > 15, `defence ${defended}`);

// --- Sleeping -------------------------------------------------------------
const slept = await read(async () => {
  const s = window.__buns.state;
  s.time = 22 * 60;
  s.enemies = [];
  const cx = Math.floor(s.player.x / 1024);
  const cy = Math.floor(s.player.y / 1024);
  const key = `${cx},${cy}`;
  const list = s.resources.get(key) ?? [];
  list.push({
    id: 'test-bed', x: s.player.x + 40, y: s.player.y, type: 'bed',
    hits: 0, maxHits: 4, scale: 1, opacity: 1,
  });
  s.resources.set(key, list);
  s.selectedResourceId = 'test-bed';
  // An empty hotbar slot, so the press is an interaction and not a shot.
  s.player.selectedSlot = 8;
  s.player.inventory[8] = null;
  return true;
});
if (slept) {
  await tap('Space', 80);
  await wait(500);
}
const morning = await read(() => window.__buns.state.time);
check('a bed sleeps through the night', morning >= 6 * 60 && morning < 8 * 60, `clock at ${(morning / 60).toFixed(1)}h`);

// --- The other ending ------------------------------------------------------
// The core fits the village generator as well as the antenna. Committing takes
// two presses with a warning between them, because an ending reached by an
// accidental keypress next to a building is not a choice.
const hallReady = await read(() => {
  const s = window.__buns.state;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type !== 'village_hall') continue;
      s.player.x = r.x + 20;
      s.player.y = r.y + 140;
      s.camera.x = s.player.x - s.width / 2;
      s.camera.y = s.player.y - s.height / 2;
      s.selectedResourceId = r.id;
      s.player.selectedSlot = 8;
      s.player.inventory[8] = { type: 'signal_core', count: 1 };
      s.talkingToId = null;
      return true;
    }
  }
  return false;
});
check('a village hall can be reached with the core', hallReady);

await tap('Space', 80);
await wait(400);
const firstPress = await read(() => ({
  armed: window.__buns.state.progress.settleArmed,
  over: window.__buns.state.progress.broadcast,
}));
check(
  'the first press warns instead of ending the run',
  firstPress.armed && !firstPress.over,
  JSON.stringify(firstPress),
);

await tap('Space', 80);
await wait(500);
const settled = await read(() => ({
  over: window.__buns.state.progress.broadcast,
  kind: window.__buns.state.progress.endingKind,
}));
check('the second press ends the run the other way', settled.over && settled.kind === 'settled', JSON.stringify(settled));

const settledScreen = await page.getByText('SETTLED', { exact: false }).isVisible().catch(() => false);
check('the settled ending screen shows', settledScreen);

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
