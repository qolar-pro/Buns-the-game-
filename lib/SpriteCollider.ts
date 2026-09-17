import { debug, debugError } from '@/lib/debug';
/**
 * SpriteCollider.ts
 * Universal system for generating optimized hitboxes and interaction shapes from PNG files.
 */

export enum CollisionLayer {
  SOLID = 1,    // Trees, Rocks (Obstacles)
  ITEM = 2,     // Sticks, Pebbles, Grass (Interactables)
  ANIMAL = 3,   // Cows, Slimes (Dynamic)
}

export interface Point {
  x: number;
  y: number;
}

export interface ColliderShape {
  points: Point[];        // Full outline for interaction/selection
  physicsPoints: Point[]; // Restricted outline for solid collision
  layer: CollisionLayer;
  isTrigger: boolean;
  originalWidth: number;
  originalHeight: number;
}

export class SpriteColliderGenerator {
  /**
   * Generates a collider shape from an image element.
   * @param img The source HTMLImageElement
   * @param type The type of object ('obstacle', 'interactable', 'animal')
   * @param layer The collision layer to assign
   * @param epsilon RDP simplification tolerance (higher = fewer points)
   * @param physicsHeightPercent The percentage of height (from bottom) to use for solid collision (0.0 to 1.0)
   */
  static async generateFromImage(
    img: HTMLImageElement,
    type: 'obstacle' | 'interactable' | 'animal',
    layer: CollisionLayer,
    epsilon: number = 1.0,
    physicsHeightPercent: number = 1.0
  ): Promise<ColliderShape> {
    if (!img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // 1. Generate Full Outline (for interaction/selection)
    const fullPoints = this.traceOutline(pixels, canvas.width, canvas.height, 0, canvas.height);
    const optimizedFullPoints = this.simplifyRDP(fullPoints, epsilon);

    // 2. Generate Physics Outline (for solid collision)
    let physicsPoints: Point[] = [];
    if (type === 'obstacle' || physicsHeightPercent < 1.0) {
      // World Obstacles: Use specified height percentage from bottom
      const startY = Math.floor(canvas.height * (1.0 - physicsHeightPercent));
      const rawPhysics = this.traceOutline(pixels, canvas.width, canvas.height, startY, canvas.height);
      physicsPoints = this.simplifyRDP(rawPhysics, epsilon);
    } else {
      // Interactables & Animals: Physics matches full shape
      physicsPoints = optimizedFullPoints;
    }

    return {
      points: optimizedFullPoints,
      physicsPoints: physicsPoints,
      layer,
      isTrigger: type === 'interactable',
      originalWidth: canvas.width,
      originalHeight: canvas.height,
    };
  }

  /**
   * Generates a precise collider from a specific region of an image,
   * ignoring labels and metadata noise.
   */
  static async generateSmartCollider(
    img: HTMLImageElement,
    type: 'obstacle' | 'interactable' | 'animal',
    layer: CollisionLayer,
    options: {
      cellWidth: number;
      cellHeight: number;
      labelHeight: number; // Pixels to skip at top
      charWidth: number;   // Width of character area
      charHeight: number;  // Height of character area
    }
  ): Promise<ColliderShape> {
    const canvas = document.createElement('canvas');
    canvas.width = options.charWidth;
    canvas.height = options.charHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    // Draw only the character area (skipping labels)
    ctx.drawImage(
      img,
      0, options.labelHeight, options.charWidth, options.charHeight,
      0, 0, options.charWidth, options.charHeight
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // 1. Trace Outline with Noise Filtering
    // We only trace the largest continuous cluster of pixels to ignore frame numbers
    const fullPoints = this.traceOutline(pixels, canvas.width, canvas.height, 0, canvas.height);
    const optimizedFullPoints = this.simplifyRDP(fullPoints, 0.5);

    // 2. Physics Outline (Bottom 30% for feet/base)
    const physicsHeight = 0.3;
    const startY = Math.floor(canvas.height * (1.0 - physicsHeight));
    const rawPhysics = this.traceOutline(pixels, canvas.width, canvas.height, startY, canvas.height);
    const physicsPoints = this.simplifyRDP(rawPhysics, 0.5);

    return {
      points: optimizedFullPoints,
      physicsPoints: physicsPoints,
      layer,
      isTrigger: type === 'interactable',
      originalWidth: canvas.width,
      originalHeight: canvas.height,
    };
  }

  /**
   * Traces the outline of the largest connected cluster of pixels.
   * This ignores isolated noise like frame numbers or UI lines.
   */
  private static traceOutline(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    startY: number,
    endY: number
  ): Point[] {
    const threshold = 10; // Alpha threshold
    const visited = new Uint8Array(width * height);
    let largestCluster: Point[] = [];

    // Find all clusters and keep the largest one
    for (let y = startY; y < endY; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;
        
        const alpha = pixels[idx * 4 + 3];
        if (alpha > threshold) {
          const cluster: Point[] = [];
          const stack: [number, number][] = [[x, y]];
          visited[idx] = 1;

          while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            cluster.push({ x: cx, y: cy });

            // Check 4-neighbors
            const neighbors: [number, number][] = [
              [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
            ];

            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < width && ny >= startY && ny < endY) {
                const nIdx = ny * width + nx;
                if (!visited[nIdx] && pixels[nIdx * 4 + 3] > threshold) {
                  visited[nIdx] = 1;
                  stack.push([nx, ny]);
                }
              }
            }
          }

          if (cluster.length > largestCluster.length) {
            largestCluster = cluster;
          }
        }
      }
    }

