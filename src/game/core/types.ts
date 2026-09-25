/**
 * Shared game types.
 *
 * Moved verbatim out of components/Game.tsx. These describe the state that the
 * pure systems in src/game/systems operate on.
 */
export type EntityType =
  // surface
  | 'tree' | 'rock' | 'bush' | 'sapling' | 'trunk' | 'branch' | 'small_rock' | 'grass'
  // ores
  | 'coal_ore' | 'iron_ore' | 'copper_ore' | 'titanium_ore'
  // placeables
  | 'torch' | 'workbench' | 'campfire' | 'bed' | 'chest' | 'furnace' | 'antenna' | 'fence'
  | 'wall' | 'floor' | 'door' | 'anvil' | 'wheat_crop'
  // dungeon
  | 'dungeon_entrance' | 'dungeon_exit' | 'stairs_down' | 'rubble' | 'loot_chest' | 'brazier'
  // desert
  | 'cactus' | 'dead_bush' | 'desert_rock' | 'palm_tree'
  // snow
  | 'pine_tree' | 'snow_rock' | 'ice_shard' | 'frost_flower'
  // swamp
  | 'reeds' | 'lily_pad' | 'swamp_tree' | 'bog_iron' | 'glow_moss'
  // villages
  | 'village_house' | 'village_hall' | 'well' | 'market_stall' | 'signpost' | 'lamppost'
  | 'crate' | 'barrel';
export type ItemType =
  | 'wood' | 'stone' | 'sapling' | 'coal' | 'stick' | 'workbench' | 'campfire' | 'torch' | 'wheat_seeds' | 'wooden_axe' | 'wooden_pickaxe' | 'stone_axe' | 'stone_pickaxe' | 'wooden_sword' | 'stone_sword' | 'raw_beef' | 'leather' | 'raw_pork' | 'mutton' | 'wool' | 'raw_chicken' | 'feather' | 'egg' | 'bed' | 'leather_cap' | 'leather_tunic' | 'leather_pants' | 'leather_boots' | 'leather_backpack' | 'chest' | 'furnace' | 'cooked_beef' | 'cooked_pork' | 'cooked_mutton' | 'cooked_chicken' | 'scrap_metal' | 'copper_wiring' | 'iron_ore' | 'iron_ingot' | 'iron_axe' | 'iron_pickaxe' | 'iron_sword' | 'antenna' | 'fence' | 'bread' | 'meat_pie' | 'omelet' | 'wheat'
  // --- added in the content update ---
  // ores and bars
  | 'copper_ore' | 'copper_ingot' | 'titanium_ore' | 'titanium_ingot'
  // titanium tier
  | 'titanium_axe' | 'titanium_pickaxe' | 'titanium_sword'
  | 'titanium_helm' | 'titanium_chestplate' | 'titanium_greaves' | 'titanium_boots'
  // building
  | 'wall' | 'floor' | 'door' | 'anvil' | 'lantern'
  // consumables and utility
  | 'bandage' | 'ration' | 'torch_bundle' | 'throwing_knife' | 'rope'
  // dungeon uniques
  | 'relic_blade' | 'prospectors_pick' | 'wardens_key' | 'signal_core' | 'survivors_log'
  // antenna chain
  | 'antenna_frame'
  // --- biomes: each one gates a material the combat tree needs ---
  | 'plant_fiber' | 'thick_fur' | 'reed_bundle' | 'bog_iron' | 'frost_crystal'
  | 'glow_moss' | 'sand' | 'glass' | 'cactus_flesh'
  // ranged
  | 'bow' | 'crossbow' | 'arrow' | 'iron_arrow' | 'quiver'
  // shields and armour sets
  | 'wooden_shield' | 'iron_shield' | 'titanium_shield'
  | 'fur_cap' | 'fur_coat' | 'fur_leggings' | 'fur_boots'
  | 'chainmail_coif' | 'chainmail_hauberk' | 'chainmail_chausses' | 'iron_boots'
  // village economy
  | 'trade_token' | 'supply_crate' | 'village_charter'
  // the second ending
  | 'power_cell';

export interface Ingredient {
  type: ItemType;
  count: number;
}

