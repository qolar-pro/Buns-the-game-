/**
 * Animal wandering and enemy behaviour, including nocturnal spawning.
 *
 * Split out of the gameplay tick to keep both files under 500 lines. Pure:
 * given state and dt it mutates state and nothing else.
 */
import { soundManager } from '../../../lib/SoundManager';
import { MOBS, enemyDrops } from './mobs';
import { inVillage, updateNpcs } from './npcs';
import type { EnemyKind, GameState, ItemType } from '../core/types';

export interface CreatureDeps {
  spawnEnemy: (type: EnemyKind, x: number, y: number, tier?: number) => void;
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

  updateNpcs(state, dt);
  updateEnemies(state, dt, now, { spawnEnemy, spawnItem });
}

/** Surface mobs that can appear after dark, and the earliest hour they do. */
const NIGHT_SPAWNS: { kind: EnemyKind; from: number }[] = [
  { kind: 'static', from: 18 },
  { kind: 'wolf', from: 22 },
  { kind: 'husk', from: 23 },
];

/** Light this strong drives a shade off and burns it. */
const LIGHT_THRESHOLD = 0.5;

function lightAt(state: GameState, x: number, y: number): number {
  let level = 0;
  state.resources.forEach((chunk) => {
    chunk.forEach((res) => {
      const radius = res.type === 'campfire' ? 250 : res.type === 'torch' ? 150 : res.type === 'brazier' ? 200 : 0;
      if (radius === 0) return;
      const dist = Math.hypot(x - res.x, y - res.y);
      if (dist < radius) level += 1 - dist / radius;
    });
  });
  return level;
}

/**
 * Advance hostiles.
 *
 * Every kind runs the same chase/wander loop; what differs between them comes
 * from `MOBS` (aggro range, speed) and from two flags below, so a new mob is a
 * row in that table rather than another branch in here.
 */
function updateEnemies(
  state: GameState,
  dt: number,
  now: number,
  { spawnEnemy, spawnItem }: CreatureDeps,
): void {
  const { player } = state;
  const hour = state.time / 60;
  const isNight = hour >= 18 || hour < 6;
  const underground = state.level.kind === 'dungeon';

  // Nocturnal spawning, surface only — the dungeon ships with its population.
  // A settlement is the one place on the map that stays quiet: that is what
  // makes it somewhere to come back to rather than another patch of grass.
  if (!underground && isNight && !inVillage(state) && Math.random() < 0.005 * dt) {
    const angle = Math.random() * Math.PI * 2;
    const sx = player.x + Math.cos(angle) * 600;
    const sy = player.y + Math.sin(angle) * 600;
    const eligible = NIGHT_SPAWNS.filter((s) => (hour < 6 ? s.from - 24 : s.from) <= hour);
    const pick = eligible[Math.floor(Math.random() * eligible.length)] ?? NIGHT_SPAWNS[0];
    const tier = pick.kind === 'static' ? Math.min(5, 1 + Math.floor(Math.random() * (hour > 20 ? 3 : 1))) : 1;
    spawnEnemy(pick.kind, sx, sy, tier);
  }

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    const profile = MOBS[enemy.type];
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Shades are the only thing light hurts; everything else ignores it.
    let lit = 0;
    if (enemy.type === 'static') {
      lit = lightAt(state, enemy.x, enemy.y);
      if (lit > LIGHT_THRESHOLD) {
        enemy.health -= 0.5 * dt;
        enemy.state = 'idle';
        enemy.targetX = enemy.x - dx;
        enemy.targetY = enemy.y - dy;
      }
    }

    const aggro = profile.aggroRange || 500;
    if (dist < aggro && lit <= LIGHT_THRESHOLD) {
      enemy.state = 'chase';
      enemy.targetX = player.x;
      enemy.targetY = player.y;
    } else if (enemy.state === 'chase' && dist > aggro * 1.4) {
      enemy.state = 'idle';
    }

    if (enemy.state === 'chase') {
      enemy.x += (dx / dist) * enemy.speed * dt;
      enemy.y += (dy / dist) * enemy.speed * dt;
      enemy.facing = dx > 0 ? 'right' : 'left';

      if (dist < 60 && now - enemy.lastHitTime > 1000) {
        player.health -= Math.max(1, enemy.damage - player.defense);
        enemy.lastHitTime = now;
        state.shake = enemy.type === 'warden' ? 20 : 10;
        soundManager.playHit();
      }
    } else {
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        enemy.targetX = enemy.x + (Math.random() - 0.5) * 200;
        enemy.targetY = enemy.y + (Math.random() - 0.5) * 200;
        enemy.timer = 100 + Math.random() * 200;
      }
      const edx = enemy.targetX - enemy.x;
      const edy = enemy.targetY - enemy.y;
      const eDist = Math.hypot(edx, edy);
      if (eDist > 5) {
        enemy.x += (edx / eDist) * (enemy.speed * 0.5) * dt;
        enemy.y += (edy / eDist) * (enemy.speed * 0.5) * dt;
      }
    }

    if (enemy.health <= 0) {
      state.enemies.splice(index, 1);
      state.progress.mobsDefeated += 1;
      for (const drop of enemyDrops(enemy.type)) {
        spawnItem(drop.type, enemy.x, enemy.y, drop.count);
      }
      if (enemy.type === 'warden') state.progress.wardenDefeated = true;
    }
  }
}
