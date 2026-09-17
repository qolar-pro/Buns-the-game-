/**
 * The bridge from the game loop to the React HUD.
 *
 * The engine ran at 60fps and the old UI was redrawn on the canvas every frame.
 * Moving the HUD to React means React must not re-render at that rate, so the
 * loop publishes a small snapshot here and this store notifies subscribers only
 * when a value actually changes. That replaces the per-frame `uiTick` counter
 * that used to force a re-render whether anything had changed or not.
 */
import type { InventorySlot } from './types';

export interface HudSnapshot {
  /** Health runs 0-100 and is shown as a bar, as the canvas HUD did. */
  health: number;
  hunger: number;
  maxHunger: number;
  /**
   * There is no separate stamina stat in the engine: sprinting is gated on
   * hunger. The HUD reflects what the game actually models rather than showing
   * a bar with nothing behind it.
   */
  canSprint: boolean;
  defense: number;
  selectedSlot: number;
  /** Hotbar contents, flattened to the few fields the HUD shows. */
  hotbar: ({ type: string; count: number } | null)[];
  timeLabel: string;
  message: string | null;
  /** The current objective, so the log renders without touching game state. */
  questTitle: string | null;
  questHint: string | null;
  questProgress: { have: number; need: number } | null;
  questsDone: number;
  questsTotal: number;
  /** 0 on the surface, 1-3 underground. Drives the depth readout. */
  depth: number;
  /** Run summary, shown when the broadcast fires. */
  ending: {
    kind: 'rescued' | 'settled';
    daysSurvived: number;
    deepestDepth: number;
    mobsDefeated: number;
    chestsLooted: number;
    itemsCrafted: number;
  } | null;
}

const EMPTY: HudSnapshot = {
  health: 100, hunger: 0, maxHunger: 10, canSprint: false, defense: 0,
  questTitle: null, questHint: null, questProgress: null, questsDone: 0, questsTotal: 0,
  depth: 0, ending: null,
  selectedSlot: 0, hotbar: [], timeLabel: '00:00', message: null,
};

let snapshot: HudSnapshot = EMPTY;
const listeners = new Set<() => void>();

/** Shallow equality, with the hotbar compared item by item. */
function same(a: HudSnapshot, b: HudSnapshot): boolean {
  if (
    a.health !== b.health ||
    a.hunger !== b.hunger || a.maxHunger !== b.maxHunger ||
    a.canSprint !== b.canSprint ||
    a.defense !== b.defense || a.selectedSlot !== b.selectedSlot ||
    a.timeLabel !== b.timeLabel || a.message !== b.message ||
    a.questTitle !== b.questTitle || a.questsDone !== b.questsDone ||
    a.depth !== b.depth || (a.ending === null) !== (b.ending === null) ||
    a.questProgress?.have !== b.questProgress?.have ||
    a.hotbar.length !== b.hotbar.length
  ) {
    return false;
  }
  for (let i = 0; i < a.hotbar.length; i++) {
    const x = a.hotbar[i];
    const y = b.hotbar[i];
    if (x === y) continue;
    if (!x || !y) return false;
    if (x.type !== y.type || x.count !== y.count) return false;
  }
  return true;
}

/**
 * Called from the game loop. Cheap when nothing changed: it compares and
 * returns without notifying, so React stays idle while the player stands still.
 */
export function publishHud(next: HudSnapshot): void {
  if (same(snapshot, next)) return;
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribeHud(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHudSnapshot(): HudSnapshot {
  return snapshot;
}

/** Server rendering has no engine; hand back a stable empty snapshot. */
export function getHudServerSnapshot(): HudSnapshot {
  return EMPTY;
}

/** Flatten hotbar slots to the few fields the HUD shows. */
export function toHotbar(slots: (InventorySlot | null)[], count: number) {
  const out: ({ type: string; count: number } | null)[] = [];
  for (let i = 0; i < count; i++) {
    const s = slots[i];
    out.push(s ? { type: s.type, count: s.count } : null);
  }
  return out;
}
