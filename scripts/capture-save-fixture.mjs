import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('dialog', d => d.accept());
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await wait(1200);
await p.getByText('Create World', { exact: true }).click();
await wait(6000);
// Play a little so the save is not a pristine initial state: move and harvest.
for (const k of ['KeyW','KeyD','KeyS','KeyA']) { await p.keyboard.down(k); await wait(700); await p.keyboard.up(k); }
for (let i=0;i<12;i++){ await p.keyboard.press('Space'); await wait(160); }
await wait(800);
await p.keyboard.press('Escape');
await wait(900);
await p.getByText('Save Game', { exact: true }).click();
await wait(1500);
const saves = await p.evaluate(() => {
  const out = {};
  for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if (k.startsWith('save_')) out[k] = localStorage.getItem(k); }
  return out;
});
const keys = Object.keys(saves);
console.log('save keys:', keys);
if (!keys.length) { console.log('NO SAVE CREATED'); await b.close(); process.exit(1); }
const blob = saves[keys[0]];
writeFileSync('docs/fixtures/save-v0.json', blob);
const d = JSON.parse(blob);
console.log('top-level keys:', Object.keys(d));
console.log('resources entries:', Array.isArray(d.resources) ? d.resources.length : 'n/a');
console.log('items:', Array.isArray(d.items) ? d.items.length : 'n/a', '| animals:', Array.isArray(d.animals) ? d.animals.length : 'n/a');
console.log('bytes:', blob.length);
await b.close();
