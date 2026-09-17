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

// --- Content update: ores, dungeon props, building -------------------------
const contentWorld = [
  P('copper_ore', 'a grey boulder studded with bright orange-green copper veins embedded in the rock'),
  P('titanium_ore', 'a dark grey boulder studded with glowing pale blue-white titanium crystals'),
  P('rubble', 'a pile of broken grey stone rubble and rock debris'),
  L('dungeon_entrance', 'a collapsed mine shaft entrance in the ground, wooden support beams, dark opening choked with rubble'),
  P('dungeon_exit', 'a wooden ladder leading up out of a dark hole in the ground'),
  P('stairs_down', 'a dark stone staircase descending into a black hole in the ground'),
  L('loot_chest', 'an ornate iron-bound treasure chest with a heavy lock, slightly battered and ancient'),
  P('brazier', 'a standing iron brazier with burning orange coals'),
  L('wall', 'a section of stacked wooden log wall, sturdy and rough hewn'),
  P('floor', 'a square of fitted wooden planks laid as flooring'),
  L('door', 'a heavy wooden door with iron hinges and a round handle'),
  L('anvil', 'a heavy black iron anvil on a thick wooden block'),
  // Farming. Wheat had an icon and two recipes but nothing in the world grew it.
  { ...P('crop_seedling', 'a row of tiny green wheat shoots just sprouted from dark tilled soil'), w: 64, h: 64 },
  P('crop_growing', 'a clump of young green wheat stalks, knee high, not yet eared'),
  P('crop_wheat', 'a clump of tall ripe golden wheat stalks heavy with grain ears'),
];

