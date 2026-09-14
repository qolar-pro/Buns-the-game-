/**
 * The complete art catalogue for Buns the Game.
 *
 * Single source of truth for Phase 4: drives generation (scripts/generate-all.mjs),
 * processing (scripts/process-asset.mjs) and atlas packing (scripts/pack-atlases.mjs),
 * and is the input from which src/game/assets/manifest.ts is emitted.
 *
 * Fields:
 *   id       asset id, also the filename and the manifest key
 *   cat      generation category -> framing hint (see lib/replicate.mjs)
 *   atlas    which packed atlas it lands in
 *   w,h      CANONICAL output size in px, authored, never derived from pixels
 *   gw,gh    generation size, 2-4x canonical, drives the aspect ratio
 *   prompt   subject only; the style bible is prefixed automatically
 *   grid     for sprite sheets: [cols, rows] of the cell grid
 */

const T = (id, prompt) => ({ id, cat: 'terrain', atlas: 'terrain', w: 128, h: 128, gw: 1024, gh: 1024, prompt });
const D = (id, prompt) => ({ id, cat: 'detail', atlas: 'world', w: 64, h: 64, gw: 1024, gh: 1024, prompt });
const P = (id, prompt) => ({ id, cat: 'prop', atlas: 'world', w: 128, h: 128, gw: 1024, gh: 1024, prompt });
const L = (id, prompt) => ({ id, cat: 'prop', atlas: 'world', w: 128, h: 192, gw: 768, gh: 1152, prompt });
const I = (id, prompt) => ({ id, cat: 'item', atlas: 'items', w: 64, h: 64, gw: 1024, gh: 1024, prompt });
const E = (id, prompt) => ({ id, cat: 'effect', atlas: 'world', w: 64, h: 64, gw: 1024, gh: 1024, prompt });
const U = (id, w, h, prompt) => ({ id, cat: 'ui', atlas: 'ui', w, h, gw: 1024, gh: Math.round((1024 * h) / w), prompt });

// --- Terrain (6) — must tile seamlessly in both axes -----------------------
const terrain = [
  T('grass', 'a continuous field of short lush green grass blades viewed from directly above, dense even turf, natural random growth, no rows, no grid, no tiles, no paths'),
  T('grass_variant', 'green meadow grass turf with small dry patches and a few tiny yellow wildflowers'),
  T('dirt', 'bare brown earth soil texture, fine clods and small stones'),
  T('sand', 'pale golden beach sand texture, fine even grain, gentle ripples'),
  T('stone_floor', 'grey cobblestone floor of fitted irregular stones with dark mortar joints'),
  T('wood_floor', 'warm brown wooden plank floor, parallel boards, visible grain and seams'),
];

// --- Ground detail (6) ------------------------------------------------------
const detail = [
  D('tall_grass', 'a small tuft of tall green grass blades'),
  D('flowers_a', 'a small cluster of white and yellow daisies with green leaves'),
  D('flowers_b', 'a small cluster of purple and pink wildflowers with green leaves'),
  D('pebbles', 'a few small smooth grey pebbles scattered together'),
  D('twigs', 'two or three small fallen brown twigs crossed on the ground'),
  D('mushroom', 'a pair of small red mushrooms with white spots'),
];

// --- Resources (10) ---------------------------------------------------------
const resources = [
  L('tree', 'a big broadleaf oak tree with a thick brown trunk and a full round green canopy'),
  P('small_tree', 'a young slender tree with a thin trunk and a small green canopy'),
  { ...P('sapling', 'a tiny tree seedling, two green leaves on a short thin stem, freshly planted'), w: 64, h: 64 },
  P('trunk', 'a cut tree stump with a flat top showing pale growth rings and rough bark sides'),
  P('bush', 'a rounded leafy green shrub with small red berries'),
  { ...P('rock_a', 'a single grey granite boulder, rounded, with flat facets'), w: 64, h: 64 },
  { ...P('rock_b', 'a cluster of three small grey stones of different sizes'), w: 64, h: 64 },
  { ...P('rock_c', 'a angular grey rock shard with sharp broken edges'), w: 64, h: 64 },
  P('coal_ore', 'a grey boulder studded with glossy black coal chunks embedded in the rock'),
  P('iron_ore', 'a grey boulder studded with rusty orange-brown iron ore veins embedded in the rock'),
];

