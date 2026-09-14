/**
 * Atlas loading and frame lookup.
 *
 * Replaces the ~34 hand-managed `useRef<HTMLImageElement>` declarations and the
 * per-asset `loadImg` calls that used to live in the game component. Atlases are
 * loaded once, and every sprite is addressed by a manifest id rather than a
 * filename, so renaming a file can no longer silently break physics or drawing.
 */
import { ATLASES, FRAMES, type AtlasName, type Frame, type FrameId } from './frames';

export type { Frame, FrameId };

/** Where the packed atlases are served from. */
const ATLAS_PATH = '/sprites';

export interface LoadProgress {
  loaded: number;
  total: number;
}

export class AssetRegistry {
  private images = new Map<AtlasName, HTMLImageElement>();
  private ready = false;

  /** Dev-only: ids that were asked for but do not exist, reported once each. */
  private warned = new Set<string>();

  /**
   * Load every atlas. Resolves once all are decoded, so the first frame drawn
   * never races a half-loaded texture.
   */
  async load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    let loaded = 0;
    const total = ATLASES.length;

    await Promise.all(
      ATLASES.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(name, img);
              loaded += 1;
              onProgress?.({ loaded, total });
              resolve();
            };
            img.onerror = () =>
              reject(new Error(`atlas "${name}" failed to load from ${ATLAS_PATH}/${name}.png`));
            img.src = `${ATLAS_PATH}/${name}.png`;
          }),
      ),
    );
    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** True when `id` exists in the manifest. */
  has(id: string): id is FrameId {
    return Object.prototype.hasOwnProperty.call(FRAMES, id);
  }

  /**
   * Frame rectangle for `id`.
   *
   * Fails loudly in development rather than falling back to a placeholder: a
   * silent fallback is exactly what let 33 missing images hide behind SVG
   * stand-ins for so long. In production it returns null so a single bad id
   * cannot take the whole game down.
   */
  get(id: string): Frame | null {
    if (this.has(id)) return FRAMES[id];

    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Unknown asset id "${id}". Add it to scripts/asset-catalog.mjs and run ` +
          `\`npm run assets:generate && npm run assets:process && npm run assets:pack\`.`,
      );
    }
    if (!this.warned.has(id)) {
      this.warned.add(id);
      console.error(`[assets] unknown asset id "${id}"`);
    }
    return null;
  }

  /** The decoded atlas image a frame lives in. */
  image(frame: Frame): HTMLImageElement | null {
    return this.images.get(frame.atlas as AtlasName) ?? null;
  }

  /**
   * Draw a whole frame at (dx, dy), scaled to dw x dh.
   * Positions are rounded so sprites land on whole pixels.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    id: string,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number,
  ): void {
    const frame = this.get(id);
    if (!frame) return;
    const img = this.image(frame);
    if (!img) return;
    ctx.drawImage(
      img,
      frame.x, frame.y, frame.w, frame.h,
      Math.round(dx), Math.round(dy),
      Math.round(dw ?? frame.w), Math.round(dh ?? frame.h),
    );
  }

  /**
   * A frame as a standalone drawable.
   *
   * The engine's existing draw calls take a whole image and scale it; this hands
   * them one, cut from the atlas and cached, so sprites can be addressed by
   * manifest id without rewriting every draw call at the same time. Frames are
   * extracted lazily on first use and kept.
   */
  private spriteCache = new Map<string, HTMLCanvasElement>();

  sprite(id: string): HTMLCanvasElement | null {
    const cached = this.spriteCache.get(id);
    if (cached) return cached;

    const frame = this.get(id);
    if (!frame) return null;
    const img = this.image(frame);
    if (!img) return null;

    const canvas = document.createElement('canvas');
    canvas.width = frame.w;
    canvas.height = frame.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);

    this.spriteCache.set(id, canvas);
    return canvas;
  }

  /**
   * Draw one cell of a sprite sheet. `col` and `row` are clamped to the grid so
   * an animation frame that runs past the end cannot sample a neighbour.
   */
  drawCell(
    ctx: CanvasRenderingContext2D,
    id: string,
    col: number,
    row: number,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number,
  ): void {
    const frame = this.get(id);
    if (!frame?.grid) return;
    const img = this.image(frame);
    if (!img) return;

    const { cols, rows, cellW, cellH } = frame.grid;
    const c = Math.max(0, Math.min(cols - 1, Math.floor(col)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(row)));

    ctx.drawImage(
      img,
      frame.x + c * cellW, frame.y + r * cellH, cellW, cellH,
      Math.round(dx), Math.round(dy),
      Math.round(dw ?? cellW), Math.round(dh ?? cellH),
    );
  }
}

/** The registry the game uses. */
export const assets = new AssetRegistry();
