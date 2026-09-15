import { describe, expect, it } from 'vitest';
import { OBJECTIVES, evaluateQuests } from '../quests';
import { createGameState } from '../../core/GameState';
import type { GameState, InventorySlot, Resource } from '../../core/types';

function give(s: GameState, slots: InventorySlot[]) {
  slots.forEach((slot, i) => {
    s.player.inventory[i] = slot;
  });
}

function place(s: GameState, type: string) {
  s.resources.set('0,0', [{ id: 'x', x: 0, y: 0, type, hits: 0, maxHits: 1, scale: 1, opacity: 1 } as Resource]);
}

describe('objective chain', () => {
  it('starts on the first objective', () => {
    const view = evaluateQuests(createGameState());
    expect(view.active?.id).toBe('gather-wood');
    expect(view.completed).toHaveLength(0);
  });

  it('advances as the world changes, without anything being handed in', () => {
    const s = createGameState();
    give(s, [{ type: 'wood', count: 10 }]);
    expect(evaluateQuests(s).active?.id).toBe('workbench');

    place(s, 'workbench');
    expect(evaluateQuests(s).active?.id).toBe('stone-tools');

    give(s, [{ type: 'wood', count: 10 }, { type: 'stone_pickaxe', count: 1 }]);
    expect(evaluateQuests(s).active?.id).toBe('furnace');
  });

  it('accepts any tool of a tier, not one specific recipe', () => {
    const s = createGameState();
    give(s, [{ type: 'wood', count: 10 }, { type: 'titanium_pickaxe', count: 1 }]);
    place(s, 'workbench');
    const view = evaluateQuests(s);
    expect(view.completed).toContain('stone-tools');
  });

  it('stays completed after the item is spent', () => {
    const s = createGameState();
    give(s, [{ type: 'wood', count: 10 }, { type: 'stone_pickaxe', count: 1 }]);
    place(s, 'workbench');
    evaluateQuests(s);
    expect(s.questsDone).toContain('stone-tools');

    // Spend everything: the log must not un-complete.
    s.player.inventory = s.player.inventory.map(() => null);
    const view = evaluateQuests(s);
    expect(view.completed).toContain('stone-tools');
  });

  it('tracks dungeon progress from run statistics', () => {
    const s = createGameState();
    s.progress.deepestDepth = 1;
    evaluateQuests(s);
    expect(s.questsDone).toContain('enter-dungeon');

    s.progress.chestsLooted = 2;
    evaluateQuests(s);
    expect(s.questsDone).toContain('loot-chest');
  });

  it('gates the ending behind the Warden and a restored antenna', () => {
    const s = createGameState();
    s.progress.deepestDepth = 3;
    evaluateQuests(s);
    expect(s.questsDone).not.toContain('warden');

    s.progress.wardenDefeated = true;
    evaluateQuests(s);
    expect(s.questsDone).toContain('warden');
  });

  it('completes only when the antenna actually reads 100%', () => {
    const s = createGameState();
    s.resources.set('0,0', [
      { id: 'a', x: 0, y: 0, type: 'antenna', hits: 0, maxHits: 1, scale: 1, opacity: 1, antennaProgress: 60 } as Resource,
    ]);
    evaluateQuests(s);
    expect(s.questsDone).not.toContain('restore-antenna');

    s.resources.get('0,0')![0].antennaProgress = 100;
    evaluateQuests(s);
    expect(s.questsDone).toContain('restore-antenna');
  });

  it('finishes when the broadcast fires', () => {
    const s = createGameState();
    for (const o of OBJECTIVES) s.questsDone.push(o.id);
    s.questsDone.pop();
    s.progress.broadcast = true;
    const view = evaluateQuests(s);
    expect(view.active).toBeNull();
    expect(view.completed).toHaveLength(OBJECTIVES.length);
  });

  it('reports progress for counted objectives', () => {
    const s = createGameState();
    give(s, [{ type: 'wood', count: 4 }]);
    const view = evaluateQuests(s);
    expect(view.activeProgress).toEqual({ have: 4, need: 10 });
  });

  it('every objective has a distinct id', () => {
    expect(new Set(OBJECTIVES.map((o) => o.id)).size).toBe(OBJECTIVES.length);
  });
});
