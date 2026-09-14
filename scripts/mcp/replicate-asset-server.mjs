#!/usr/bin/env node
/**
 * Replicate MCP server — exposes `generate_game_asset` over stdio JSON-RPC.
 *
 * Zero dependencies: MCP stdio transport is newline-delimited JSON-RPC 2.0,
 * so the protocol is implemented directly rather than pulling in the SDK.
 *
 * Auth: reads REPLICATE_API_TOKEN from the environment. Without it every
 * tools/call returns a clear error instead of failing obscurely.
 *
 * Network: Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1,
 * which .mcp.json sets, along with NODE_EXTRA_CA_CERTS for the agent proxy CA.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

const API = 'https://api.replicate.com/v1';
const TOKEN = process.env.REPLICATE_API_TOKEN;
const DEFAULT_MODEL = process.env.REPLICATE_ASSET_MODEL || 'black-forest-labs/flux-1.1-pro';
const PROTOCOL_VERSION = '2024-11-05';

/** Style bible prefix — baked into every prompt so the whole set reads as one game. */
const STYLE_PREFIX = [
  'top-down 3/4 perspective game asset, camera 60 degrees above horizon',
  'hand-painted chunky stylised art, readable silhouette over fine detail',
  'thin dark ink outline, single warm sun from upper-left at 45 degrees',
  'soft contact shadow baked at the base only',
  'warm slightly saturated daylight palette',
  'centred, tightly framed, plain flat magenta background (#FF00FF), no scenery, no text, no watermark',
].join(', ');

/** Per-category framing hints appended after the subject. */
const CATEGORY_HINTS = {
  terrain: 'seamless tileable texture, edge-to-edge pattern, no single focal object, fills the frame completely',
  item: 'single item icon, centred, floating, uniform visual weight, readable when shrunk to 32 pixels',
  prop: 'single object standing on flat ground, anchored at bottom centre',
  character: 'character sprite sheet, 3 columns by 4 rows grid, one pose per cell, consistent scale across cells',
  effect: 'particle effect on plain background, bright and punchy, no object',
  ui: 'flat user interface element, clean geometric edges, game HUD widget',
};

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}
/** Tool results report failure in-band via isError so the model can react. */
function toolResult(id, text, isError = false) {
  ok(id, { content: [{ type: 'text', text }], isError });
}

