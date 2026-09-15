/**
 * The objective chain.
 *
 * This is the difference between a sandbox and a game with an ending: a short,
 * ordered list that always names the next concrete action, from "chop a tree"
 * to "broadcast".
 *
 * Objectives are *derived from state*, never handed in. There is no quest-giver
 * and nothing to talk to — each one asks a question about the world and answers
 * it. That keeps the whole system pure and testable, and means a player who does
 * something out of order gets credit for it anyway.
 */
import type { GameState, ItemType } from '../core/types';

export interface Objective {
  id: string;
  /** Shown in the log. Imperative: what to do, not what has happened. */
  title: string;
  /** One line of why, shown under the title for the active objective. */
  hint: string;
  /** True once satisfied. */
  done: (s: GameState) => boolean;
  /** Optional progress, for objectives that count. */
  progress?: (s: GameState) => { have: number; need: number };
}

/** Total of an item across the inventory. */
function count(s: GameState, type: ItemType): number {
  return s.player.inventory.reduce((n, slot) => n + (slot?.type === type ? slot.count : 0), 0);
}

const has = (s: GameState, type: ItemType, n = 1) => count(s, type) >= n;

/** Any tool of a tier, so the log does not care which one you made. */
const hasAny = (s: GameState, types: ItemType[]) => types.some((t) => has(s, t));

/** True once a placed entity of this type exists anywhere in the world. */
function placed(s: GameState, type: string): boolean {
  for (const [, chunk] of s.resources) {
    for (const r of chunk) if (r.type === type) return true;
  }
  return false;
}

/**
 * The chain, in order.
 *
 * Deliberately linear. A branching list would be more "open", but the point of
 * this log is that a new player is never left wondering what to do next.
 */
export const OBJECTIVES: Objective[] = [
  {
    id: 'gather-wood',
    title: 'Gather 10 wood',
    hint: 'Chop trees and bushes. Everything starts here.',
    done: (s) => has(s, 'wood', 10) || s.progress.itemsCrafted > 0,
    progress: (s) => ({ have: Math.min(count(s, 'wood'), 10), need: 10 }),
  },
  {
    id: 'workbench',
    title: 'Craft and place a workbench',
    hint: 'Most recipes need one nearby. 10 wood.',
    done: (s) => placed(s, 'workbench'),
  },
  {
    id: 'stone-tools',
    title: 'Craft a stone pickaxe',
    hint: 'Stone tools are what let you mine ore at all.',
    done: (s) => hasAny(s, ['stone_pickaxe', 'iron_pickaxe', 'titanium_pickaxe', 'prospectors_pick']),
  },
  {
    id: 'furnace',
    title: 'Place a furnace and smelt iron',
    hint: 'Iron ore plus coal for fuel. Bars are the gate to everything after this.',
    done: (s) => has(s, 'iron_ingot') || hasAny(s, ['iron_pickaxe', 'iron_axe', 'iron_sword']),
  },
  {
    id: 'iron-pick',
    title: 'Craft an iron pickaxe',
    hint: 'Collapsed shafts are choked with rubble. Only iron will clear it.',
    done: (s) => hasAny(s, ['iron_pickaxe', 'titanium_pickaxe', 'prospectors_pick']),
  },
  {
    id: 'enter-dungeon',
    title: 'Find a collapsed shaft and go down',
    hint: 'They dot the surface. Clear the rubble and climb in.',
    done: (s) => s.progress.deepestDepth >= 1,
  },
  {
    id: 'loot-chest',
    title: 'Loot a dungeon chest',
    hint: 'Scrap metal smelts into the copper wiring the antenna needs.',
    done: (s) => s.progress.chestsLooted >= 1,
    progress: (s) => ({ have: Math.min(s.progress.chestsLooted, 1), need: 1 }),
  },
  {
    id: 'lantern',
    title: 'Get a lantern',
    hint: 'Craft one from copper, or find one below. The deep is dark.',
    done: (s) => has(s, 'lantern'),
  },
  {
    id: 'go-deep',
    title: 'Reach the Vault, three levels down',
    hint: 'Titanium and the Warden are both down there.',
    done: (s) => s.progress.deepestDepth >= 3,
    progress: (s) => ({ have: Math.min(s.progress.deepestDepth, 3), need: 3 }),
  },
  {
    id: 'warden',
    title: 'Defeat the Warden',
    hint: 'It holds the signal core. Nothing else does.',
    done: (s) => s.progress.wardenDefeated,
  },
  {
    id: 'antenna-frame',
    title: 'Craft the antenna frame',
    hint: '5 titanium ingots and 10 iron. Then place it somewhere you can defend.',
    done: (s) => has(s, 'antenna_frame') || placed(s, 'antenna'),
  },
  {
    id: 'restore-antenna',
    title: 'Restore the antenna with copper wiring',
    hint: 'Hold wiring and interact with the frame until it reads 100%.',
    done: (s) => {
      for (const [, chunk] of s.resources) {
        for (const r of chunk) if (r.type === 'antenna' && (r.antennaProgress ?? 0) >= 100) return true;
      }
      return false;
    },
  },
  {
    id: 'broadcast',
    title: 'Install the signal core and broadcast',
    hint: 'This ends the run. Make sure you are ready.',
    done: (s) => s.progress.broadcast,
  },
];

export interface QuestView {
  /** The one the player should be doing. Null once everything is done. */
  active: Objective | null;
  activeProgress: { have: number; need: number } | null;
  /** Ids completed, in order. */
  completed: string[];
  /** The next couple, so the player can see what is coming. */
  upcoming: Objective[];
  total: number;
}

/**
 * Work out the current objective.
 *
 * Completion is sticky: once an objective has been satisfied it stays done even
 * if the player later spends the item. Without that, the log would un-complete
 * "craft a stone pickaxe" the moment the pickaxe broke, which reads as a bug.
 */
export function evaluateQuests(state: GameState): QuestView {
  const done = new Set(state.questsDone);

  for (const objective of OBJECTIVES) {
    if (!done.has(objective.id) && objective.done(state)) {
      state.questsDone.push(objective.id);
      done.add(objective.id);
    }
  }

  const active = OBJECTIVES.find((o) => !done.has(o.id)) ?? null;
  const activeIndex = active ? OBJECTIVES.indexOf(active) : OBJECTIVES.length;

  return {
    active,
    activeProgress: active?.progress ? active.progress(state) : null,
    completed: OBJECTIVES.filter((o) => done.has(o.id)).map((o) => o.id),
    upcoming: OBJECTIVES.slice(activeIndex + 1, activeIndex + 3),
    total: OBJECTIVES.length,
  };
}

/** Did this tick complete something? Used to fire a notification. */
export function newlyCompleted(before: string[], after: string[]): string[] {
  const seen = new Set(before);
  return after.filter((id) => !seen.has(id));
}