    // Minimum cluster size to ignore noise (e.g., frame numbers or stray pixels)
    if (largestCluster.length < 20) return [];

    if (largestCluster.length === 0) return [];

    // Now trace the outline of the largest cluster
    // For simplicity, we'll use the same left/right edge logic on the cluster points
    const clusterPixels = new Uint8Array(width * height);
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const p of largestCluster) {
      clusterPixels[p.y * width + p.x] = 1;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const leftEdge: Point[] = [];
    const rightEdge: Point[] = [];

    for (let y = minY; y <= maxY; y++) {
      let firstX = -1;
      let lastX = -1;

      for (let x = minX; x <= maxX; x++) {
        if (clusterPixels[y * width + x]) {
          if (firstX === -1) firstX = x;
          lastX = x;
        }
      }

      if (firstX !== -1) {
        leftEdge.push({ x: firstX, y });
        if (lastX !== firstX) {
          rightEdge.push({ x: lastX, y });
        }
      }
    }

    return [...rightEdge, ...leftEdge.reverse()];
  }

  /**
   * Ramer-Douglas-Peucker algorithm for point reduction.
   */
  private static simplifyRDP(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = this.perpendicularDistance(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      const recResults1 = this.simplifyRDP(points.slice(0, index + 1), epsilon);
      const recResults2 = this.simplifyRDP(points.slice(index), epsilon);
      return [...recResults1.slice(0, -1), ...recResults2];
    } else {
      return [points[0], points[end]];
    }
  }

  private static perpendicularDistance(p: Point, p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.sqrt(Math.pow(p.x - p1.x, 2) + Math.pow(p.y - p1.y, 2));
    return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / mag;
  }

  /**
   * Checks if a point is inside a polygon using the ray casting algorithm.
   */
  static isPointInPolygon(p: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Batch process a folder/list of assets.
   */
  static async batchProcess(
    assets: { url: string; type: 'obstacle' | 'interactable' | 'animal'; layer: CollisionLayer }[]
  ): Promise<Map<string, ColliderShape>> {
    const results = new Map<string, ColliderShape>();

    for (const asset of assets) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = asset.url;
      
      try {
        const shape = await this.generateFromImage(img, asset.type, asset.layer);
        results.set(asset.url, shape);
        debug(`Generated collider for ${asset.url}: ${shape.points.length} vertices`);
      } catch (err) {
        debugError(`Failed to process ${asset.url}:`, err);
      }
    }

    return results;
  }
}
