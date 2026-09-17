/**
 * Barter.
 *
 * No currency. A coin would need a source, a sink and a price for everything,
 * and all three would have to be balanced against a game where the player can
 * mine indefinitely. Barter needs none of that: a villager wants a specific
 * thing and gives a specific thing, and the exchange rate is the design.
 *
 * What each role offers is fixed by role, not rolled per village, so a player
 * who learns "traders sell arrows" can act on it anywhere.
 */
import type { GameState, ItemType, Npc, NpcRole } from '../core/types';
import { addToInventory, countItem, removeFromInventory } from './inventory';

export interface Offer {
  id: string;
  /** What the player hands over. */
  give: { type: ItemType; count: number };
  /** What they get back. */
  get: { type: ItemType; count: number };
}

/**
 * Stock by role.
 *
 * The villager takes raw surplus off your hands; the trader deals in things you
 * cannot easily make; the elder deals only in knowledge and rare goods, and is
 * where requests come from.
 */
export const STOCK: Record<NpcRole, Offer[]> = {
  villager: [
    { id: 'v-bread', give: { type: 'wheat', count: 3 }, get: { type: 'bread', count: 1 } },
    { id: 'v-food', give: { type: 'leather', count: 2 }, get: { type: 'cooked_beef', count: 2 } },
    { id: 'v-rope', give: { type: 'wool', count: 3 }, get: { type: 'rope', count: 2 } },
    { id: 'v-seeds', give: { type: 'wood', count: 10 }, get: { type: 'wheat_seeds', count: 4 } },
  ],
  trader: [
    // Arrows in bulk: the reason a bow is worth carrying before you find the fen.
    { id: 't-arrows', give: { type: 'iron_ingot', count: 1 }, get: { type: 'arrow', count: 12 } },
    { id: 't-fiber', give: { type: 'copper_ingot', count: 2 }, get: { type: 'plant_fiber', count: 6 } },
    { id: 't-glass', give: { type: 'sand', count: 4 }, get: { type: 'glass', count: 2 } },
    { id: 't-bandage', give: { type: 'wool', count: 2 }, get: { type: 'bandage', count: 3 } },
    { id: 't-coal', give: { type: 'wood', count: 12 }, get: { type: 'coal', count: 4 } },
  ],
  elder: [
    // The elder is the only one who parts with a map to the deep.
    { id: 'e-log', give: { type: 'glow_moss', count: 4 }, get: { type: 'survivors_log', count: 1 } },
    { id: 'e-token', give: { type: 'titanium_ingot', count: 1 }, get: { type: 'trade_token', count: 3 } },
    { id: 'e-charter', give: { type: 'trade_token', count: 5 }, get: { type: 'village_charter', count: 1 } },
  ],
};

/** Everything this person will trade. */
export function offersFor(npc: Npc): Offer[] {
  return STOCK[npc.role];
}

export type TradeResult = 'ok' | 'unknown-offer' | 'missing-goods' | 'no-room';

/**
 * Do the exchange.
 *
 * Goods are removed only once the return has somewhere to go, so a full pack
 * never eats the payment — the failure mode that makes a trade screen feel
 * like a bug rather than a refusal.
 */
export function trade(state: GameState, npc: Npc, offerId: string): TradeResult {
  const offer = offersFor(npc).find((o) => o.id === offerId);
  if (!offer) return 'unknown-offer';
  if (countItem(state, offer.give.type) < offer.give.count) return 'missing-goods';

  removeFromInventory(state, offer.give.type, offer.give.count);
  if (!addToInventory(state, offer.get.type, offer.get.count)) {
    // Put it back rather than charging for nothing.
    addToInventory(state, offer.give.type, offer.give.count);
    return 'no-room';
  }
  return 'ok';
}