// --- Placeables (11 frames) -------------------------------------------------
const placeables = [
  L('workbench', 'a sturdy wooden carpentry workbench with tools and a vice on top'),
  L('furnace', 'a squat stone furnace with a dark empty arched opening, cold and unlit'),
  L('furnace_lit', 'a squat stone furnace with bright orange fire roaring inside the arched opening'),
  L('chest', 'a closed wooden treasure chest with iron bands and a brass lock'),
  L('chest_open', 'an open wooden treasure chest with iron bands, lid raised, interior visible'),
  P('campfire_1', 'a small campfire, ring of stones around burning logs with orange flames'),
  P('campfire_2', 'a small campfire, ring of stones around burning logs with taller orange flames'),
  P('torch', 'a wooden torch staked upright in the ground with an orange flame at the top'),
  L('bed', 'a simple wooden bed with a red blanket and a white pillow'),
  P('fence', 'a short section of rustic wooden post and rail fence'),
  L('antenna', 'a tall makeshift metal radio antenna tower with wires and a small dish'),
];

// --- Item icons (47) — every member of ItemType ----------------------------
const items = [
  I('wood', 'a stack of two cut brown wooden logs'),
  I('stone', 'a few chunks of grey stone piled together'),
  I('sapling', 'a tiny green tree seedling with two leaves in a small clump of soil'),
  I('coal', 'a cluster of glossy black coal lumps'),
  I('stick', 'a pair of crossed brown wooden sticks'),
  I('workbench', 'a small wooden carpentry workbench'),
  I('campfire', 'a small campfire of logs with an orange flame'),
  I('torch', 'a wooden torch with a burning orange flame at the top'),
  I('wheat_seeds', 'a small handful of pale golden wheat seeds'),
  I('wheat', 'a bundle of golden ripe wheat stalks with full ears'),
  I('wooden_axe', 'a woodcutting axe with a warm brown wooden handle and a shaped wooden head'),
  I('wooden_pickaxe', 'a pickaxe with a warm brown wooden handle and a shaped wooden head'),
  I('wooden_sword', 'a short sword with a warm brown wooden blade and a wrapped grip'),
  I('stone_axe', 'a woodcutting axe with a wooden handle and a chipped grey stone head'),
  I('stone_pickaxe', 'a pickaxe with a wooden handle and a chipped grey stone head'),
  I('stone_sword', 'a short sword with a chipped grey stone blade and a wrapped grip'),
  I('iron_axe', 'a woodcutting axe with a wooden handle and a polished cold blue-grey iron head with a bright metallic highlight'),
  I('iron_pickaxe', 'a pickaxe with a wooden handle and a polished cold blue-grey iron head with a bright metallic highlight'),
  I('iron_sword', 'a sword with a polished cold blue-grey iron blade, bright metallic highlight and a leather wrapped grip'),
  I('raw_beef', 'a raw red cut of beef steak, marbled and glistening'),
  I('cooked_beef', 'a cooked browned beef steak with seared grill marks'),
  I('raw_pork', 'a raw pink cut of pork with a pale fat edge'),
  I('cooked_pork', 'a cooked browned pork chop with a crisp seared edge'),
  I('mutton', 'a raw deep red cut of mutton on the bone'),
  I('cooked_mutton', 'a cooked browned mutton chop on the bone, roasted and glazed'),
  I('raw_chicken', 'a raw pale pink chicken drumstick'),
  I('cooked_chicken', 'a cooked golden brown roasted chicken drumstick'),
  I('leather', 'a folded piece of tan brown tanned leather hide'),
  I('wool', 'a soft fluffy bundle of cream white wool'),
  I('feather', 'a single white bird feather'),
  I('egg', 'a single smooth white chicken egg'),
  I('bread', 'a golden brown baked loaf of crusty bread'),
  I('meat_pie', 'a golden baked meat pie with a latticed pastry top in a tin'),
  I('omelet', 'a folded yellow omelette on a small plate'),
  I('leather_cap', 'a brown leather cap helmet with stitched seams'),
  I('leather_tunic', 'a brown leather tunic chest armour with stitched seams and laces'),
  I('leather_pants', 'brown leather trousers armour with stitched seams'),
  I('leather_boots', 'a pair of brown leather boots with laces'),
  I('leather_backpack', 'a brown leather backpack with buckled straps'),
  I('chest', 'a small closed wooden treasure chest with iron bands'),
  I('furnace', 'a small squat stone furnace with a dark arched opening'),
  I('bed', 'a small wooden bed with a red blanket and white pillow'),
  I('fence', 'a short section of wooden post and rail fence'),
  I('antenna', 'a small metal radio antenna tower with a dish'),
  I('scrap_metal', 'a twisted bundle of rusty scrap metal sheets and bent rods'),
  I('copper_wiring', 'a neat coil of bright orange copper wire'),
  I('iron_ingot', 'a single polished cold blue-grey iron ingot bar with a metallic highlight'),
  I('iron_ore', 'a grey rock chunk streaked with rusty orange-brown iron ore veins'),
];

