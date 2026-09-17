#!/usr/bin/env node
/**
 * capture-screens.mjs — drive the running dev server and capture the six
 * baseline views used for before/after comparison in BUILD_PROGRESS.md.
 *
 * Usage: node scripts/capture-screens.mjs [prefix] [url]
 *   prefix: "before" (default) or "after"
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const PREFIX = process.argv[2] || 'before';
const URL = process.argv[3] || 'http://localhost:3000/';
const OUT = 'docs/screens';
const shot = (page, name) => page.screenshot({ path: `${OUT}/${PREFIX}-${name}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await mkdir(OUT, { recursive: true });
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await wait(1500);
await shot(page, 'menu');
console.log('captured menu');

// Enter the world.
await page.getByText('Create World', { exact: true }).click();
await wait(6000); // world gen + chunk streaming + image loads
await shot(page, 'world');
console.log('captured world');

// Inventory (E) — also the crafting surface.
await page.keyboard.press('KeyE');
await wait(1200);
await shot(page, 'inventory');
console.log('captured inventory');

// The crafting column lives in the same overlay; capture it after a scroll so
// the recipe list is the dominant thing on screen.
await page.mouse.move(640, 400);
await page.mouse.wheel(0, 300);
await wait(800);
await shot(page, 'crafting');
console.log('captured crafting');
await page.keyboard.press('KeyE');
await wait(600);

// Furnace: needs one placed. Best effort — capture whatever the UI shows so the
// before/after pair is at least comparable, and report if it could not be reached.
await shot(page, 'furnace');
console.log('captured furnace (placeholder view — place a furnace by hand for the real one)');

// Night: let the day/night cycle run, or force it if an admin hook exists.
const forced = await page.evaluate(() => {
  const w = window;
  if (w.__gameState?.time !== undefined) { w.__gameState.time = 0.75; return true; }
  return false;
});
await wait(forced ? 1500 : 20000);
await shot(page, 'night');
console.log(`captured night (${forced ? 'forced via __gameState' : 'waited on the cycle'})`);

console.log(`\nconsole errors during capture: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e.slice(0, 160)));

await browser.close();
