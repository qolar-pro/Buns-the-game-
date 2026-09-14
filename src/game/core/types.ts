/**
 * Shared game types.
 *
 * Moved verbatim out of components/Game.tsx. These describe the state that the
 * pure systems in src/game/systems operate on.
 */
export type EntityType = 'tree' | 'rock' | 'bush' | 'sapling' | 'trunk' | 'coal_ore' | 'torch' | 'workbench' | 'campfire' | 'branch' | 'small_rock' | 'grass' | 'bed' | 'chest' | 'furnace' | 'antenna' | 'fence' | 'iron_ore';
export type ItemType = 'wood' | 'stone' | 'sapling' | 'coal' | 'stick' | 'workbench' | 'campfire' | 'torch' | 'wheat_seeds' | 'wooden_axe' | 'wooden_pickaxe' | 'stone_axe' | 'stone_pickaxe' | 'wooden_sword' | 'stone_sword' | 'raw_beef' | 'leather' | 'raw_pork' | 'mutton' | 'wool' | 'raw_chicken' | 'feather' | 'egg' | 'bed' | 'leather_cap' | 'leather_tunic' | 'leather_pants' | 'leather_boots' | 'leather_backpack' | 'chest' | 'furnace' | 'cooked_beef' | 'cooked_pork' | 'cooked_mutton' | 'cooked_chicken' | 'scrap_metal' | 'copper_wiring' | 'iron_ore' | 'iron_ingot' | 'iron_axe' | 'iron_pickaxe' | 'iron_sword' | 'antenna' | 'fence' | 'bread' | 'meat_pie' | 'omelet' | 'wheat';

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
  fuelTimer?: number;
  maxFuelTimer?: number;
  growthTimer?: number;
  antennaProgress?: number; // 0 to 100
}

export interface Enemy {
  id: string;
  type: 'static' | 'wolf';
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
    isParticle?: boolean;
    isTargeted?: boolean;
  };

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
  resources: Map<string, Resource[]>; // Spatial partitioning: chunkId -> resources
  items: DroppedItem[];
  animals: Animal[];
  enemies: Enemy[];
  particles: Particle[];
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
