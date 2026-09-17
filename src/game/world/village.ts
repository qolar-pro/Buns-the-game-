/**
 * Settlements.
 *
 * A village is one chunk with a deterministic layout: the same seed and the
 * same chunk always produce the same village, so it survives leaving and coming
 * back without being stored in the save.
 *
 * Villages sit in grassland, desert and snow but never in the fen. That is
 * partly flavour — nobody builds a longhouse in a bog — and partly so the swamp
 * keeps one distinct character: the biome with no help in it.
 */
import { CHUNK_SIZE } from '../core/config';
import { fbm } from './noise';
import { biomeAt } from './biomes';
import type { Npc, NpcRole, Resource } from '../core/types';

/** Where in the chunk a building sits, as a fraction, and what it is. */
interface Slot {
  fx: number;
  fy: number;
  type: Resource['type'];
}

/**
 * The layout, authored rather than generated.
 *
 * A random scatter of houses reads as debris; a street with a well at the end
 * reads as a place someone lives. Every village shares this plan and differs in
 * which slots are filled, which is enough variety at this scale.
 */
const PLAN: Slot[] = [
  { fx: 0.18, fy: 0.22, type: 'village_house' },
  { fx: 0.50, fy: 0.18, type: 'village_hall' },
  { fx: 0.82, fy: 0.22, type: 'village_house' },
  { fx: 0.16, fy: 0.62, type: 'village_house' },
  { fx: 0.84, fy: 0.62, type: 'village_house' },
  { fx: 0.50, fy: 0.52, type: 'well' },
  { fx: 0.32, fy: 0.78, type: 'market_stall' },
  { fx: 0.68, fy: 0.78, type: 'crate' },
  { fx: 0.24, fy: 0.44, type: 'lamppost' },
  { fx: 0.76, fy: 0.44, type: 'lamppost' },
  { fx: 0.50, fy: 0.88, type: 'signpost' },
  { fx: 0.62, fy: 0.86, type: 'barrel' },
];

/** Who lives there, and where they stand to begin with. */
const RESIDENTS: { role: NpcRole; fx: number; fy: number }[] = [
  { role: 'elder', fx: 0.50, fy: 0.30 },
  { role: 'trader', fx: 0.33, fy: 0.74 },
  { role: 'villager', fx: 0.22, fy: 0.50 },
  { role: 'villager', fx: 0.72, fy: 0.55 },
];

const FIRST_NAMES = [
  'Maren', 'Corin', 'Ysolde', 'Bram', 'Tilda', 'Eryn', 'Odo', 'Sable',
  'Hollis', 'Pell', 'Wren', 'Garrick', 'Nessa', 'Tobin', 'Alda', 'Rook',
];

/**
 * Is there a village in this chunk?
 *
 * Threshold measured, not guessed: 0.60 on this field is roughly its 96th
 * percentile, which works out at one village every twenty-five-odd chunks —
 * far enough apart to be a landmark, close enough that you find one.
 */
export function hasVillage(cx: number, cy: number): boolean {
  if (biomeAt(cx, cy) === 'swamp') return false;
  // Never on top of spawn: the first minute should be the player alone.
  if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return false;
  return fbm(cx * 0.9 + 5150, cy * 0.9 + 5150, 2) > 0.60;
}

/** Stable id for the village in a chunk. */
export function villageId(cx: number, cy: number): string {
  return `village:${cx},${cy}`;
}

/** A small deterministic generator, so a village is the same every visit. */
function rngFor(cx: number, cy: number): () => number {
  let seed = Math.abs(Math.floor(cx * 73856093 ^ cy * 19349663)) % 2147483647 || 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export interface Village {
  id: string;
  cx: number;
  cy: number;
  /** Centre in world units, for distance checks. */
  x: number;
  y: number;
  buildings: Resource[];
  residents: Npc[];
}

/** Build the village for a chunk. Caller checks `hasVillage` first. */
export function generateVillage(cx: number, cy: number): Village {
  const random = rngFor(cx, cy);
  const id = villageId(cx, cy);
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;

  const buildings: Resource[] = [];
  let n = 0;
  for (const slot of PLAN) {
    // Two slots in five are empty, so villages differ in size without needing
    // a second plan. The hall and the well always stand: they are what makes
    // the place read as a village rather than a few sheds.
    const optional = slot.type !== 'village_hall' && slot.type !== 'well';
    if (optional && random() < 0.28) continue;
    n += 1;
    buildings.push({
      id: `${id}:b${n}`,
      x: ox + slot.fx * CHUNK_SIZE - 64,
      y: oy + slot.fy * CHUNK_SIZE - 64,
      type: slot.type,
      hits: 0,
      // Village buildings are not a lumber yard. High enough that chopping one
      // down is a decision, not an accident.
      maxHits: 40,
      scale: 1,
      opacity: 1,
    } as Resource);
  }

  const residents: Npc[] = RESIDENTS.map((r, i) => {
    const x = ox + r.fx * CHUNK_SIZE;
    const y = oy + r.fy * CHUNK_SIZE;
    return {
      id: `${id}:n${i}`,
      role: r.role,
      name: FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)],
      x,
      y,
      homeX: x,
      homeY: y,
      targetX: x,
      targetY: y,
      state: 'idle' as const,
      timer: random() * 200,
      facing: 'down' as const,
      animFrame: 0,
      isMoving: false,
      village: id,
    };
  });

  return { id, cx, cy, x: ox + CHUNK_SIZE / 2, y: oy + CHUNK_SIZE / 2, buildings, residents };
}

/** How close counts as "in the village", for safe-haven rules. */
export const VILLAGE_RADIUS = CHUNK_SIZE * 0.9;
