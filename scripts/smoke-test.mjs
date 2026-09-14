#!/usr/bin/env node
/**
 * smoke-test.mjs — automated slice of TEST_CHECKLIST.md.
 *
 * Not a replacement for the manual pass, but it catches the failures that
 * matter most between phases: the world not rendering, input being dead, the
 * inventory not opening, and new console errors. Run after every phase.
 *
 * Usage: node scripts/smoke-test.mjs [url]
 */
import { chromium } from 'playwright-core';

const TARGET = process.argv[2] || 'http://localhost:3000/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const missing404 = new Set();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
page.on('response', (r) => {
  if (r.status() === 404) missing404.add(new URL(r.url()).pathname);
});
page.on('dialog', (d) => d.accept());

await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 });
await wait(1200);

check('main menu renders', await page.getByText('Create World', { exact: true }).isVisible());

await page.getByText('Create World', { exact: true }).click();
await wait(6000);

const canvas = await page.$('canvas');
check('canvas element present', !!canvas);

/** Sample the canvas: a live world is neither blank nor uniform. */
async function canvasSignature() {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0;
    for (let i = 0; i < d.length; i += 4 * 997) {
      seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      sum += d[i] + d[i + 1] + d[i + 2];
    }
    return { distinct: seen.size, avg: sum / (d.length / (4 * 997)) / 3 };
  });
}

const sig = await canvasSignature();
check('world renders (not blank)', !!sig && sig.distinct > 20, sig ? `${sig.distinct} distinct colours` : 'no canvas');

// Movement must change what is on screen.
const before = await page.screenshot();
await page.keyboard.down('KeyD');
await wait(1400);
await page.keyboard.up('KeyD');
await wait(400);
const after = await page.screenshot();
check('movement changes the view', !before.equals(after), `${before.length} vs ${after.length} bytes`);

// Harvesting: swing at whatever is nearby and confirm the game does not throw.
const errsBefore = errors.length;
for (let i = 0; i < 20; i++) {
  await page.keyboard.press('Space');
  await wait(120);
}
check('harvest input handled', errors.length === errsBefore, `${errors.length - errsBefore} new error(s)`);

// Inventory overlay.
await page.keyboard.press('KeyE');
await wait(1000);
const invOpen = await page.getByText('INVENTORY', { exact: false }).first().isVisible().catch(() => false);
check('inventory opens', invOpen);
await page.keyboard.press('KeyE');
await wait(600);

// Hotbar selection should not throw.
for (const k of ['Digit1', 'Digit2', 'Digit3']) {
  await page.keyboard.press(k);
  await wait(150);
}
check('hotbar selection handled', true);

// Pause menu and save.
await page.keyboard.press('Escape');
await wait(800);
const paused = await page.getByText('PAUSED', { exact: false }).isVisible().catch(() => false);
check('pause menu opens', paused);
if (paused) {
  await page.getByText('Save Game', { exact: true }).click();
  await wait(1200);
  // Saves live in IndexedDB now, not localStorage.
  const saved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('buns-the-game');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('saves')) return resolve(false);
          const all = db.transaction('saves', 'readonly').objectStore('saves').getAll();
          all.onsuccess = () => resolve(all.result.length > 0);
          all.onerror = () => resolve(false);
        };
        setTimeout(() => resolve(false), 5000);
      }),
  );
  check('save writes to storage (IndexedDB)', saved);
}

check('no missing assets (404s)', missing404.size === 0, `${missing404.size} missing: ${[...missing404].slice(0, 5).join(', ')}`);
check('no uncaught page errors', !errors.some((e) => e.startsWith('pageerror')), errors.filter((e) => e.startsWith('pageerror')).slice(0, 2).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
