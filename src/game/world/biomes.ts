/**
 * Surface biomes.
 *
 * Two independent noise fields — temperature and moisture — pick the biome for
 * a chunk, the way real climate maps work: hot and dry is desert, cold is snow,
 * warm and wet is swamp, everything else is the grassland the game started as.
 *
 * Two fields rather than one means biomes tile the map in irregular regions
 * instead of concentric rings around the origin, and a player walking in one
 * direction crosses several rather than the same one forever.
 *
 * Thresholds below are percentiles of these exact fields measured over 3,721
 * chunks, not guesses. That matters: the world generator already shipped a
 * "quarry biome" gated at 0.85 on a field whose maximum is 0.72, so it never
 * fired once.
 */
import { fbm } from './noise';
import type { EnemyKind, EntityType } from '../core/types';

export type Biome = 'grassland' | 'desert' | 'snow' | 'swamp';

export const BIOMES: Biome[] = ['grassland', 'desert', 'snow', 'swamp'];

/** Scale of a biome region. Smaller divisor = larger regions. */
const FIELD_SCALE = 0.12;

/**
 * Chosen by sweeping every combination against 6,561 sampled chunks for a
 * target mix of 45% grassland and roughly 18% each of the rest — grassland is
 * home and should dominate, the others should be somewhere you travel to.
 * Measured result: 45.0 / 16.8 / 19.0 / 19.2.
 */
const COLD = 0.34;
const HOT = 0.48;
const DRY = 0.42;
const WET = 0.53;

/** Climate at a chunk, 0..1 each. Exported so the tests can sample it. */
export function climateAt(cx: number, cy: number): { temp: number; moisture: number } {
  return {
    temp: fbm(cx * FIELD_SCALE + 911, cy * FIELD_SCALE + 911, 3),
    moisture: fbm(cx * FIELD_SCALE + 4242, cy * FIELD_SCALE + 4242, 3),
  };
}

/**
 * Which biome a chunk belongs to.
 *
 * Order matters: cold wins over wet, so there is no "snowy swamp" that would
 * need its own art and its own spawn table for a handful of chunks.
 */
export function biomeAt(cx: number, cy: number): Biome {
  const { temp, moisture } = climateAt(cx, cy);
  if (temp < COLD) return 'snow';
  if (temp > HOT && moisture < DRY) return 'desert';
  if (moisture > WET) return 'swamp';
  return 'grassland';
}

/**
 * How strongly a chunk belongs to its biome, 0 at the border and 1 deep inside.
 *
 * Used to fade terrain between regions, so a desert does not begin with a
 * straight edge — the same mistake the old per-chunk blight flag made.
 */
export function biomeStrength(cx: number, cy: number): number {
  const { temp, moisture } = climateAt(cx, cy);
  const biome = biomeAt(cx, cy);
  switch (biome) {
    case 'snow':
      return Math.min(1, (COLD - temp) / 0.12);
    case 'desert':
      return Math.min(1, Math.min(temp - HOT, DRY - moisture) / 0.1);
    case 'swamp':
      return Math.min(1, (moisture - WET) / 0.12);
    default:
      return 1;
  }
}

/** One kind of thing a biome scatters, and how much of it. */
export interface Spawn {
  type: EntityType;
  /** Expected count per chunk. Fractional means "sometimes". */
  per: number;
}

export interface BiomeProfile {
  /** Terrain tile id in the atlas. */
  ground: string;
  /** Secondary tile blended in patches, for texture. */
  accent: string;
  /** Tint multiplied over the ground, so one tile can serve two biomes. */
  tint: string | null;
  /** What grows and outcrops here. */
  spawns: Spawn[];
  /** Who lives here. Daytime residents, unlike the nocturnal surface mobs. */
  natives: { kind: EnemyKind; per: number }[];
  /** Named in the HUD when the player crosses into it. */
  label: string;
}

/**
 * Everything that distinguishes one biome from another, in one table.
 *
 * Counts are per chunk and mostly fractional: `0.4` means roughly two in every
 * five chunks carry one. They are deliberately lower than grassland's, because
 * these are places you travel through, and a desert as dense as a meadow stops
 * reading as a desert.
 */
export const PROFILES: Record<Biome, BiomeProfile> = {
  grassland: {
    ground: 'terrain/grass',
    accent: 'terrain/grass_variant',
    tint: null,
    label: 'Meadows',
    spawns: [],  // grassland keeps the original scatter logic in worldgen
    natives: [],
  },

  desert: {
    ground: 'terrain/sand',
    accent: 'terrain/cracked_earth',
    tint: null,
    label: 'The Dust Flats',
    spawns: [
      // Cactus is the only source of plant fiber, which is the only source of
      // rope, which is the only bowstring. That is the desert's gate.
      { type: 'cactus', per: 1.1 },
      { type: 'dead_bush', per: 0.9 },
      { type: 'desert_rock', per: 0.7 },
      { type: 'palm_tree', per: 0.25 },
    ],
    natives: [{ kind: 'scorpion', per: 0.35 }],
  },

  snow: {
    ground: 'terrain/snow',
    accent: 'terrain/snow',
    tint: null,
    label: 'The White Waste',
    spawns: [
      { type: 'pine_tree', per: 1.2 },
      { type: 'snow_rock', per: 0.8 },
      // Frost crystals are the set bonus material for fur armour.
      { type: 'ice_shard', per: 0.45 },
      { type: 'frost_flower', per: 0.5 },
    ],
    // Thick fur drops here and nowhere else.
    natives: [{ kind: 'frost_wolf', per: 0.4 }],
  },

  swamp: {
    ground: 'terrain/marsh',
    accent: 'terrain/dirt',
    tint: null,
    label: 'The Sunken Fen',
    spawns: [
      // Reeds are arrow shafts in bulk; bog iron is a second iron source, so a
      // player who finds the fen early gets underground sooner.
      { type: 'reeds', per: 1.4 },
      { type: 'swamp_tree', per: 0.8 },
      { type: 'lily_pad', per: 0.7 },
      { type: 'bog_iron', per: 0.5 },
      { type: 'glow_moss', per: 0.35 },
    ],
    natives: [{ kind: 'bog_lurker', per: 0.3 }],
  },
};