const contentItems = [
  I('copper_ore', 'a grey rock chunk streaked with bright orange copper veins'),
  I('copper_ingot', 'a single polished orange copper ingot bar with a metallic sheen'),
  I('titanium_ore', 'a dark rock chunk studded with glowing pale blue titanium crystals'),
  I('titanium_ingot', 'a single polished pale blue-white titanium ingot bar, faintly glowing'),
  I('titanium_axe', 'a woodcutting axe with a dark handle and a glowing pale blue titanium head'),
  I('titanium_pickaxe', 'a pickaxe with a dark handle and a glowing pale blue titanium head'),
  I('titanium_sword', 'a sword with a glowing pale blue titanium blade and a dark wrapped grip'),
  I('titanium_helm', 'a pale blue titanium helmet with a narrow visor slit'),
  I('titanium_chestplate', 'a pale blue titanium breastplate armour'),
  I('titanium_greaves', 'pale blue titanium leg armour greaves'),
  I('titanium_boots', 'a pair of pale blue titanium armoured boots'),
  I('wall', 'a small section of stacked wooden log wall'),
  I('floor', 'a square tile of fitted wooden planks'),
  I('door', 'a small wooden door with iron hinges'),
  I('anvil', 'a small black iron anvil on a wooden block'),
  I('lantern', 'a copper and glass lantern with a warm glowing flame inside'),
  I('bandage', 'a rolled white cloth bandage tied with a strip'),
  I('ration', 'a wrapped bundle of preserved food tied with string'),
  I('torch_bundle', 'a bundle of four wooden torches tied together with rope'),
  I('throwing_knife', 'a small slim steel throwing knife with a wrapped handle'),
  I('rope', 'a neat coil of braided brown rope'),
  I('relic_blade', 'an ancient ornate sword with a dark blade and glowing golden runes along it'),
  I('prospectors_pick', 'an ornate brass and steel pickaxe with an engraved head, clearly a masterwork'),
  I('wardens_key', 'a large ornate dark iron key with a glowing blue gem set in the bow'),
  I('signal_core', 'a glowing blue crystalline power core in a metal housing, humming with energy'),
  I('survivors_log', 'a weathered leather-bound journal with loose handwritten pages'),
  I('antenna_frame', 'a folded metal antenna frame assembly of struts and brackets'),
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

const contentCreatures = [
  ...creature('husk', 3, 'a gaunt hunched humanoid husk with grey cracked skin and hollow glowing eyes'),
  ...creature('crawler', 3, 'a small fast six-legged insectoid crawler with a dark chitin shell'),
  ...creature('sentinel', 3, 'a tall armoured stone golem sentinel with glowing blue seams'),
  ...creature('warden', 3, 'a massive hulking armoured warden boss with a glowing blue core in its chest, imposing'),
];

const characters = [
  ...creature('player', 8, 'a friendly farmer character wearing a wide straw hat, a red shirt and blue denim overalls'),
  ...creature('cow', 3, 'a white and brown spotted cow'),
  ...creature('pig', 3, 'a plump pink pig'),
  ...creature('sheep', 3, 'a fluffy cream white sheep'),
  ...creature('chicken', 3, 'a white chicken with a red comb'),
];


// --- Biomes, villages, ranged combat and armour ----------------------------
// Three surface biomes, each gating one material the combat systems need, plus
// settlements to spend loot in. Grouped by atlas rather than by feature so the
// packer's per-atlas budgets stay legible.

const biomeTerrain = [
  T('snow', 'a continuous field of clean fresh snow, soft even powder with faint wind ripples'),
  T('marsh', 'dark wet peat bog ground, soaked earth with patches of moss and shallow water'),
  T('cracked_earth', 'pale dry cracked desert hardpan, polygonal cracks and fine dust'),
];

const biomeWorld = [
  // Desert
  L('cactus', 'a tall green saguaro cactus with two raised arms and rows of white spines'),
  P('dead_bush', 'a dry brittle leafless brown bush of tangled twigs'),
  P('desert_rock', 'a wind-carved pale sandstone boulder with smooth banded layers'),
  L('palm_tree', 'a tall slender palm tree with a curved trunk and a crown of green fronds'),
  // Snow
  L('pine_tree', 'a tall dark green conifer pine tree with snow resting on its branches'),
  P('snow_rock', 'a grey boulder capped with a thick rounded layer of white snow'),
  P('ice_shard', 'a cluster of pale translucent blue ice shards jutting up from the ground'),
  P('frost_flower', 'a small cluster of pale blue crystalline frost flowers on a frozen stem'),
  // Swamp
  P('reeds', 'a dense clump of tall green marsh reeds with brown seed heads'),
  P('lily_pad', 'two flat round green lily pads floating on dark water, one with a white flower'),
  L('swamp_tree', 'a gnarled dead swamp tree with bare twisted branches and hanging moss'),
  P('bog_iron', 'a rust orange lump of bog iron ore crusted with dark peat'),
  P('glow_moss', 'a patch of soft glowing pale green moss, faintly luminous'),
  // Villages
  L('village_house', 'a small cosy cottage with whitewashed walls, a steep red tiled roof, a wooden door and one shuttered window'),
  L('village_hall', 'a larger timber-framed longhouse with a thatched roof and a carved wooden porch'),
  P('well', 'a round stone village well with a wooden roof frame, a rope and a hanging bucket'),
  P('market_stall', 'a small wooden market stall with a striped awning and crates of goods'),
  P('signpost', 'a weathered wooden signpost with two blank arrow boards pointing opposite ways'),
  P('lamppost', 'a wrought iron village lamppost with a glowing warm yellow lantern on top'),
  P('crate', 'a stack of two wooden shipping crates with iron banding'),
  P('barrel', 'a wooden barrel with iron hoops, standing upright'),
];

const biomeItems = [
  // Gated materials
  I('plant_fiber', 'a small bundle of pale green stringy plant fibres, loosely tied'),
  I('thick_fur', 'a folded pelt of thick shaggy white winter fur'),
  I('reed_bundle', 'a tied bundle of straight green marsh reeds'),
  I('bog_iron', 'a rough rust orange lump of bog iron ore crusted with dark peat'),
  I('frost_crystal', 'a single faceted pale blue frost crystal with a cold inner glow'),
  I('glow_moss', 'a small clump of glowing pale green moss'),
  I('sand', 'a small conical heap of fine pale golden sand'),
  I('glass', 'a clear polished glass pane square with a faint blue-green edge'),
  I('cactus_flesh', 'a wedge of pale green juicy cactus flesh with a cut face'),
  // Ranged combat
  I('bow', 'a curved wooden shortbow strung with a taut pale string'),
  I('crossbow', 'a compact wooden crossbow with an iron trigger and a short taut string'),
  I('arrow', 'a single wooden arrow with grey fletching and a sharp iron head, pointing up-right'),
  I('iron_arrow', 'a single arrow with a heavy iron broadhead and white fletching, pointing up-right'),
  I('quiver', 'a brown leather quiver holding several arrows with feather fletching'),
  // Shields and armour
  I('wooden_shield', 'a round wooden shield with iron bands and a central boss'),
  I('iron_shield', 'a kite shaped iron shield with a riveted rim'),
  I('titanium_shield', 'a sleek pale blue-white titanium shield with a glowing seam'),
  I('fur_cap', 'a warm white fur hat with thick folded flaps'),
  I('fur_coat', 'a heavy white fur coat with a thick collar'),
  I('fur_leggings', 'thick white fur trousers'),
  I('fur_boots', 'a pair of tall white fur lined winter boots'),
  I('chainmail_coif', 'an iron chainmail hood of fine interlocking rings'),
  I('chainmail_hauberk', 'an iron chainmail shirt of fine interlocking rings'),
  I('chainmail_chausses', 'iron chainmail leg armour of fine interlocking rings'),
  I('iron_boots', 'a pair of heavy riveted iron boots'),
  // Village economy
  I('trade_token', 'a small stamped bronze trade token coin with a worn emblem'),
  I('supply_crate', 'a small closed wooden supply crate with rope handles'),
  I('village_charter', 'a rolled parchment charter tied with a red ribbon and a wax seal'),
  // The second ending
  I('power_cell', 'a cylindrical industrial power cell with a glowing green charge window'),
];

const biomeCreatures = [
  ...creature('scorpion', 3, 'a large sand coloured desert scorpion with raised pincers and a curled stinger tail'),
  ...creature('frost_wolf', 3, 'a large shaggy white winter wolf with pale blue eyes'),
  ...creature('bog_lurker', 3, 'a hunched mossy swamp creature of tangled weed and dark wet limbs, glowing eyes'),
  ...creature('villager', 3, 'a friendly villager in a brown belted tunic, simple trousers and a woollen cap'),
  ...creature('trader', 3, 'a travelling merchant in a long blue coat with a heavy pack and a wide brimmed hat'),
  ...creature('elder', 3, 'an old village elder in grey robes with a white beard and a walking staff'),
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
  ...biomeTerrain, ...biomeWorld, ...biomeItems, ...biomeCreatures,
  ...contentWorld, ...contentItems, ...contentCreatures,
];

export const BY_ID = new Map(CATALOG.map((a) => [`${a.atlas}/${a.id}`, a]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const counts = {};
  for (const a of CATALOG) counts[a.atlas] = (counts[a.atlas] || 0) + 1;
  console.log(`total assets: ${CATALOG.length}`);
  console.log('per atlas:', counts);
}
