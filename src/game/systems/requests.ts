/**
 * Village requests.
 *
 * Side objectives, as opposed to the main chain in `quests.ts`: a villager
 * wants a specific thing and pays in gear you would otherwise have to go a long
 * way for. They exist so that the loot you already have has somewhere to go on
 * a day you do not feel like going down a hole.
 *
 * Which requests a village offers is derived from its id, so it is stable
 * across visits without being stored, and two villages rarely want the same
 * thing. Completion is stored, because that genuinely is player progress.
 */
import type { GameState, ItemType } from '../core/types';
import { countItem, addToInventory, removeFromInventory } from './inventory';

export interface RequestTemplate {
  key: string;
  want: { type: ItemType; count: number };
  reward: { type: ItemType; count: number };
  /** Said by the villager. First person; they are asking you. */
  text: string;
}

/**
 * The pool.
 *
 * Every reward is either a biome material from somewhere else or a piece of
 * gear, so a request is always a shortcut past a journey rather than a payout
 * of something you already farm.
 */
export const REQUESTS: RequestTemplate[] = [
  {
    key: 'timber',
    want: { type: 'wood', count: 30 },
    reward: { type: 'trade_token', count: 2 },
    text: 'The hall roof is going. Thirty timber and I can patch it before the rains.',
  },
  {
    key: 'iron',
    want: { type: 'iron_ingot', count: 5 },
    reward: { type: 'chainmail_hauberk', count: 1 },
    text: 'Bring me five iron bars and the smith will hang a hauberk on you before you leave.',
  },
  {
    key: 'fur',
    want: { type: 'thick_fur', count: 4 },
    reward: { type: 'trade_token', count: 4 },
    text: 'Four thick pelts. The winter came early and half of us are still in linen.',
  },
  {
    key: 'fiber',
    want: { type: 'plant_fiber', count: 10 },
    reward: { type: 'bow', count: 1 },
    text: 'Ten bundles of cactus fibre and I will string you a bow with what is left over.',
  },
  {
    key: 'food',
    want: { type: 'cooked_beef', count: 6 },
    reward: { type: 'trade_token', count: 3 },
    text: 'Six cooked portions for the store room. We eat before we build.',
  },
  {
    key: 'coal',
    want: { type: 'coal', count: 12 },
    reward: { type: 'lantern', count: 1 },
    text: 'Twelve coal keeps the forge lit a week. I will part with a lantern for it.',
  },
  {
    key: 'moss',
    want: { type: 'glow_moss', count: 6 },
    reward: { type: 'trade_token', count: 3 },
    text: 'Fen moss, six clumps. It lights the cellar without setting fire to it.',
  },
  {
    key: 'scrap',
    want: { type: 'scrap_metal', count: 15 },
    reward: { type: 'iron_shield', count: 1 },
    text: 'Fifteen scrap from below. There is a shield in it for you.',
  },
  {
    key: 'crystal',
    want: { type: 'frost_crystal', count: 5 },
    reward: { type: 'power_cell', count: 1 },
    text: 'Five frost crystals. We have something that needs the cold to hold a charge.',
  },
];

export interface VillageRequest extends RequestTemplate {
  /** Unique per village, so two villages can want the same thing. */
  id: string;
  done: boolean;
  have: number;
}

/** Stable small hash, so a village's requests never shuffle between visits. */
function hashId(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** How many a single village offers at once. */
const PER_VILLAGE = 2;

/** The requests this village is asking for right now. */
export function requestsFor(state: GameState, village: string): VillageRequest[] {
  const base = hashId(village);
  const out: VillageRequest[] = [];
  for (let i = 0; i < PER_VILLAGE; i++) {
    const template = REQUESTS[(base + i * 7) % REQUESTS.length];
    const id = `${village}:${template.key}`;
    out.push({
      ...template,
      id,
      done: state.requestsDone.includes(id),
      have: countItem(state, template.want.type),
    });
  }
  return out;
}

export type HandInResult = 'ok' | 'unknown' | 'already-done' | 'missing-goods' | 'no-room';

/** Hand in a request. */
export function handIn(state: GameState, village: string, requestId: string): HandInResult {
  const request = requestsFor(state, village).find((r) => r.id === requestId);
  if (!request) return 'unknown';
  if (request.done) return 'already-done';
  if (countItem(state, request.want.type) < request.want.count) return 'missing-goods';

  removeFromInventory(state, request.want.type, request.want.count);
  if (!addToInventory(state, request.reward.type, request.reward.count)) {
    addToInventory(state, request.want.type, request.want.count);
    return 'no-room';
  }
  state.requestsDone.push(requestId);
  return 'ok';
}