export interface Recipe {
  id: string;
  output: ItemType;
  count: number;
  ingredients: Ingredient[];
  requiresWorkbench?: boolean;
}

export type EquipmentSlotName = 'head' | 'torso' | 'legs' | 'feet' | 'back';
export type Equipment = Record<EquipmentSlotName, InventorySlot | null>;

export type AnimalType = 'cow' | 'pig' | 'sheep' | 'chicken';

/** Hostiles. `static` and `wolf` predate the content update. */
export type EnemyKind =
  | 'static' | 'wolf' | 'husk' | 'crawler' | 'sentinel' | 'warden'
  | 'scorpion' | 'frost_wolf' | 'bog_lurker';

export type AnimalState = 'idle' | 'wander' | 'panic';

export interface Animal {
  id: string;
  type: AnimalType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  state: AnimalState;
  targetX: number;
  targetY: number;
  timer: number;
  facing: 'left' | 'right' | 'up' | 'down';
  lastHitTime: number;
  eggTimer?: number;
  animFrame: number;
  isMoving: boolean;
}

export interface InventorySlot {
  type: ItemType;
  count: number;
}

export interface Resource {
  id: string;
  x: number;
  y: number;
  type: EntityType;
  hits: number;
  maxHits: number;
  scale: number;
  opacity: number;
  rockIndex?: number; // 0-8 for variety
  growthStage?: number; // 0: sapling, 1: small tree, 2: tree
  inventory?: (InventorySlot | null)[]; // For chests and furnaces
  smeltTimer?: number;
  /** When this node was last struck, for the white hit flash. */
  lastHitAt?: number;
  fuelTimer?: number;
  maxFuelTimer?: number;
  growthTimer?: number;
  antennaProgress?: number; // 0 to 100
  /** Set once the Warden's signal core is fitted; the last step before broadcast. */
  coreInstalled?: boolean;
}

export interface Enemy {
  id: string;
  type: EnemyKind;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  targetX: number;
  targetY: number;
  state: 'idle' | 'chase' | 'attack';
  timer: number;
  facing: 'left' | 'right';
  lastHitTime: number;
  tier?: number; // For static enemies (1-5)
}

export type NpcRole = 'villager' | 'trader' | 'elder';

/**
 * A person, as opposed to an animal or a hostile.
 *
 * Deliberately its own list rather than an `Animal` with a new type: animals
 * exist to be butchered, and every drop table, harvest gate and attack path
 * treats them that way. A villager sharing that type would be a villager you
 * could kill for beef.
 */
export interface Npc {
  id: string;
  role: NpcRole;
  /** Shown when you talk to them. */
  name: string;
  x: number;
  y: number;
  /** Where they drift back to; villagers stay near their own village. */
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  state: 'idle' | 'wander';
  timer: number;
  facing: 'left' | 'right' | 'up' | 'down';
  animFrame: number;
  isMoving: boolean;
  /** Village id, so stock and requests are per settlement. */
  village: string;
}

/** An arrow in flight. */
export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** Ticks remaining before it falls. */
  life: number;
  /** Which ammunition, so the right thing lands on the ground. */
  type: ItemType;
  /** Fired by a mob at the player, rather than the other way round. */
  hostile?: boolean;
}

export interface DroppedItem {
  id: string;
  x: number;
  y: number;
  type: ItemType;
}

/**
 * An entry in the z-sorted draw list. The list is heterogeneous — resources,
 * dropped items, animals, enemies, particles and the player all go through the
 * same sort — so this widens the members that genuinely differ between those
 * types and keeps the rest checked.
 */
export type RenderEntity =
  Partial<Omit<Resource, 'type'>> &
  Partial<Omit<Animal, 'type' | 'facing' | 'state'>> &
  Partial<Omit<Enemy, 'type' | 'facing' | 'state'>> &
  Partial<Omit<DroppedItem, 'type'>> &
  Partial<Omit<Particle, 'type'>> & {
    x: number;
    y: number;
    sortY: number;
    type?: EntityType | ItemType | AnimalType | 'player' | 'static' | 'wolf';
    facing?: 'left' | 'right' | 'up' | 'down';
    state?: string;
    isResource?: boolean;
    isItem?: boolean;
    isAnimal?: boolean;
    isEnemy?: boolean;
    isNpc?: boolean;
    isParticle?: boolean;
    isTargeted?: boolean;
  };

