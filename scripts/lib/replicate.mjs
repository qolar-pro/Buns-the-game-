/**
 * Shared Replicate generation core.
 *
 * Used by both the MCP server (scripts/mcp/replicate-asset-server.mjs) and the
 * batch runner (scripts/generate-all.mjs) so there is exactly one implementation
 * of prompt assembly, model adaptation and download.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const API = 'https://api.replicate.com/v1';
export const DEFAULT_MODEL = process.env.REPLICATE_ASSET_MODEL || 'black-forest-labs/flux-schnell';

/**
 * Style bible — prefixed to every prompt so the whole set reads as one game.
 * Deliberately asks for NO shadow: shadows are baked uniformly in post
 * (scripts/process-asset.mjs) so every sprite shares one shadow treatment.
 */
export const STYLE_PREFIX = [
  'top-down three-quarter view video game asset, camera 60 degrees above the horizon',
  'hand-painted chunky stylised game art, bold readable silhouette, minimal fine detail',
  'crisp dark outline around the shape',
  'single warm sunlight from the upper left at 45 degrees, soft ambient fill',
  'warm slightly saturated daylight colours',
  'NO shadow on the ground, no cast shadow, no reflection',
  'isolated on a completely flat uniform solid magenta chroma key background',
  'no scenery, no horizon, no ground plane, no text, no watermark, no border',
].join(', ');

export const CATEGORY_HINTS = {
  terrain:
    'seamless repeating tileable texture filling the entire frame edge to edge, uniform density, ' +
    'no single focal object, no vignette, no border, flat overhead view',
  detail: 'one small ground detail object, centred, tiny, seen from above at a slight angle',
  prop: 'one single object standing upright, centred, full object visible, anchored at the bottom centre',
  item:
    'a single video game inventory item icon, centred, floating, filling most of the frame, ' +
    'uniform visual weight, instantly readable when shrunk to 32 pixels',
  character:
    'character sprite sheet contact grid, exactly 3 columns and 4 rows of poses, ' +
    'identical scale and identical style in every cell, evenly spaced grid, full body visible in each cell',
  effect: 'a single bright particle effect burst, punchy and graphic, no object, no character',
  ui: 'a flat game user interface element, clean geometric edges, crisp vector-like shapes, front-on flat view',
};

