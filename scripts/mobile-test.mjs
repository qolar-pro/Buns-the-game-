#!/usr/bin/env node
/**
 * mobile-test.mjs — verify the game is actually playable on a phone.
 *
 * Emulates a mid-range Android in landscape, drives the virtual stick with real
 * touch events, and checks the player moves and can harvest. The brief's target
 * is a locked 60fps on mid-range hardware, so this also measures frame time
 * under CPU throttling rather than assuming.
 */
import { chromium, devices } from 'playwright-core';

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

// Pixel-5-ish, landscape.
const context = await browser.newContext({
  ...devices['Pixel 5 landscape'],
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 });
await wait(1200);

await page.getByText('Create World', { exact: true }).tap();
await wait(6500);

check('touch layer appears', await page.getByLabel('Movement stick').isVisible());
check('action button appears', await page.getByLabel('Use or harvest').isVisible());
check('hotbar fits the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// Drive the stick and assert on the player's actual position. Comparing
// screenshots is not enough: animation changes the frame every tick, so that
// check passed even when the touch layer was writing to a key set the engine
// never read.
const playerX = () =>
  page.evaluate(() => (window.__buns ? window.__buns.state.player.x : null));

const stick = await page.getByLabel('Movement stick').boundingBox();
const xBefore = await playerX();
await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
await page.mouse.down();
await page.mouse.move(stick.x + stick.width, stick.y + stick.height / 2, { steps: 8 });
await wait(1500);
await page.mouse.up();
await wait(400);
const xAfter = await playerX();
check(
  'virtual stick moves the player',
  xBefore !== null && xAfter !== null && Math.abs(xAfter - xBefore) > 20,
  xBefore === null ? 'no engine handle (production build?)' : `x ${Math.round(xBefore)} -> ${Math.round(xAfter)}`,
);

// The action button must actually harvest. Desktop picks a target by hovering;
// touch has no hover, so before the nearest-target fix this button did nothing
// at all — and no test noticed, because it only checked for thrown errors.
const errsBefore = errors.length;
await page.evaluate(() => {
  // Stand next to something gatherable bare-handed, so this tests the button
  // and not the tool requirement — a tree correctly refuses without an axe.
  // Nearest rather than first: map iteration order is arbitrary, and on some
  // seeds the first match was far enough away that the button had nothing to
  // act on, which failed as though touch input were broken.
  const s = window.__buns?.state;
  if (!s) return false;
  let best = null;
  let bestDist = Infinity;
  for (const [, list] of s.resources) {
    for (const r of list) {
      if (r.type !== 'bush' && r.type !== 'branch' && r.type !== 'small_rock') continue;
      const d = Math.hypot(r.x - s.player.x, r.y - s.player.y);
      if (d < bestDist) { best = r; bestDist = d; }
    }
  }
  if (!best) return false;
  s.player.x = best.x - 50;
  s.player.y = best.y - 50;
  return true;
});
await wait(600);
let harvested = 0;
for (let i = 0; i < 30 && harvested === 0; i++) {
  await page.getByLabel('Use or harvest').tap();
  await wait(140);
  harvested = await page.evaluate(() =>
    window.__buns ? window.__buns.state.floatingTexts.length + window.__buns.state.items.length : 0,
  );
}
check(
  'action button harvests',
  harvested > 0 && errors.length === errsBefore,
  `${harvested} drop(s)/label(s), ${errors.length - errsBefore} new error(s)`,
);

// Inventory opens as a full-screen sheet.
await page.getByLabel('Open inventory').tap();
await wait(900);
const invVisible = await page.locator('text=INVENTORY & CRAFTING').isVisible().catch(() => false);
check('inventory sheet opens on touch', invVisible);
const noHOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('inventory does not overflow horizontally', noHOverflow);
await page.getByLabel('Open inventory').tap().catch(() => {});
await wait(600);

// Frame timing under 4x CPU throttling, as a stand-in for mid-range hardware.
const client = await context.newCDPSession(page);
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await wait(600);
const timing = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const frames = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (++n < 120) requestAnimationFrame(tick);
        else {
          frames.sort((a, b) => a - b);
          resolve({
            median: frames[Math.floor(frames.length / 2)],
            p95: frames[Math.floor(frames.length * 0.95)],
          });
        }
      };
      requestAnimationFrame(tick);
    }),
);
await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
check(
  'frame time under 4x CPU throttle',
  timing.median < 20,
  `median ${timing.median.toFixed(1)}ms, p95 ${timing.p95.toFixed(1)}ms (16.7ms = 60fps)`,
);

// Portrait shows the rotate prompt.
await page.setViewportSize({ width: 412, height: 915 });
await wait(900);
check('portrait shows rotate prompt', await page.getByText('Rotate your device').isVisible().catch(() => false));

check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
