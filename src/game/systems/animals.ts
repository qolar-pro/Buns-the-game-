/**
 * Animal wandering and enemy behaviour, including nocturnal spawning.
 *
 * Split out of the gameplay tick to keep both files under 500 lines. Pure:
 * given state and dt it mutates state and nothing else.
 */
import { soundManager } from '../../../lib/SoundManager';
import type { GameState, ItemType } from '../core/types';

export interface CreatureDeps {
  spawnEnemy: (type: 'static' | 'wolf', x: number, y: number, tier?: number) => void;
  /** Hens lay eggs on a timer. */
  spawnItem: (type: ItemType, x: number, y: number, count: number) => void;
}

/**
 * Advance animals and enemies by `dt` ticks.
 *
 * `now` is passed in rather than read here so every system in one tick agrees
 * on the time, as it did when this was inline.
 */
export function updateCreatures(
  state: GameState,
  dt: number,
  now: number,
  { spawnEnemy, spawnItem }: CreatureDeps,
): void {
  const { player } = state;

  // Update animals
  state.animals.forEach(animal => {
    animal.timer -= 16 * dt;
  
    if (animal.type === 'chicken' && animal.eggTimer !== undefined) {
      animal.eggTimer -= 16 * dt;
      if (animal.eggTimer <= 0 && (animal.state === 'idle' || animal.state === 'wander')) {
        state.items.push({
          id: `egg-${Date.now()}-${Math.random()}`,
          x: animal.x,
          y: animal.y,
          type: 'egg'
        });
        animal.eggTimer = Math.random() * 20000 + 20000; // Lay egg every 20-40s
      }
    }

    if (animal.timer <= 0) {
      if (animal.state === 'panic') {
        animal.state = 'idle';
        animal.timer = Math.random() * 2000 + 1000;
      } else {
        const rand = Math.random();
      
        // Play animal sound occasionally
        if (Math.random() < 0.1) {
          soundManager.playAnimal(animal.type);
        }

        if (rand < 0.3) {
          animal.state = 'idle';
          animal.timer = Math.random() * 2000 + 1000;
        } else {
          animal.state = 'wander';
          animal.timer = Math.random() * 3000 + 2000;
          animal.targetX = animal.x + (Math.random() - 0.5) * 400;
          animal.targetY = animal.y + (Math.random() - 0.5) * 400;
        }
      }
    }

    const speed = animal.state === 'panic' ? 8 : animal.state === 'wander' ? 2 : 0;
    animal.isMoving = false;
    if (speed > 0) {
      const dx = animal.targetX - animal.x;
      const dy = animal.targetY - animal.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        animal.x += (dx / dist) * speed * dt;
        animal.y += (dy / dist) * speed * dt;
        // Set direction based on movement vector
        if (Math.abs(dx) > Math.abs(dy)) {
          animal.facing = dx > 0 ? 'right' : 'left';
        } else {
          animal.facing = dy > 0 ? 'down' : 'up';
        }
        animal.isMoving = true;
      } else if (animal.state === 'wander') {
        animal.state = 'idle';
        animal.timer = Math.random() * 2000 + 1000;
      }
    }

    // Update animation frame
    if (animal.isMoving) {
      animal.animFrame += 0.15 * dt;
      if (animal.animFrame >= 4) animal.animFrame = 0;
    } else {
      animal.animFrame = 0;
    }
  });

  // Update Enemies
  const hour = state.time / 60;
  const isNight = hour >= 18 || hour < 6;

  // Nocturnal Spawning
  if (isNight && Math.random() < 0.005 * dt) {
    const spawnDist = 600;
    const angle = Math.random() * Math.PI * 2;
    const sx = player.x + Math.cos(angle) * spawnDist;
    const sy = player.y + Math.sin(angle) * spawnDist;
  
    if (hour >= 22 || hour < 4) {
      spawnEnemy('wolf', sx, sy);
    } else {
      const tier = Math.min(5, 1 + Math.floor(Math.random() * (hour > 20 ? 3 : 1)));
      spawnEnemy('static', sx, sy, tier);
    }
  }

  state.enemies.forEach((enemy, index) => {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Light avoidance for static enemies
    let lightLevel = 0;
    if (enemy.type === 'static') {
      state.resources.forEach(chunk => {
        chunk.forEach(res => {
          if (res.type === 'torch' || res.type === 'campfire') {
            const rDist = Math.sqrt(Math.pow(enemy.x - res.x, 2) + Math.pow(enemy.y - res.y, 2));
            const radius = res.type === 'campfire' ? 250 : 150;
            if (rDist < radius) lightLevel += (1 - rDist / radius);
          }
        });
      });
    
      if (lightLevel > 0.5) {
        enemy.health -= 0.5 * dt; // Light damages static enemies
        enemy.state = 'idle';
        enemy.targetX = enemy.x - dx; // Run away from player if player is near light
        enemy.targetY = enemy.y - dy;
      }
    }

    if (dist < 500 && lightLevel < 0.5) {
      enemy.state = 'chase';
      enemy.targetX = player.x;
      enemy.targetY = player.y;
    } else if (enemy.state === 'chase' && dist > 700) {
      enemy.state = 'idle';
    }

    if (enemy.state === 'chase') {
      const moveX = (dx / dist) * enemy.speed * dt;
      const moveY = (dy / dist) * enemy.speed * dt;
      enemy.x += moveX;
      enemy.y += moveY;
      enemy.facing = dx > 0 ? 'right' : 'left';

      if (dist < 60 && now - enemy.lastHitTime > 1000) {
        // Attack player
        const actualDamage = Math.max(1, enemy.damage - player.defense);
        player.health -= actualDamage;
        enemy.lastHitTime = now;
        state.shake = 10;
        soundManager.playHit();
      }
    } else if (enemy.state === 'idle') {
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        enemy.targetX = enemy.x + (Math.random() - 0.5) * 200;
        enemy.targetY = enemy.y + (Math.random() - 0.5) * 200;
        enemy.timer = 100 + Math.random() * 200;
      }
      const edx = enemy.targetX - enemy.x;
      const edy = enemy.targetY - enemy.y;
      const eDist = Math.sqrt(edx * edx + edy * edy);
      if (eDist > 5) {
        enemy.x += (edx / eDist) * (enemy.speed * 0.5) * dt;
        enemy.y += (edy / eDist) * (enemy.speed * 0.5) * dt;
      }
    }

    if (enemy.health <= 0) {
      state.enemies.splice(index, 1);
      // Drop loot?
      if (enemy.type === 'wolf') {
        spawnItem('leather', enemy.x, enemy.y, 1);
      }
    }
  });
}