const NEGATIVE = [
  'photorealistic', 'photograph', '3d render', 'blurry', 'noisy', 'grainy',
  'text', 'letters', 'watermark', 'signature', 'logo', 'ui frame', 'border',
  'drop shadow', 'cast shadow', 'ground shadow', 'reflection',
  'multiple objects', 'duplicate', 'collage', 'side view', 'front orthographic view',
  'isometric grid', 'perspective floor', 'busy background', 'gradient background',
].join(', ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Global create-rate limiter.
 *
 * Replicate throttles prediction *creation* per account — this account is capped
 * at 6/min — and a 429 wastes the whole call. Rather than retrying into the wall,
 * serialise creates through a minimum spacing. Polling and downloads are not
 * limited, so they still overlap freely across workers.
 */
const CREATE_INTERVAL_MS = Number(process.env.REPLICATE_CREATE_INTERVAL_MS || 11000);
let nextCreateAt = 0;
let gateChain = Promise.resolve();

function createGate() {
  // Chain so concurrent workers queue rather than all reading the same slot.
  const mine = gateChain.then(async () => {
    const waitMs = Math.max(0, nextCreateAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextCreateAt = Date.now() + CREATE_INTERVAL_MS;
  });
  gateChain = mine.catch(() => {});
  return mine;
}

async function replicate(path, init = {}, token) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`Replicate ${res.status}: non-JSON response: ${body.slice(0, 200)}`);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    const err = new Error(`Replicate 429: ${json.detail || 'throttled'}`);
    err.status = 429;
    err.retryAfterMs = retryAfter ? retryAfter * 1000 : CREATE_INTERVAL_MS;
    throw err;
  }
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${json.detail || json.title || body.slice(0, 200)}`);
  return json;
}

/** Run fn, backing off and retrying when the account rate limit bites. */
async function withRetry(fn, attempts = 6) {
  let delay = CREATE_INTERVAL_MS;
  for (let i = 1; ; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err.status !== 429 || i >= attempts) throw err;
      const waitMs = Math.max(err.retryAfterMs || 0, delay);
      await sleep(waitMs);
      delay = Math.min(delay * 2, 60000);
    }
  }
}

// --- model input adaptation -------------------------------------------------
// Models disagree about size and negatives: flux takes `aspect_ratio` and has no
// `negative_prompt`; SDXL takes `width`/`height` and does. Read the model's own
// schema and send only what it declares, rather than a table that rots.
const schemaCache = new Map();

async function inputSchema(model, token) {
  if (schemaCache.has(model)) return schemaCache.get(model);
  const meta = await replicate(`/models/${model}`, {}, token);
  const props = meta?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties || {};
  schemaCache.set(model, props);
  return props;
}

const FLUX_RATIOS = [
  ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16],
  ['3:2', 3 / 2], ['2:3', 2 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['21:9', 21 / 9], ['9:21', 9 / 21],
];
function nearestRatio(w, h, allowed) {
  const want = w / h;
  const pool = FLUX_RATIOS.filter(([name]) => !allowed || allowed.includes(name));
  if (!pool.length) return '1:1';
  return pool.reduce((best, cur) => (Math.abs(cur[1] - want) < Math.abs(best[1] - want) ? cur : best))[0];
}

async function buildInput(model, token, { prompt, negative, width, height, seed }) {
  const props = await inputSchema(model, token);
  const has = (k) => Object.prototype.hasOwnProperty.call(props, k);
  const pick = (k) => props[k]?.enum || props[k]?.allOf?.[0]?.enum || null;
  const input = {};

  if (has('negative_prompt')) {
    input.prompt = prompt;
    input.negative_prompt = negative;
  } else {
    input.prompt = negative ? `${prompt}. Avoid: ${negative}` : prompt;
  }

  if (has('width') && has('height')) {
    input.width = width;
    input.height = height;
  } else if (has('aspect_ratio')) {
    input.aspect_ratio = nearestRatio(width, height, pick('aspect_ratio'));
    const mp = pick('megapixels');
    if (has('megapixels') && mp && mp.includes('1')) input.megapixels = '1';
  }

  if (has('output_format')) input.output_format = 'png';
  if (has('num_outputs')) input.num_outputs = 1;
  if (has('go_fast')) input.go_fast = true;
  if (seed !== undefined && has('seed')) input.seed = seed;
  return input;
}

async function predict(model, input, token, timeoutMs = 240000) {
  let pred = await withRetry(async () => {
    await createGate();
    return replicate(
      `/models/${model}/predictions`,
      { method: 'POST', headers: { Prefer: 'wait=60' }, body: JSON.stringify({ input }) },
      token,
    );
  });
  const deadline = Date.now() + timeoutMs;
  while (!['succeeded', 'failed', 'canceled'].includes(pred.status)) {
    if (Date.now() > deadline) throw new Error(`prediction ${pred.id} timed out`);
    await sleep(2000);
    pred = await replicate(`/predictions/${pred.id}`, {}, token);
  }
  if (pred.status !== 'succeeded') throw new Error(`prediction ${pred.status}: ${pred.error || 'no detail'}`);
  return pred;
}

function firstOutputUrl(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length) return firstOutputUrl(output[0]);
  if (output && typeof output === 'object' && output.url) return output.url;
  throw new Error(`no image URL in output: ${JSON.stringify(output).slice(0, 200)}`);
}

/**
 * Generate one asset and write it to disk. Returns { path, bytes, model, prediction }.
 */
export async function generateAsset({
  id, prompt, category, width = 1024, height = 1024,
  model = DEFAULT_MODEL, outDir, seed, negativeExtra, token = process.env.REPLICATE_API_TOKEN,
}) {
  if (!token) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Put it in .env.local (gitignored) or the environment. ' +
        'Get one at https://replicate.com/account/api-tokens',
    );
  }
  if (!id || !prompt || !category) throw new Error('id, prompt and category are all required');
  if (!CATEGORY_HINTS[category]) {
    throw new Error(`unknown category "${category}"; expected ${Object.keys(CATEGORY_HINTS).join(', ')}`);
  }

  const fullPrompt = `${STYLE_PREFIX}, ${CATEGORY_HINTS[category]}, ${prompt}`;
  const negative = negativeExtra ? `${NEGATIVE}, ${negativeExtra}` : NEGATIVE;
  const input = await buildInput(model, token, { prompt: fullPrompt, negative, width, height, seed });

  const pred = await predict(model, input, token);
  const url = firstOutputUrl(pred.output);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const dir = resolve(outDir || join('assets-src', category));
  await mkdir(dir, { recursive: true });
  const outPath = join(dir, `${id}.png`);
  await writeFile(outPath, bytes);
  return { path: outPath, bytes: bytes.length, model, prediction: pred.id };
}
