/**
 * What is under the pointer.
 *
 * The game already had a precise hit test: bounding box first, then a
 * point-in-polygon check against the sprite's own collider, so clicking the gap
 * between a tree's branches did not select the tree. It was used for exactly one
 * kind of thing — resources — and everything else in the world was either
 * unclickable or picked by rough proximity.
 *
 * This is that same test, applied to everything the player can click, with one
 * change that matters: candidates are sorted the way they are drawn and the
 * topmost is returned. Iterating chunks and taking the first hit meant that
 * where two objects overlapped, the one you got was decided by map iteration
 * order rather than by which one you could actually see.
 */
import { PLAYER_SIZE } from '../core/config';
import { idForEntity } from '../assets/colliders';
import { DEFAULT_MOB_SIZE, MOB_SIZE, NPC_SIZE } from '../render/EntityRenderer';
import { ITEM_DRAW_SIZE } from '../render/Renderer';
import { SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import type { AnimalType, EntityType, GameState } from '../core/types';

export type PickKind = 'resource' | 'animal' | 'npc' | 'enemy' | 'item';

export interface Pick {
  kind: PickKind;
  id: string;
  /** Distance from the player, so callers can enforce reach. */
  distance: number;
}

export interface PickDeps {
  colliders: Map<string, ColliderShape>;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
  getAnimalSpriteInfo: (type: AnimalType) => { w: number; h: number; imgUrl: string };
}

/** One thing that could be under the pointer, with everything needed to test it. */
interface Candidate {
  kind: PickKind;
  id: string;
  /** Top-left of the drawn sprite, in world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Collider key, or null to fall back to the bounding box. */
  sprite: string | null;
  /** Draw order: larger is drawn later, so it is on top. */
  sortY: number;
}

/**
 * Is this point inside the sprite, not just inside its box?
 *
 * The polygon is in the sprite's own pixel space, so the world offset is scaled
 * by the ratio between the drawn size and the source size. That is what lets one
 * collider serve a sprite drawn at any world size.
 */
function hits(c: Candidate, wx: number, wy: number, colliders: Map<string, ColliderShape>): boolean {
  if (wx < c.x || wx > c.x + c.w || wy < c.y || wy > c.y + c.h) return false;
  if (!c.sprite) return true;

  const shape = colliders.get(c.sprite);
  if (!shape) return true; // no collider authored: the box is the hitbox

  const local: Point = {
    x: (wx - c.x) / (c.w / shape.originalWidth),
    y: (wy - c.y) / (c.h / shape.originalHeight),
  };
  return SpriteColliderGenerator.isPointInPolygon(local, shape.points);
}

/** Every clickable thing near the point, in draw order. */
function candidates(state: GameState, wx: number, wy: number, deps: PickDeps): Candidate[] {
  const out: Candidate[] = [];
  // Only look at things whose box could plausibly contain the point.
  const NEAR = 260;

  for (const [, chunk] of state.resources) {
    for (const res of chunk) {
      if (Math.abs(res.x - wx) > NEAR || Math.abs(res.y - wy) > NEAR) continue;
      const dims = deps.getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
      out.push({
        kind: 'resource',
        id: res.id,
        x: res.x,
        y: res.y,
        w: dims.w,
        h: dims.h,
        sprite: idForEntity(res.type, { growthStage: res.growthStage, rockIndex: res.rockIndex }),
        sortY: res.y + dims.h * 0.95,
      });
    }
  }

  for (const a of state.animals) {
    if (Math.abs(a.x - wx) > NEAR || Math.abs(a.y - wy) > NEAR) continue;
    const info = deps.getAnimalSpriteInfo(a.type);
    // Animals are drawn anchored at bottom-centre, unlike resources.
    out.push({
      kind: 'animal',
      id: a.id,
      x: a.x - info.w / 2,
      y: a.y - info.h,
      w: info.w,
      h: info.h,
      sprite: null,
      sortY: a.y + 20,
    });
  }

  for (const n of state.npcs) {
    if (Math.abs(n.x - wx) > NEAR || Math.abs(n.y - wy) > NEAR) continue;
    // Sizes come from the renderer, not from a second copy here.
    const size = NPC_SIZE[n.role];
    out.push({
      kind: 'npc', id: n.id, x: n.x - size / 2, y: n.y - size, w: size, h: size,
      sprite: null, sortY: n.y,
    });
  }

  for (const e of state.enemies) {
    if (Math.abs(e.x - wx) > NEAR || Math.abs(e.y - wy) > NEAR) continue;
    const size = MOB_SIZE[e.type] ?? DEFAULT_MOB_SIZE;
    out.push({
      kind: 'enemy', id: e.id, x: e.x - size / 2, y: e.y - size, w: size, h: size,
      sprite: null, sortY: e.y + 20,
    });
  }

  for (const it of state.items) {
    if (Math.abs(it.x - wx) > NEAR || Math.abs(it.y - wy) > NEAR) continue;
    const half = ITEM_DRAW_SIZE / 2;
    out.push({
      kind: 'item', id: it.id, x: it.x - half, y: it.y - half,
      w: ITEM_DRAW_SIZE, h: ITEM_DRAW_SIZE, sprite: null, sortY: it.y + 16,
    });
  }

  // Topmost first: the thing drawn last is the thing the player can see.
  return out.sort((a, b) => b.sortY - a.sortY);
}

/**
 * What the player is pointing at, or null.
 *
 * `reach` filters by distance from the player rather than from the pointer, so
 * a click on something across the map selects nothing instead of selecting
 * something that cannot be acted on.
 */
export function pickAt(
  state: GameState,
  worldX: number,
  worldY: number,
  deps: PickDeps,
  reach = Infinity,
): Pick | null {
  const px = state.player.x + PLAYER_SIZE / 2;
  const py = state.player.y + PLAYER_SIZE / 2;

  for (const c of candidates(state, worldX, worldY, deps)) {
    if (!hits(c, worldX, worldY, deps.colliders)) continue;
    const distance = Math.hypot(c.x + c.w / 2 - px, c.y + c.h - py);
    if (distance > reach) continue;
    return { kind: c.kind, id: c.id, distance };
  }
  return null;
}

/** Write a pick into the selection fields the rest of the game reads. */
export function applyPick(state: GameState, pick: Pick | null): void {
  state.selectedResourceId = pick?.kind === 'resource' ? pick.id : null;
  state.selectedAnimalId = pick?.kind === 'animal' ? pick.id : null;
}