/**
 * A short-lived "+1 Wood" that drifts upward from where a thing was gathered.
 *
 * Kept as plain data on state so the systems can spawn one without reaching for
 * the renderer, and so it serialises with a save like everything else.
 */
export interface FloatingText {
  x: number;
  y: number;
  text: string;
  colour: string;
  /** Counts down to 0, then the entry is dropped. */
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'swirl' | 'footstep' | 'dust';
  rotation?: number;
}

export interface GameState {
  width: number;
  height: number;
  player: {
    x: number;
    y: number;
    isSprinting: boolean;
    health: number;
    hunger: number;
    defense: number;
    /** Multiplier on PLAYER_SPEED from armour. 1 when unarmoured. */
    speedMultiplier: number;
    inventory: (InventorySlot | null)[];
    equipment: Equipment;
    selectedSlot: number;
    facing: 'up' | 'down' | 'left' | 'right';
    isMoving: boolean;
    isSitting: boolean;
    lastMoveTime: number;
    animFrame: number;
    lastStarveDamageTime: number;
    footstepTimer: number;
  };
  isPaused: boolean;
  /** Where the player is. Dungeons are separate, bounded levels. */
  /** People in the loaded world. */
  npcs: Npc[];
  /** Arrows in flight. */
  projectiles: Projectile[];
  /** Timestamp of the last shot, for the launcher cooldown. */
  lastShotAt: number;
  /** Villages the player has walked into, by id. Drives the safe-haven rules. */
  villagesFound: string[];
  /** Open trade partner, or null. Mirrors openChestId. */
  talkingToId: string | null;
  /**
   * What the pointer is over right now, from systems/picking.ts.
   *
   * Separate from `selectedResourceId`: selection is what a press will act on
   * and survives the mouse moving away, hover is only what is under the
   * pointer this instant. Conflating them made the highlight lie.
   */
  hoveredPick: { kind: string; id: string; distance: number } | null;
  /** Village request ids already handed in. */
  requestsDone: string[];
  level: { kind: 'surface' } | { kind: 'dungeon'; depth: 1 | 2 | 3; seed: number };
  /** Run statistics, for the quest log and the ending summary. */
  progress: {
    daysSurvived: number;
    deepestDepth: number;
    mobsDefeated: number;
    chestsLooted: number;
    /** How many survivor's logs have been read, so they stay in order. */
    logsRead: number;
    itemsCrafted: number;
    /** Uniques already claimed, so a second lantern never drops. */
    uniquesTaken: ItemType[];
    /** Set once the Warden is down. */
    wardenDefeated: boolean;
    /** Set when the run ends, either way. */
    broadcast: boolean;
    /**
     * Which ending the run took, once it has taken one.
     *
     * 'rescued' powers the antenna and calls for a ship; 'settled' gives the
     * core to the village generator instead. There is one core and both need
     * it, which is the whole choice.
     */
    endingKind: 'rescued' | 'settled' | null;
    /** Armed by the first press on the generator, so the choice cannot misfire. */
    settleArmed: boolean;
  };
  /** Objectives the player has already completed, by id. */
  questsDone: string[];
  resources: Map<string, Resource[]>; // Spatial partitioning: chunkId -> resources
  items: DroppedItem[];
  animals: Animal[];
  enemies: Enemy[];
  particles: Particle[];
  /** Transient "+1 Wood" labels; see FloatingText. */
  floatingTexts: FloatingText[];
  camera: {
    x: number;
    y: number;
  };
  generatedChunks: Set<string>;
  time: number; // 0 to 1440 (minutes in a day)
  shake: number;
  isInventoryOpen: boolean;
  isWorkbenchOpen: boolean;
  openChestId: string | null;
  selectedResourceId: string | null;
  selectedAnimalId: string | null;
  draggedItem: { slotIndex: number, item: InventorySlot, equipSlot?: 'head' | 'torso' | 'legs' | 'feet' | 'back', fromChest?: boolean } | null;
  mousePos: { x: number, y: number };
  message: { text: string, time: number } | null;
  isRightMouseDown: boolean;
  lastEatTime: number;
}