// --- Characters -------------------------------------------------------------
// Diffusion cannot hold a character consistent across the cells of a sprite
// grid — the first attempt produced a scatter of unrelated figures rather than
// a walk cycle. Instead one clean sprite is generated per facing direction and
// scripts/build-sheets.mjs composes the walk frames from it deterministically,
// so every frame is the same character. See DD-012.
const DIRECTIONS = [
  ['down', 'seen from the front, facing towards the viewer'],
  ['left', 'seen from its left side, facing left in profile'],
  ['right', 'seen from its right side, facing right in profile'],
  ['up', 'seen from behind, facing away from the viewer'],
];

const creature = (id, cols, desc) =>
  DIRECTIONS.map(([dir, view]) => ({
    id: `${id}_${dir}`,
    cat: 'prop',
    atlas: 'characters',
    w: 64,
    h: id === 'player' ? 96 : 64,
    gw: 768,
    gh: id === 'player' ? 1024 : 768,
    sheet: { id, cols, dir },
    prompt: `${desc}, ${view}, full body visible, standing upright, single character, centred`,
  }));

const characters = [
  ...creature('player', 8, 'a friendly farmer character wearing a wide straw hat, a red shirt and blue denim overalls'),
  ...creature('cow', 3, 'a white and brown spotted cow'),
  ...creature('pig', 3, 'a plump pink pig'),
  ...creature('sheep', 3, 'a fluffy cream white sheep'),
  ...creature('chicken', 3, 'a white chicken with a red comb'),
];

// --- Effects (6) ------------------------------------------------------------
const effects = [
  E('hit_spark', 'a sharp white and yellow impact spark burst, radiating star shape'),
  E('leaf_burst', 'a scatter of small green leaves flying outward'),
  E('stone_chip', 'a scatter of small grey stone chips and dust flying outward'),
  E('smoke_puff', 'a soft round pale grey smoke puff cloud'),
  E('water_splash', 'a small blue water splash with droplets flying outward'),
  E('sleep_z', 'three pale blue letter Z shapes floating upward in a row, cartoon sleep symbol'),
];

// --- UI icons ---------------------------------------------------------------
// Only true icons are generated. Panel frames, slots and buttons are chrome:
// they need exact geometry and 9-slice edges that a diffusion model cannot hold,
// and Phase 6 rebuilds the UI as React DOM styled from the shared palette, where
// they are CSS borders rather than sprites. See DD-013.
const ui = [
  U('heart', 64, 64, 'a plump glossy red heart icon, simple and bold'),
  U('heart_empty', 64, 64, 'an empty dark grey outlined heart icon, simple and bold'),
  U('drumstick', 64, 64, 'a golden brown roasted drumstick icon, simple and bold'),
  U('drumstick_empty', 64, 64, 'an empty dark grey outlined drumstick icon, simple and bold'),
  U('stamina_bolt', 64, 64, 'a bright yellow lightning bolt icon, thick and bold, filling the frame'),
  U('cursor', 64, 64, 'a simple white pointer arrow cursor with a thick dark outline, filling the frame'),
];

export const CATALOG = [
  ...terrain, ...detail, ...resources, ...placeables, ...items, ...characters, ...effects, ...ui,
];

export const BY_ID = new Map(CATALOG.map((a) => [`${a.atlas}/${a.id}`, a]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const counts = {};
  for (const a of CATALOG) counts[a.atlas] = (counts[a.atlas] || 0) + 1;
  console.log(`total assets: ${CATALOG.length}`);
  console.log('per atlas:', counts);
}
