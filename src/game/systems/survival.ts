/**
 * Survival: hunger, eating, armour, starvation, the day/night clock,
 * furnace ticking and particle decay.
 *
 * Split out of the gameplay tick to keep it under 500 lines. Pure: given state
 * and dt it mutates state and nothing else.
 */
import { PLAYER_SIZE } from '../core/config';
import { soundManager } from '../../../lib/SoundManager';
import { nightStrength } from '../render/LightingRenderer';
import { updateSmelting } from './smelting';
import type { GameState, ItemType } from '../core/types';

export interface SurvivalDeps {
  removeFromInventory: (type: ItemType, count: number) => boolean;
}

/**
 * Advance the survival systems by `dt` ticks.
 *
 * `now` is passed in so every system in one tick agrees on the time, as they
 * did when this ran inline.
 */
/** Last night level seen, so the sting fires on the turn rather than every tick. */
let wasNight = false;
/** Throttles the low-health heartbeat to a believable rate. */
let lastHeartbeat = 0;

/** Below this health, the heartbeat starts. */
const CRITICAL_HEALTH = 25;
const HEARTBEAT_INTERVAL_MS = 900;

export function updateSurvival(
  state: GameState,
  dt: number,
  now: number,
  { removeFromInventory }: SurvivalDeps,
): void {
  const { player } = state;

  // Ambient bed follows the clock, so dusk is a crossfade rather than a cut.
  const night = nightStrength(state.time);
  soundManager.setAmbientMix(night);

  // One sting on each turn, not on every frame of the ramp.
  const isNight = night > 0.5;
  if (isNight !== wasNight) {
    soundManager.playDayNightSting(isNight);
    wasNight = isNight;
  }

  // A heartbeat while health is critical: the clearest signal that the next
  // hit matters, without taking over the screen.
  if (player.health > 0 && player.health < CRITICAL_HEALTH) {
    if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
      soundManager.playHeartbeat();
      lastHeartbeat = now;
    }
  }

  // Update defense
  let defense = 0;
  if (state.player.equipment.head?.type === 'leather_cap') defense += 1;
  if (state.player.equipment.torso?.type === 'leather_tunic') defense += 3;
  if (state.player.equipment.legs?.type === 'leather_pants') defense += 2;
  if (state.player.equipment.feet?.type === 'leather_boots') defense += 1;
  state.player.defense = defense;

  // Update Furnaces
  updateSmelting(state, dt);

  // Time progression
  state.time = (state.time + 0.08 * dt) % 1440;

  // Hunger decay
  const SPRINT_HUNGER_DECAY = 0.5 / 60; // 1 point every 2 seconds
  const NORMAL_HUNGER_DECAY = 0.01 / 60; // 1 point every 100 seconds
  const hungerDecay = player.isSprinting ? SPRINT_HUNGER_DECAY : NORMAL_HUNGER_DECAY;
  player.hunger = Math.max(0, player.hunger - hungerDecay * dt);

  // Eating logic
  if (state.isRightMouseDown && now - state.lastEatTime > 1000) {
    const selectedItem = player.inventory[player.selectedSlot];
    if (selectedItem) {
      const foodItems = ['raw_beef', 'raw_pork', 'mutton', 'raw_chicken', 'egg', 'wheat_seeds'];
      if (foodItems.includes(selectedItem.type)) {
        let healthRestore = 5;
        let hungerRestore = 10;
        if (selectedItem.type === 'wheat_seeds') {
          healthRestore = 1;
          hungerRestore = 2;
        } else if (selectedItem.type === 'egg') {
          healthRestore = 2;
          hungerRestore = 5;
        }
      
        player.health = Math.min(100, player.health + healthRestore);
        player.hunger = Math.min(100, player.hunger + hungerRestore);
        removeFromInventory(selectedItem.type, 1);
        state.message = { text: `Ate ${selectedItem.type.replace('_', ' ')}`, time: now };
        state.lastEatTime = now;
        soundManager.playEat();
      
        // Eating particles
        for (let i = 0; i < 5; i++) {
          state.particles.push({
            x: player.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 20,
            y: player.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2 - 1,
            life: 1.0,
            maxLife: 1.0,
            size: 4 + Math.random() * 4,
            color: '#ffffff',
            type: 'dust'
          });
        }
      }
    }
  }

  // Update particles
  state.particles = state.particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= 0.01 * dt; // Lasts 100 frames (~1.6s)
    return p.life > 0;
  });

  // Calculate player defense
  let playerDefense = 0;
  if (player.equipment.head?.type === 'leather_cap') playerDefense += 1;
  if (player.equipment.torso?.type === 'leather_tunic') playerDefense += 3;
  if (player.equipment.legs?.type === 'leather_pants') playerDefense += 2;
  if (player.equipment.feet?.type === 'leather_boots') playerDefense += 1;

  const takeDamage = (raw_damage: number) => {
    const actual_damage = Math.max(1, raw_damage - playerDefense);
    player.health = Math.max(0, player.health - actual_damage);
    state.shake = 5;
  };

  // Starvation damage
  if (player.hunger <= 0) {
    if (now - player.lastStarveDamageTime > 2000) {
      takeDamage(5);
      player.lastStarveDamageTime = now;
    }
  }
}
