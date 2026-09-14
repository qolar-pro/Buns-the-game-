'use client';

/**
 * Inventory, crafting, chest and furnace overlays.
 *
 * Moved out of components/Game.tsx unchanged in behaviour. They were already
 * React DOM; with the canvas HUD gone these are the only UI implementation, so
 * the game has one visual language instead of two.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { HOTBAR_SLOTS, MAIN_INV_ROWS } from '@/src/game/core/config';
import { CRAFTING_RECIPES } from '@/src/game/core/recipes';
import { FRAMES } from '@/src/game/assets/frames';
import { ItemIcon } from './ItemIcon';
import type {
  EquipmentSlotName, GameState, Ingredient, InventorySlot, Recipe, Resource,
} from '@/src/game/core/types';

/** First cell of the player sheet, used for the equipment paper doll. */
const PLAYER_FRAME = FRAMES['characters/player'];

export const InventoryOverlay = ({ state, refreshUI, onClose }: { state: GameState, refreshUI: () => void, onClose: () => void }) => {
  const [draggedItem, setDraggedItem] = useState<{ index: number, from: 'inventory' | 'equipment' | 'chest' | 'furnace', slot?: string } | null>(null);

  const handleDrop = (toIndex: number, to: 'inventory' | 'equipment' | 'chest' | 'furnace', toSlot?: string) => {
    if (!draggedItem) return;

    const { index: fromIndex, from, slot: fromSlot } = draggedItem;
    
    let itemToMove: InventorySlot | null = null;
    
    // Get item from source
    if (from === 'inventory') {
      itemToMove = state.player.inventory[fromIndex];
    } else if (from === 'equipment' && fromSlot) {
      itemToMove = state.player.equipment[fromSlot as EquipmentSlotName];
    } else if (from === 'chest' || from === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        itemToMove = openChest.inventory[fromIndex];
      }
    }

    if (!itemToMove) return;

    // Logic for moving item
    // This is a simplified version, you might want to handle stacking etc.
    
    // Remove from source
    if (from === 'inventory') {
      state.player.inventory[fromIndex] = null;
    } else if (from === 'equipment' && fromSlot) {
      state.player.equipment[fromSlot as EquipmentSlotName] = null;
    } else if (from === 'chest' || from === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        openChest.inventory[fromIndex] = null;
      }
    }

    // Add to destination
    if (to === 'inventory') {
      const existing = state.player.inventory[toIndex];
      if (existing && existing.type === itemToMove.type) {
        existing.count += itemToMove.count;
      } else {
        state.player.inventory[toIndex] = itemToMove;
      }
    } else if (to === 'equipment' && toSlot) {
      // Check if item is armor/backpack
      const isArmor = itemToMove.type.includes('leather_') && !itemToMove.type.includes('backpack');
      const isBackpack = itemToMove.type === 'leather_backpack';
      
      if ((isArmor && toSlot !== 'back') || (isBackpack && toSlot === 'back')) {
         state.player.equipment[toSlot as EquipmentSlotName] = itemToMove;
      } else {
        // Return to inventory if invalid slot
        // For now just swap or something
      }
    } else if (to === 'chest' || to === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        openChest.inventory[toIndex] = itemToMove;
      }
    }

    setDraggedItem(null);
    refreshUI();
  };

  const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
  const currentInvRows = state.player.equipment.back ? MAIN_INV_ROWS + 2 : MAIN_INV_ROWS;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-8"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="flex flex-col gap-4 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crafting & Chest Panel */}
        <div className="bg-[#8b5a2b] p-6 relative flex flex-col gap-4"
             style={{
               boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 12px 12px 0px 0px rgba(0,0,0,0.3)',
               minWidth: '800px'
             }}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-mono font-bold text-[#2D1B0A] uppercase tracking-wider">
              {openChest ? (openChest.type === 'furnace' ? 'Inventory & Furnace' : 'Inventory & Chest') : (state.isWorkbenchOpen ? 'Inventory & Workbench' : 'Inventory & Crafting')}
            </h2>
            <button onClick={onClose} className="text-[#8B0000] text-2xl font-bold hover:scale-110 transition-transform">X</button>
          </div>

          <div className="h-64 overflow-y-auto pr-2 custom-scrollbar">
            {openChest ? (
              openChest.type === 'furnace' ? (
                <FurnaceUI 
                  furnace={openChest} 
                  handleDrop={handleDrop} 
                  setDraggedItem={setDraggedItem} 
                />
              ) : (
                <div className="grid grid-cols-9 gap-2">
                  {(openChest.inventory || Array(27).fill(null)).map((slot, i) => (
                    <SlotUI key={i} slot={slot} onDrop={() => handleDrop(i, 'chest')} onDragStart={() => setDraggedItem({ index: i, from: 'chest' })} />
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {CRAFTING_RECIPES.map((recipe) => (
                  <RecipeUI key={recipe.id} recipe={recipe} state={state} refreshUI={refreshUI} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          {/* Equipment Panel */}
          <div className="bg-[#8b5a2b] p-6 flex flex-col items-center gap-4 w-64"
               style={{
                 boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
               }}>
            <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase">Equipment</h2>
            <div className="relative w-full h-64 flex items-center justify-center">
               {/* Paper Doll */}
               <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                  {/* Paper doll: the player sheet's first cell, taken from the atlas. */}
                  <div
                    className="w-32 h-32 pixelated"
                    style={{
                      backgroundImage: `url(/sprites/${PLAYER_FRAME.atlas}.png)`,
                      backgroundPosition: `-${PLAYER_FRAME.x}px -${PLAYER_FRAME.y}px`,
                      backgroundRepeat: 'no-repeat',
                      imageRendering: 'pixelated',
                    }}
                  />
               </div>
               
               {/* Slots around player */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.head} label="Head" onDrop={() => handleDrop(0, 'equipment', 'head')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'head' })} />
               </div>
               <div className="absolute top-1/2 left-0 -translate-y-1/2">
                 <SlotUI slot={state.player.equipment.torso} label="Torso" onDrop={() => handleDrop(0, 'equipment', 'torso')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'torso' })} />
               </div>
               <div className="absolute top-1/2 right-0 -translate-y-1/2">
                 <SlotUI slot={state.player.equipment.back} label="Back" onDrop={() => handleDrop(0, 'equipment', 'back')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'back' })} />
               </div>
               <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.legs} label="Legs" onDrop={() => handleDrop(0, 'equipment', 'legs')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'legs' })} />
               </div>
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.feet} label="Feet" onDrop={() => handleDrop(0, 'equipment', 'feet')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'feet' })} />
               </div>
            </div>
            <div className="text-[#2D1B0A] font-mono text-sm font-bold">Defense: {state.player.defense}</div>
          </div>

          {/* Inventory Panel */}
          <div className="bg-[#8b5a2b] p-6 flex-1"
               style={{
                 boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
               }}>
            <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase mb-4">Inventory</h2>
            <div className="grid grid-cols-9 gap-2">
              {state.player.inventory.slice(HOTBAR_SLOTS, HOTBAR_SLOTS + currentInvRows * 9).map((slot, i) => (
                <SlotUI key={i} slot={slot} onDrop={() => handleDrop(i + HOTBAR_SLOTS, 'inventory')} onDragStart={() => setDraggedItem({ index: i + HOTBAR_SLOTS, from: 'inventory' })} />
              ))}
            </div>
          </div>
        </div>

        {/* Hotbar Panel */}
        <div className="bg-[#8b5a2b] p-6"
             style={{
               boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
             }}>
          <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase mb-4">Hotbar</h2>
          <div className="flex gap-2 justify-center">
            {state.player.inventory.slice(0, HOTBAR_SLOTS).map((slot, i) => (
              <SlotUI key={i} slot={slot} isSelected={state.player.selectedSlot === i} onDrop={() => handleDrop(i, 'inventory')} onDragStart={() => setDraggedItem({ index: i, from: 'inventory' })} />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const SlotUI = ({ slot, label, onDrop, onDragStart, isSelected }: {
  slot: InventorySlot | null | undefined;
  label?: string;
  onDrop?: () => void;
  onDragStart?: () => void;
  isSelected?: boolean;
}) => {
  return (
    <div 
      className={`w-16 h-16 bg-black/20 border-2 border-black/40 flex items-center justify-center relative ${isSelected ? 'border-white/60 bg-white/10' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {label && !slot && <span className="text-white/30 text-[10px] uppercase font-mono">{label}</span>}
      {slot && (
        <motion.div
          draggable
          onDragStart={onDragStart}
          className="w-14 h-14 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <ItemIcon type={slot.type} size={56} />
          <span className="absolute bottom-1 right-1 text-white text-xs font-bold pointer-events-none" style={{ textShadow: '1px 1px 2px black' }}>
            {slot.count}
          </span>
        </motion.div>
      )}
    </div>
  );
};

export const RecipeUI = ({ recipe, state, refreshUI }: {
  recipe: Recipe;
  state: GameState;
  refreshUI: () => void;
}) => {
  const hasIngredients = (ingredients: { type: string, count: number }[]) => {
    return ingredients.every(ing => {
      const count = state.player.inventory.reduce((acc: number, slot: InventorySlot | null) => acc + (slot?.type === ing.type ? slot.count : 0), 0);
      return count >= ing.count;
    });
  };

  const canCraft = hasIngredients(recipe.ingredients) && (!recipe.requiresWorkbench || state.isWorkbenchOpen);

  const handleCraft = () => {
    if (!canCraft) return;

    // Remove ingredients
    recipe.ingredients.forEach((ing: Ingredient) => {
      let remaining = ing.count;
      for (let i = 0; i < state.player.inventory.length; i++) {
        const slot = state.player.inventory[i];
        if (slot?.type === ing.type) {
          const take = Math.min(remaining, slot.count);
          slot.count -= take;
          remaining -= take;
          if (slot.count <= 0) state.player.inventory[i] = null;
          if (remaining <= 0) break;
        }
      }
    });

    // Add output
    let remainingOutput = recipe.count;
    for (let i = 0; i < state.player.inventory.length; i++) {
      const slot = state.player.inventory[i];
      if (slot?.type === recipe.output && slot.count < 64) {
        const add = Math.min(remainingOutput, 64 - slot.count);
        slot.count += add;
        remainingOutput -= add;
        if (remainingOutput <= 0) break;
      } else if (!slot) {
        state.player.inventory[i] = { type: recipe.output, count: Math.min(remainingOutput, 64) };
        remainingOutput -= state.player.inventory[i]!.count;
        if (remainingOutput <= 0) break;
      }
    }

    refreshUI();
  };

  return (
    <div 
      onClick={handleCraft}
      className={`p-2 flex gap-3 items-center border-2 border-black/40 cursor-pointer transition-colors ${canCraft ? 'bg-black/10 hover:bg-black/20' : 'bg-black/30 opacity-60 cursor-not-allowed'}`}
    >
      <ItemIcon type={recipe.output} size={40} />
      <div className="flex flex-col">
        <span className="text-[#2D1B0A] font-mono font-bold text-xs uppercase">{recipe.id.replace('_', ' ')}</span>
        <span className="text-[#2D1B0A] font-mono text-[9px] opacity-70">
          {recipe.ingredients.map((ing: Ingredient) => `${ing.count} ${ing.type}`).join(', ')}
        </span>
      </div>
    </div>
  );
};

export const FurnaceUI = ({ furnace, handleDrop, setDraggedItem }: {
  furnace: Resource;
  handleDrop: (index: number, target: 'furnace') => void;
  setDraggedItem: (v: { index: number; from: 'furnace' }) => void;
}) => {
  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <div className="flex items-center gap-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/50 text-[10px] uppercase font-mono">Input</span>
            <SlotUI 
              slot={furnace.inventory?.[0]} 
              onDrop={() => handleDrop(0, 'furnace')} 
              onDragStart={() => setDraggedItem({ index: 0, from: 'furnace' })} 
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/50 text-[10px] uppercase font-mono">Fuel</span>
            <SlotUI 
              slot={furnace.inventory?.[1]} 
              onDrop={() => handleDrop(1, 'furnace')} 
              onDragStart={() => setDraggedItem({ index: 1, from: 'furnace' })} 
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-32 h-6 bg-black/40 border-2 border-black/60 relative overflow-hidden">
            {(furnace.smeltTimer ?? 0) > 0 && (
              <motion.div 
                className="absolute inset-y-0 left-0 bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${((furnace.smeltTimer ?? 0) / 600) * 100}%` }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
              />
            )}
          </div>
          <div className="text-orange-500 text-[10px] font-mono font-bold uppercase animate-pulse">Smelting...</div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-white/50 text-[10px] uppercase font-mono">Output</span>
          <SlotUI 
            slot={furnace.inventory?.[2]} 
            onDrop={() => handleDrop(2, 'furnace')} 
            onDragStart={() => setDraggedItem({ index: 2, from: 'furnace' })} 
          />
        </div>
      </div>

      {(furnace.fuelTimer ?? 0) > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="w-16 h-2 bg-black/40 border border-black/60 relative overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 left-0 bg-red-600"
              initial={{ width: 0 }}
              animate={{ width: `${((furnace.fuelTimer ?? 0) / (furnace.maxFuelTimer || 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            />
          </div>
          <span className="text-red-500 text-[8px] font-mono font-bold uppercase">Fuel</span>
        </div>
      )}
    </div>
  );
};
