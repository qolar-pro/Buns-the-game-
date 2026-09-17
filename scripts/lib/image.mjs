/**
 * Deterministic image operations for the asset pipeline.
 *
 * Every step here is pure and repeatable: the same input always produces the
 * same output, so regenerating art never silently changes physics or layout.
 */
import sharp from 'sharp';

/** Load a PNG as flat RGBA plus dimensions. */
export async function loadRGBA(input) {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function toSharp({ data, width, height }) {
  return sharp(data, { raw: { width, height, channels: 4 } });
}

// --- colour helpers ---------------------------------------------------------

export function rgbToHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Shortest distance between two hues, in degrees. */
export function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- background removal -----------------------------------------------------

/**
 * Remove a chroma-key background by flood-filling inward from the image edges.
 *
 * Keyed on hue rather than RGB distance, for two reasons: the model does not
 * reliably return the exact magenta it is asked for (returns vary from hot pink
 * to purple), and the shadow it bakes in despite being told not to is the same
 * hue as the background, just darker. A hue test removes both; an RGB test
 * removes neither reliably.
 *
 * Flood-filling from the edges (rather than testing every pixel) means a
 * magenta-ish detail inside the subject is never punched out.
 */
export function removeChromaBackground({ data, width, height }, opts = {}) {
  const hueTol = opts.hueTol ?? 32;
  const satMin = opts.satMin ?? 0.22;

  // Background hue = median hue of the border ring, which is nearly all background.
  const hues = [];
  const readHue = (x, y) => {
    const i = (y * width + x) * 4;
    const { h, s } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s > satMin) hues.push(h);
  };
  for (let x = 0; x < width; x++) { readHue(x, 0); readHue(x, height - 1); }
  for (let y = 0; y < height; y++) { readHue(0, y); readHue(width - 1, y); }
  if (!hues.length) return { data, width, height, removed: 0 };
  hues.sort((a, b) => a - b);
  const bgHue = hues[Math.floor(hues.length / 2)];

  const isBg = (i) => {
    const { h, s } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    return s >= satMin && hueDist(h, bgHue) <= hueTol;
  };

  // Iterative flood fill from every border pixel.
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBg(p * 4)) stack.push(p);
    else seen[p] = 2; // visited but kept
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  const out = Buffer.from(data);
  let removed = 0;
  while (stack.length) {
    const p = stack.pop();
    out[p * 4 + 3] = 0;
    removed += 1;
    const x = p % width, y = (p / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // Interior cleanup. Background enclosed by the subject — a gap in foliage, the
  // inside of a handle — is unreachable from the edges, so it survives the flood
  // fill as a magenta patch. Those pixels are removed on a much tighter test:
  // strongly saturated and very close to the background hue. Real game art is
  // almost never a saturated magenta, so this does not eat the subject.
  const interiorHue = hueTol * 0.55;
  const interiorSat = Math.max(satMin, 0.45);
  for (let p = 0; p < width * height; p++) {
    if (out[p * 4 + 3] === 0) continue;
    const i = p * 4;
    const { h, s, v } = rgbToHsv(out[i], out[i + 1], out[i + 2]);
    if (s >= interiorSat && v > 0.25 && hueDist(h, bgHue) <= interiorHue) {
      out[i + 3] = 0;
      removed += 1;
    }
  }

  // Despill: pixels kept next to removed ones often carry a magenta fringe.
  for (let p = 0; p < width * height; p++) {
    if (out[p * 4 + 3] === 0) continue;
    const i = p * 4;
    const { h, s } = rgbToHsv(out[i], out[i + 1], out[i + 2]);
    if (s > satMin && hueDist(h, bgHue) <= hueTol * 0.6) {
      // Desaturate toward luminance rather than deleting: keeps edges solid.
      const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      out[i] = (out[i] + lum) / 2;
      out[i + 1] = (out[i + 1] + lum) / 2;
      out[i + 2] = (out[i + 2] + lum) / 2;
    }
  }
  return { data: out, width, height, removed };
}

/** Bounding box of pixels with alpha above a threshold. */
export function alphaBounds({ data, width, height }, threshold = 8) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// --- seamless tiling --------------------------------------------------------

/**
 * Make a texture tile seamlessly by cross-fading the image with wrapped copies
 * of itself. Because the blend weights reach the same value at both edges, the
 * left column matches the right and the top row matches the bottom exactly.
 */
export function makeSeamless({ data, width, height }) {
  const out = Buffer.alloc(data.length);
  const at = (x, y, c) => data[(((y % height) + height) % height * width + (((x % width) + width) % width)) * 4 + c];
  for (let y = 0; y < height; y++) {
    const my = 0.5 - 0.5 * Math.cos((y / height) * 2 * Math.PI); // 0 at edges, 1 mid
    for (let x = 0; x < width; x++) {
      const mx = 0.5 - 0.5 * Math.cos((x / width) * 2 * Math.PI);
      const wx = 1 - mx, wy = 1 - my;
      const hw = width >> 1, hh = height >> 1;
      for (let c = 0; c < 4; c++) {
        const v =
          at(x, y, c) * mx * my +
          at(x + hw, y, c) * wx * my +
          at(x, y + hh, c) * mx * wy +
          at(x + hw, y + hh, c) * wx * wy;
        out[(y * width + x) * 4 + c] = Math.round(v);
      }
    }
  }
  return { data: out, width, height };
}

// --- outline and shadow -----------------------------------------------------

/** Dilate the alpha channel by `r` pixels and paint it `colour` behind the sprite. */
export async function addOutline(buf, r, colour) {
  if (r <= 0) return buf;
  const { data, width, height } = await loadRGBA(buf);
  const alpha = Buffer.alloc(width * height);
  for (let p = 0; p < width * height; p++) alpha[p] = data[p * 4 + 3];

  const grown = Buffer.alloc(width * height);
  const r2 = r * r;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      for (let dy = -r; dy <= r && best < 255; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const a = alpha[yy * width + xx];
          if (a > best) { best = a; if (best === 255) break; }
        }
      }
      grown[y * width + x] = best;
    }
  }

  const layer = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    layer[p * 4] = colour[0];
    layer[p * 4 + 1] = colour[1];
    layer[p * 4 + 2] = colour[2];
    layer[p * 4 + 3] = grown[p];
  }
  return sharp(layer, { raw: { width, height, channels: 4 } })
    .composite([{ input: buf, blend: 'over' }])
    .png()
    .toBuffer();
}

/**
 * Composite one uniform contact shadow under the sprite. Every asset gets the
 * same ellipse geometry and opacity, which is what makes a mixed-origin set read
 * as one game — the per-image shadows the model bakes in never match each other.
 */
export async function addContactShadow(buf, w, h, opts = {}) {
  const opacity = opts.opacity ?? 0.28;
  const rx = Math.round(w * (opts.rx ?? 0.34));
  const ry = Math.round(h * (opts.ry ?? 0.055));
  const cy = Math.round(h * (opts.cy ?? 0.955));
  const blur = opts.blur ?? Math.max(1, Math.round(w * 0.02));

  const svg = `<svg width="${w}" height="${h}">
    <ellipse cx="${Math.round(w / 2)}" cy="${cy}" rx="${rx}" ry="${ry}"
             fill="rgba(24,18,30,${opacity})"/>
  </svg>`;
  const shadow = await sharp(Buffer.from(svg)).blur(blur).png().toBuffer();

  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow }, { input: buf }])
    .png()
    .toBuffer();
}
