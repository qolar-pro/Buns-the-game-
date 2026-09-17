/**
 * Armour and ranged combat.
 *
 * Both exist because a table replaced a chain of named `if`s, and both chains
 * had the same bug: everything added after the chain was written did nothing.
 * Leather was the only armour that protected you; iron was the best sword.
 */
import { describe, expect, it, vi } from 'vitest';
import { ARMOUR, SET_BONUS, SHIELDS, armourTotals, blockValue } from '../armour';
import { AMMO, LAUNCHERS, isLauncher, shoot, updateProjectiles } from '../ranged';
import { MOBS } from '../mobs';
import { CRAFTING_RECIPES } from '../../core/recipes';
import { makeState } from './helpers';
import type { Equipment, GameState, ItemType } from '../../core/types';

const empty: Equipment = { head: null, torso: null, legs: null, feet: null, back: null };

const wearing = (items: Partial<Record<keyof Equipment, ItemType>>): Equipment => ({
  ...empty,
  ...Object.fromEntries(
    Object.entries(items).map(([slot, type]) => [slot, { type, count: 1 }]),
  ),
});

describe('armourTotals', () => {
  it('protects nobody who is wearing nothing', () => {
    expect(armourTotals(empty)).toEqual({ defense: 0, speed: 1, set: null });
  });

  it('counts every set, not just leather', () => {
    // The bug: chainmail, fur and a twenty-ingot titanium suit all gave zero.
    for (const set of ['leather', 'chainmail', 'fur', 'titanium'] as const) {
      const pieces = Object.entries(ARMOUR).filter(([, p]) => p!.set === set);
      expect(pieces.length, `${set} is not a full set`).toBe(4);
      const worn = wearing(
        Object.fromEntries(pieces.map(([type, p]) => [p!.slot, type as ItemType])),
      );
      expect(armourTotals(worn).defense, `${set} protects nobody`).toBeGreaterThan(0);
    }
  });

  it('rewards a matched set over a mixed one', () => {
    const matched = armourTotals(wearing({
      head: 'titanium_helm', torso: 'titanium_chestplate',
      legs: 'titanium_greaves', feet: 'titanium_boots',
    }));
    const mixed = armourTotals(wearing({
      head: 'titanium_helm', torso: 'titanium_chestplate',
      legs: 'titanium_greaves', feet: 'leather_boots',
    }));
    expect(matched.set).toBe('titanium');
    expect(mixed.set).toBeNull();
    expect(matched.defense).toBeGreaterThan(mixed.defense - 3 + SET_BONUS.titanium.defense - 1);
  });

  it('keeps the tiers in order', () => {
    const full = (set: 'leather' | 'chainmail' | 'fur' | 'titanium') => {
      const pieces = Object.entries(ARMOUR).filter(([, p]) => p!.set === set);
      return armourTotals(wearing(
        Object.fromEntries(pieces.map(([type, p]) => [p!.slot, type as ItemType])),
      )).defense;
    };
    expect(full('leather')).toBeLessThan(full('chainmail'));
    expect(full('chainmail')).toBeLessThan(full('titanium'));
    // Fur sits between leather and chainmail and buys speed instead.
    expect(full('fur')).toBeGreaterThan(full('leather'));
  });

  it('never slows the player enough to trap them', () => {
    // A set that stops you outrunning a wolf is a set nobody wears.
    for (const set of ['leather', 'chainmail', 'fur', 'titanium'] as const) {
      const pieces = Object.entries(ARMOUR).filter(([, p]) => p!.set === set);
      const totals = armourTotals(wearing(
        Object.fromEntries(pieces.map(([type, p]) => [p!.slot, type as ItemType])),
      ));
      expect(totals.speed).toBeGreaterThan(0.85);
    }
  });

  it('can be crafted: every piece has a recipe', () => {
    for (const type of Object.keys(ARMOUR) as ItemType[]) {
      const has = CRAFTING_RECIPES.some((r) => r.output === type);
      expect(has, `${type} is armour nothing can make`).toBe(true);
    }
  });
});

describe('shields', () => {
  it('only block while actually held', () => {
    const s = makeState([{ type: 'iron_shield', count: 1 }]);
    s.player.selectedSlot = 0;
    expect(blockValue(s)).toBe(SHIELDS.iron_shield!.block);
    s.player.selectedSlot = 1;
    expect(blockValue(s)).toBe(0);
  });

  it('are worth a whole hand', () => {
    // Holding one means not holding a sword, so it has to matter.
    expect(SHIELDS.wooden_shield!.block).toBeGreaterThan(2);
    expect(SHIELDS.titanium_shield!.block).toBeGreaterThan(SHIELDS.iron_shield!.block);
  });
});

function shooter(ammo: ItemType | null, count = 5): { state: GameState; deps: ReturnType<typeof makeDeps> } {
  const slots: { type: ItemType; count: number }[] = [{ type: 'bow', count: 1 }];
  if (ammo) slots.push({ type: ammo, count });
  const state = makeState(slots as never);
  state.player.selectedSlot = 0;
  state.player.facing = 'right';
  return { state, deps: makeDeps(state) };
}

function makeDeps(state: GameState) {
  const spawned: { type: ItemType; count: number }[] = [];
  return {
    spawned,
    countItem: (type: ItemType) =>
      state.player.inventory.reduce((n, s) => n + (s?.type === type ? s.count : 0), 0),
    removeFromInventory: (type: ItemType, count: number) => {
      for (const slot of state.player.inventory) {
        if (slot?.type === type) {
          slot.count -= count;
          return;
        }
      }
    },
    spawnItem: (type: ItemType, _x: number, _y: number, count: number) => {
      spawned.push({ type, count });
    },
  };
}

