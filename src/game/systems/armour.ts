/**
 * Armour.
 *
 * Defence used to be four `if` statements naming the four leather pieces, which
 * meant every other set in the game — chainmail, fur, the titanium suit that
 * costs twenty ingots — gave exactly zero protection. The recipes existed; the
 * armour did not.
 *
 * A table fixes that, and makes the shape of the progression visible in one
 * place: leather is cheap, chainmail is the iron-age middle, fur is the snow's
 * reward and trades a little protection for speed, and titanium is the end.
 */
import type { Equipment, EquipmentSlotName, GameState, ItemType } from '../core/types';

export type ArmourSet = 'leather' | 'chainmail' | 'fur' | 'titanium';

export interface ArmourPiece {
  slot: EquipmentSlotName;
  set: ArmourSet;
  /** Flat damage reduction. */
  defense: number;
  /** Multiplier on movement speed. Heavy armour costs you something. */
  speed: number;
}

export const ARMOUR: Partial<Record<ItemType, ArmourPiece>> = {
  leather_cap: { slot: 'head', set: 'leather', defense: 1, speed: 1 },
  leather_tunic: { slot: 'torso', set: 'leather', defense: 3, speed: 1 },
  leather_pants: { slot: 'legs', set: 'leather', defense: 2, speed: 1 },
  leather_boots: { slot: 'feet', set: 'leather', defense: 1, speed: 1 },

  chainmail_coif: { slot: 'head', set: 'chainmail', defense: 3, speed: 0.99 },
  chainmail_hauberk: { slot: 'torso', set: 'chainmail', defense: 6, speed: 0.97 },
  chainmail_chausses: { slot: 'legs', set: 'chainmail', defense: 4, speed: 0.98 },
  iron_boots: { slot: 'feet', set: 'chainmail', defense: 2, speed: 0.98 },

  // Warm, light, and available long before titanium — the White Waste is worth
  // the walk on its own rather than only as a stop on the way to the end.
  fur_cap: { slot: 'head', set: 'fur', defense: 2, speed: 1 },
  fur_coat: { slot: 'torso', set: 'fur', defense: 5, speed: 1 },
  fur_leggings: { slot: 'legs', set: 'fur', defense: 3, speed: 1 },
  fur_boots: { slot: 'feet', set: 'fur', defense: 2, speed: 1.03 },

  titanium_helm: { slot: 'head', set: 'titanium', defense: 5, speed: 0.99 },
  titanium_chestplate: { slot: 'torso', set: 'titanium', defense: 9, speed: 0.96 },
  titanium_greaves: { slot: 'legs', set: 'titanium', defense: 6, speed: 0.97 },
  titanium_boots: { slot: 'feet', set: 'titanium', defense: 3, speed: 0.98 },
};

/** What wearing all four pieces of a set is worth beyond the sum. */
export interface SetBonus {
  defense: number;
  speed: number;
  /** Shown in the inventory so the player knows why they should match. */
  label: string;
}

export const SET_BONUS: Record<ArmourSet, SetBonus> = {
  leather: { defense: 1, speed: 1.02, label: 'Supple: +1 defence, a little quicker' },
  chainmail: { defense: 3, speed: 1, label: 'Riveted: +3 defence' },
  // The fen and the waste reward mobility rather than raw plate.
  fur: { defense: 2, speed: 1.08, label: 'Sure-footed: +2 defence, noticeably quicker' },
  titanium: { defense: 6, speed: 1.02, label: 'Sealed: +6 defence, the weight stops mattering' },
};

export interface ArmourTotals {
  defense: number;
  /** Multiplier on PLAYER_SPEED. */
  speed: number;
  /** The completed set, if all four slots match. */
  set: ArmourSet | null;
}

const SLOTS: EquipmentSlotName[] = ['head', 'torso', 'legs', 'feet'];

/**
 * Total protection from what is worn.
 *
 * Speed multiplies rather than adds so a full suit of titanium is heavy but
 * never immobilising: a set that stops you outrunning a wolf is a set nobody
 * wears, however good its numbers look.
 */
export function armourTotals(equipment: Equipment): ArmourTotals {
  let defense = 0;
  let speed = 1;
  const sets: ArmourSet[] = [];

  for (const slot of SLOTS) {
    const worn = equipment[slot];
    const piece = worn ? ARMOUR[worn.type] : undefined;
    if (!piece) continue;
    defense += piece.defense;
    speed *= piece.speed;
    sets.push(piece.set);
  }

  const complete = sets.length === SLOTS.length && sets.every((s) => s === sets[0])
    ? sets[0]
    : null;

  if (complete) {
    defense += SET_BONUS[complete].defense;
    speed *= SET_BONUS[complete].speed;
  }

  return { defense, speed, set: complete };
}

/** Shields are held, not worn, so they are their own table. */
export const SHIELDS: Partial<Record<ItemType, { block: number }>> = {
  wooden_shield: { block: 4 },
  iron_shield: { block: 8 },
  titanium_shield: { block: 14 },
};

/**
 * Damage a held shield absorbs.
 *
 * Holding a shield means not holding a sword, so blocking has to be worth a
 * whole hand. These numbers are deliberately close to a full armour set's.
 */
export function blockValue(state: GameState): number {
  const held = state.player.inventory[state.player.selectedSlot];
  if (!held) return 0;
  return SHIELDS[held.type]?.block ?? 0;
}

/** True when this item goes in an armour slot. */
export function armourSlotFor(type: ItemType): EquipmentSlotName | null {
  return ARMOUR[type]?.slot ?? null;
}