// ---------------------------------------------------------------------------
// Replicate REST
// ---------------------------------------------------------------------------
async function replicate(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
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
  if (!res.ok) {
    throw new Error(`Replicate ${res.status}: ${json.detail || json.title || body.slice(0, 200)}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Create a prediction and wait for a terminal state. */
async function predict(model, input, timeoutMs = 180000) {
  // `Prefer: wait` makes Replicate hold the connection for fast models; if it
  // returns early we fall through to polling, so both paths are covered.
  let pred = await replicate(`/models/${model}/predictions`, {
    method: 'POST',
    headers: { Prefer: 'wait=60' },
    body: JSON.stringify({ input }),
  });

  const deadline = Date.now() + timeoutMs;
  while (!['succeeded', 'failed', 'canceled'].includes(pred.status)) {
    if (Date.now() > deadline) throw new Error(`prediction ${pred.id} timed out after ${timeoutMs}ms`);
    await sleep(2000);
    pred = await replicate(`/predictions/${pred.id}`);
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`prediction ${pred.status}: ${pred.error || 'no error detail'}`);
  }
  return pred;
}

/** Replicate returns either a URL string or an array of them. */
function firstOutputUrl(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length) return firstOutputUrl(output[0]);
  if (output && typeof output === 'object' && output.url) return output.url;
  throw new Error(`could not find an image URL in output: ${JSON.stringify(output).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Model input adaptation
// ---------------------------------------------------------------------------
// Models disagree about how to express image size and negatives: flux takes
// `aspect_ratio` and has no `negative_prompt`, SDXL takes `width`/`height` and
// does. Rather than hard-code a table that rots, read the model's own OpenAPI
// schema and send only the parameters it actually declares.
const schemaCache = new Map();

async function inputSchema(model) {
  if (schemaCache.has(model)) return schemaCache.get(model);
  const meta = await replicate(`/models/${model}`);
  const props =
    meta?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties || {};
  schemaCache.set(model, props);
  return props;
}

/** Nearest aspect ratio flux accepts, for a requested pixel size. */
const FLUX_RATIOS = [
  ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16],
  ['3:2', 3 / 2], ['2:3', 2 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['21:9', 21 / 9], ['9:21', 9 / 21],
];
function nearestRatio(w, h, allowed) {
  const want = w / h;
  const pool = FLUX_RATIOS.filter(([name]) => !allowed || allowed.includes(name));
  if (!pool.length) return '1:1';
  return pool.reduce((best, cur) =>
    Math.abs(cur[1] - want) < Math.abs(best[1] - want) ? cur : best,
  )[0];
}

/** Build a parameter object containing only keys this model declares. */
async function buildInput(model, { prompt, negative, width, height, seed }) {
  const props = await inputSchema(model);
  const has = (k) => Object.prototype.hasOwnProperty.call(props, k);
  const input = {};

  // Negatives: use the real field when it exists, otherwise fold into the prompt
  // so the instruction is not silently dropped.
  if (has('negative_prompt')) {
    input.prompt = prompt;
    input.negative_prompt = negative;
  } else {
    input.prompt = negative ? `${prompt}. Avoid: ${negative}` : prompt;
  }

  // Size: explicit pixels if supported, else the closest supported aspect ratio.
  if (has('width') && has('height')) {
    input.width = width;
    input.height = height;
  } else if (has('aspect_ratio')) {
    const enumVals = props.aspect_ratio?.enum
      || props.aspect_ratio?.allOf?.[0]?.enum
      || null;
    input.aspect_ratio = nearestRatio(width, height, enumVals);
    // Ask for the largest megapixel bucket available so we generate above target.
    if (has('megapixels')) {
      const mp = props.megapixels?.enum || props.megapixels?.allOf?.[0]?.enum || null;
      if (mp && mp.includes('1')) input.megapixels = '1';
    }
  }

  if (has('output_format')) input.output_format = 'png';
  if (has('num_outputs')) input.num_outputs = 1;
  if (has('disable_safety_checker')) input.disable_safety_checker = false;
  if (seed !== undefined && has('seed')) input.seed = seed;

  return input;
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------
const TOOL = {
  name: 'generate_game_asset',
  description:
    'Generate a single game art asset with Replicate and save it as a PNG under assets-src/. ' +
    'The shared style bible is prefixed to every prompt automatically, so `prompt` should describe ' +
    'only the subject (e.g. "an oak tree with a thick trunk and round canopy"). ' +
    'Generate at 2-4x the final size; scripts/process-asset.mjs does trimming, resizing, ' +
    'palette quantisation, outlining and packing afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Asset id, used as the output filename, e.g. "tree_oak". Must match the manifest id.',
      },
      prompt: {
        type: 'string',
        description: 'Subject description only — the style bible prefix is added for you.',
      },
      category: {
        type: 'string',
        enum: Object.keys(CATEGORY_HINTS),
        description: 'Framing hint: terrain (seamless), item (icon), prop, character (sheet), effect, ui.',
      },
      width: { type: 'integer', description: 'Generation width in px (2-4x final). Default 1024.' },
      height: { type: 'integer', description: 'Generation height in px (2-4x final). Default 1024.' },
      model: { type: 'string', description: `Replicate model as owner/name. Default ${DEFAULT_MODEL}.` },
      out_dir: { type: 'string', description: 'Output directory. Default assets-src/<category>.' },
      seed: { type: 'integer', description: 'Seed for reproducibility. Omit for random.' },
      negative_prompt: { type: 'string', description: 'Extra things to avoid, appended to the default list.' },
    },
    required: ['id', 'prompt', 'category'],
  },
};

async function generateGameAsset(args) {
  if (!TOKEN) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Add it to the environment (or .env.local) and restart the ' +
        'MCP server. Get one at https://replicate.com/account/api-tokens',
    );
  }
  const { id, prompt, category } = args;
  if (!id || !prompt || !category) throw new Error('id, prompt and category are all required');
  if (!CATEGORY_HINTS[category]) {
    throw new Error(`unknown category "${category}"; expected one of ${Object.keys(CATEGORY_HINTS).join(', ')}`);
  }

  const model = args.model || DEFAULT_MODEL;
  const width = args.width || 1024;
  const height = args.height || 1024;
  const fullPrompt = `${STYLE_PREFIX}, ${CATEGORY_HINTS[category]}, ${prompt}`;
  const negative = [
    'photorealistic', 'blurry', 'text', 'watermark', 'signature', 'drop shadow on background',
    'multiple objects', 'side view', 'front orthographic view', 'isometric grid',
    args.negative_prompt || '',
  ].filter(Boolean).join(', ');

  const input = await buildInput(model, {
    prompt: fullPrompt,
    negative: negative,
    width,
    height,
    seed: args.seed,
  });

  const pred = await predict(model, input);
  const url = firstOutputUrl(pred.output);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloading ${url} failed with HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const outDir = resolve(args.out_dir || join('assets-src', category));
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${id}.png`);
  await writeFile(outPath, bytes);

  return [
    `Saved ${outPath} (${(bytes.length / 1024).toFixed(0)} KB, ${width}x${height})`,
    `model: ${model}`,
    `prediction: ${pred.id}`,
    `seed: ${pred.input?.seed ?? args.seed ?? 'random'}`,
    '',
    'Next: run `node scripts/process-asset.mjs ' + outPath + '` to trim, resize, quantise and outline.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'replicate-game-assets', version: '1.0.0' },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications take no response
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: [TOOL] });
    case 'tools/call': {
      if (params?.name !== TOOL.name) return fail(id, -32602, `unknown tool: ${params?.name}`);
      try {
        return toolResult(id, await generateGameAsset(params.arguments || {}));
      } catch (err) {
        return toolResult(id, `generate_game_asset failed: ${err.message}`, true);
      }
    }
    default:
      if (id === undefined) return; // unknown notification, ignore
      return fail(id, -32601, `method not found: ${method}`);
  }
}

let buffer = '';
let inFlight = 0;
let stdinClosed = false;

/** Exit only once stdin is done AND no request is still being served. */
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed frames rather than killing the server
    }
    inFlight += 1;
    try {
      await handle(msg);
    } catch (err) {
      if (msg.id !== undefined) fail(msg.id, -32603, err.message);
    } finally {
      inFlight -= 1;
      maybeExit();
    }
  }
});
process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});