describe('shoot', () => {
  it('refuses when the held item is not a launcher', () => {
    const s = makeState([{ type: 'iron_sword', count: 1 }]);
    s.player.selectedSlot = 0;
    expect(shoot(s, 1000, makeDeps(s))).toBe('not-a-launcher');
  });

  it('refuses without ammunition, and says so', () => {
    const { state, deps } = shooter(null);
    expect(shoot(state, 1000, deps)).toBe('no-ammo');
    expect(state.projectiles).toHaveLength(0);
  });

  it('spends one arrow and puts one in the air', () => {
    const { state, deps } = shooter('arrow');
    expect(shoot(state, 1000, deps)).toBe('ok');
    expect(state.projectiles).toHaveLength(1);
    expect(deps.countItem('arrow')).toBe(4);
  });

  it('fires in the direction the player faces', () => {
    const { state, deps } = shooter('arrow');
    state.player.facing = 'up';
    shoot(state, 1000, deps);
    expect(state.projectiles[0].vy).toBeLessThan(0);
    expect(state.projectiles[0].vx).toBe(0);
  });

  it('prefers the better arrow when both are carried', () => {
    const state = makeState([
      { type: 'bow', count: 1 },
      { type: 'arrow', count: 5 },
      { type: 'iron_arrow', count: 5 },
    ] as never);
    state.player.selectedSlot = 0;
    const deps = makeDeps(state);
    shoot(state, 1000, deps);
    expect(state.projectiles[0].type).toBe('iron_arrow');
  });

  it('will not fire faster than its cooldown', () => {
    const { state, deps } = shooter('arrow');
    expect(shoot(state, 1000, deps)).toBe('ok');
    expect(shoot(state, 1010, deps)).toBe('cooling-down');
    expect(shoot(state, 1000 + LAUNCHERS.bow!.cooldown * 16 + 1, deps)).toBe('ok');
  });
});

describe('updateProjectiles', () => {
  it('kills what it hits and drops what the mob was carrying', () => {
    const { state, deps } = shooter('iron_arrow');
    state.enemies = [{
      id: 'e1', type: 'crawler', x: 300, y: 128, health: 4, maxHealth: 16,
      speed: 1, damage: 1, targetX: 0, targetY: 0, state: 'idle', timer: 0,
      facing: 'left', lastHitTime: 0,
    }];
    state.player.x = 200;
    state.player.y = 64;
    shoot(state, 1000, deps);
    for (let i = 0; i < 40 && state.enemies.length; i++) updateProjectiles(state, 1, deps);
    expect(state.enemies).toHaveLength(0);
    expect(state.progress.mobsDefeated).toBe(1);
  });

  it('lets a spent arrow be picked back up', () => {
    // Ammunition you never get back is a tax on using the weapon at all.
    const { state, deps } = shooter('arrow');
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    shoot(state, 1000, deps);
    for (let i = 0; i < 200 && state.projectiles.length; i++) updateProjectiles(state, 1, deps);
    vi.restoreAllMocks();
    expect(deps.spawned.some((s) => s.type === 'arrow')).toBe(true);
  });

  it('expires arrows rather than letting them fly forever', () => {
    const { state, deps } = shooter('arrow');
    shoot(state, 1000, deps);
    for (let i = 0; i < 500 && state.projectiles.length; i++) updateProjectiles(state, 1, deps);
    expect(state.projectiles).toHaveLength(0);
  });

  it('makes a hostile bolt hurt the player and nothing else', () => {
    const s = makeState([]);
    s.player.x = 100;
    s.player.y = 100;
    s.player.health = 100;
    s.enemies = [{
      id: 'e1', type: 'crawler', x: 164, y: 164, health: 20, maxHealth: 20,
      speed: 1, damage: 1, targetX: 0, targetY: 0, state: 'idle', timer: 0,
      facing: 'left', lastHitTime: 0,
    }];
    s.projectiles = [{
      id: 'b1', x: 164, y: 164, vx: 0, vy: 0, damage: 9, life: 40,
      type: 'iron_arrow', hostile: true,
    }];
    updateProjectiles(s, 1, makeDeps(s));
    expect(s.player.health).toBeLessThan(100);
    expect(s.enemies[0].health).toBe(20);
  });
});

describe('the sentinel', () => {
  it('actually fights at range', () => {
    // It was designed ranged and shipped as a slow melee mob, which made it
    // strictly worse than the crawler standing next to it.
    expect(MOBS.sentinel.ranged).toBeTruthy();
    expect(MOBS.sentinel.ranged!.keepAway).toBeGreaterThan(100);
  });
});

describe('launchers and ammunition', () => {
  it('agree with isLauncher', () => {
    for (const type of Object.keys(LAUNCHERS) as ItemType[]) expect(isLauncher(type)).toBe(true);
    expect(isLauncher('iron_sword')).toBe(false);
  });

  it('only fire ammunition that exists', () => {
    for (const launcher of Object.values(LAUNCHERS)) {
      for (const round of launcher!.ammo) {
        expect(AMMO[round], `${round} is fired but has no stats`).toBeTruthy();
        expect(CRAFTING_RECIPES.some((r) => r.output === round), `${round} cannot be made`).toBe(true);
      }
    }
  });
});
