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
import { foodValue } from './food';
import { armourTotals, blockValue } from './armour';
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

  // Defence comes from the armour table. It used to be four `if`s naming the
  // four leather pieces, so chainmail, fur and the twenty-ingot titanium suit
  // all protected the player exactly as much as bare skin.
  const armour = armourTotals(state.player.equipment);
  state.player.defense = armour.defense + blockValue(state);
  state.player.speedMultiplier = armour.speed;

  // Update Furnaces
  updateSmelting(state, dt);

  // Time progression. The wrap past midnight is what counts a day, so the
  // survived count is derived from the clock rather than a separate timer that
  // could drift away from it.
  const advanced = state.time + 0.08 * dt;
  if (advanced >= 1440) state.progress.daysSurvived += 1;
  state.time = advanced % 1440;

  // Hunger decay
  const SPRINT_HUNGER_DECAY = 0.5 / 60; // 1 point every 2 seconds
  const NORMAL_HUNGER_DECAY = 0.01 / 60; // 1 point every 100 seconds
  const hungerDecay = player.isSprinting ? SPRINT_HUNGER_DECAY : NORMAL_HUNGER_DECAY;
  player.hunger = Math.max(0, player.hunger - hungerDecay * dt);

  // Eating logic
  if (state.isRightMouseDown && now - state.lastEatTime > 1000) {
    const selectedItem = player.inventory[player.selectedSlot];
    if (selectedItem) {
      const food = foodValue(selectedItem.type);
      if (food) {
        player.health = Math.min(100, player.health + food.health);
        player.hunger = Math.min(100, player.hunger + food.hunger);
        removeFromInventory(selectedItem.type, 1);
        state.message = { text: `Ate ${selectedItem.type.replace(/_/g, ' ')}`, time: now };
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

  const takeDamage = (raw_damage: number) => {
    // The same defence the rest of the game uses. This was its own copy of the
    // old four-leather-pieces chain, so starving in a full titanium suit hurt
    // exactly as much as starving naked.
    const actual_damage = Math.max(1, raw_damage - player.defense);
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
