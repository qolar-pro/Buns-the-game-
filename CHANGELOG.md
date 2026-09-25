# Survivors Juicy Buns - Change Log

## [Version 0.5.1] — The art actually reads (2026-09-25)

0.5.0 built the pipeline. This is the pass where the output stopped looking
like a tech demo of a pipeline. Every change here comes from studying what makes
Minecraft's and Terraria's default art legible at small sizes and applying the
principle — not their assets, which are theirs.

### Changed
- **One shared near-black outline** on every prop, item and character, grown
  outward, applied after the grade so it keeps the exact palette floor. Each
  object used to be rimmed in step 0 of its *own* ramp, which for skin is a mid
  tan — the figures had no contour against the ground at all, which is the whole
  reason they read as blobs.
- **Flat banded shading with an ordered dither**, replacing a continuous
  lighting expression rounded to the nearest step. Four bands held flat, with a
  fixed Bayer matrix breaking the boundaries so a curved surface does not draw
  concentric contour lines. Hard steps are what make nine colours legible;
  rounding a gradient just gives you an airbrush with stairs in it.
- **Ground detail gets its contrast internally.** A blade of grass cannot carry
  an outline — one pixel outlined is one pixel of outline — so each blade is now
  a shaded stroke and a lit stroke side by side, two steps either side of the
  middle of the ramp.

### Fixed
- **Every character in the game was clipped and floating at the same time.** The
  projection scaled from a declared model height that no model matched: the
  biped's feet sat below y=0 and were cut flat by the bottom of every frame,
  while 29 rows at the top of each cell were empty. Extents are measured now,
  over every phase of the gait, so a part added later cannot push a foot off the
  frame.
- **Bipeds were an egg on two stubs.** The legs were ellipsoids centred at y=0
  with a vertical radius of 0.16 — half of each leg underground, and only its
  top 0.045 clearing the torso. Rebuilt with the proportions a figure has:
  shoulders wider than hips, a drawn-in waist, a neck, a head about a quarter of
  standing height, and a brow and eye highlights, because two black dots is a
  mannequin.
- **Every animal was a body floating over four detached sausages**, the same
  mistake in the quadruped: `leg_len` was used as the leg's half-length with the
  leg centred on the floor, and the barrel was then placed above where the legs
  stopped. Legs now run from hoof to belly and overlap into the barrel, since an
  ellipsoid's underside curves away from where the leg actually meets it.
- **The workbench was a blank tan rectangle** and **the anvil was a dark
  rectangle with two stripes** — both were the generic `box` builder, and the
  anvil is one of the most recognisable silhouettes there is. Both are now
  built as themselves: the bench has legs, a stretcher, a slab with plank seams
  and tools on the wall; the anvil has a horn, a waist and a base. The bed and
  the cut stump likewise (the stump is a log end, rings and all, not an oval).
- **The blank-canvas smoke check failed one run in three on perfectly good
  frames.** It sampled one pixel in 997 and demanded more than 20 distinct
  colours, which is both a thin estimator (21 to 380 over six identical-looking
  runs) and the wrong question — the pipeline's whole point is that a material
  uses nine colours, so the check was penalising the art for being clean. It
  samples ten times as densely now and tests luminance spread as well: a flat
  fill scores 1 colour and a spread of 0, a real frame 35 or more and 14 to 17.

## [Version 0.5.0] — Hearthwood (2026-09-25)

Every texture in the game, regenerated. Not retouched — replaced, by a
deterministic generator that makes all 203 of them out of the same colour ramps
under the same light.

### Added
- **The Hearthwood texture pipeline** (`tools/hearthwood/`). Materials are
  painted as *index maps* — arrays of ramp steps — and only looked up in a
  colour at the very end, so no script anywhere ever picks an RGB value. Ramps
  are 7–9 steps built in OKLab, hue-shifted −6° at the darkest to +6° at the
  lightest, floored at `#1c120b` and ceilinged at `#fff7e6`, with the chroma
  boost weighted by existing chroma so greys stay grey. One final OKLab grade
  runs over every texture in the game with identical parameters.
- **`palettes.py`**, the colour source: the ten reference ramps verbatim plus 33
  derived materials, each built by resampling anchor colours *in Lab* rather
  than RGB.
- **Seamless by construction.** All noise is periodic — wrapping value noise,
  2–3 octaves, persistence 0.55 — so tiles have no cross-fade band where a
  blend used to be. Verified by tiling 3×3 on every build, against the
  texture's own strongest interior edge rather than an absolute threshold.
- **Characters are one model, rotated.** Ellipsoid parts placed in 3D, turned
  about the vertical axis per facing, painted back to front by depth, with a
  procedural gait. The four rows of a sheet are the same model at 0/90/180/270°,
  which is the only way to keep 15 characters consistent from every angle.
- **A placement ghost.** Holding a placeable shows exactly where it will land:
  green grid square for snapped pieces, footprint ellipse for free-placed props,
  the item's sprite ghosted over it, red when the spot is blocked. Preview and
  placement call the same `snapTo()`, so they cannot disagree.
- **Held items**, drawn in hand and oriented to facing, with a grip per item
  type — tools by the handle, blocks carried in front, a torch held up and out.
- **One hit test for everything clickable** (`src/game/systems/picking.ts`):
  mobs, NPCs, resources, props, dropped items, placed buildings. Candidates are
  sorted in draw order so clicking overlapping objects picks the one on top.
- **The contact sheet** (`docs/contact/hearthwood.png`): every asset labelled at
  8× nearest-neighbour, every seamless tile at 3×3, and the ground materials
  mapped onto isometric cubes so the light direction can be checked on three
  faces at once.
- **Buildings with real architecture** — staggered shingle courses, framed
  windows with sills and mullions, recessed door panels, brick chimneys with a
  lip, foundation courses, eave shadows and timber trim — at 128px rather than
  the previous 32 and 64.
- **`docs/IMPORT.md`**: point/nearest filtering, no compression, mipmaps off,
  per engine, with the scale and tiling rules.
- 45 new unit tests (185 total) over hit testing, held-item grips, the manifest,
  prop drawing, and whether a new game can be started from where it puts you.

### Fixed
- **Seven out of ten new games could not be started.** The player always wakes
  at world (0, 0), the climate field is reseeded per world, so the spawn biome
  was whatever the noise happened to say — grassland only **28.6%** of the time,
  measured over 5,000 seeds. Every tool in the game costs 3 wood and 2 sticks,
  and wood comes from felling a tree, which needs an axe. Only the meadows
  bootstrap that, with bushes, branches and loose rock in every chunk. Wake in
  the Dust Flats, the White Waste or the Sunken Fen and bare hands get you plant
  fibre, frost flowers or reeds: every tree answers "Requires an Axe", every
  rock "Requires a Pickaxe", and the crafting tree cannot be entered at all
  until you guess that the answer is to walk — a median of two chunks, up to
  seven, with no map. The climate field is offset per world now until spawn and
  its whole 3×3 neighbourhood are meadow. Worlds stay as varied and as
  reproducible as before; measured the same way, the biome mix moves from
  40/24/17/19 to 39/22/19/19.
- **35 of the game's 52 entity types were never drawn.** `isWorldObject` tested
  against a hardcoded list that had stopped tracking the entity union, so
  everything added after it — most of the biome flora, the village props, the
  dungeon furniture — was simulated, collided with, and invisible. Found by
  taking a screenshot. 152 unit tests and 59 browser checks had all passed,
  because every one of them asserts on game state.
- **The click test had drifted from the draw sizes.** `picking.ts` kept its own
  copy of how big each entity is drawn; husk, crawler and sentinel had since
  changed, so the clickable area was not where the sprite was. Sizes are now
  imported from the renderers and a test fails if they ever diverge again.
- **Art and manifest disagreed on six assets' aspect ratios** — a torch
  authored 60×110 and drawn 32×32 square was squashed to two-thirds height,
  collider and all. Pixel size is now derived from the authored world size in
  one direction, and the packer reads sizes back off the actual files, so the
  two cannot drift.
- **The snow tile's visible repeat** is gone; wrapping noise has no period to
  see.
- **Butterfly artifacts in the ground.** Tile orientation is varied by a hash of
  world position to break up repetition, which turns any directional feature in
  a tile into mirror seams. Ground tiles are isotropic now, and structured
  surfaces (plank and stone floors) are exempt from rotation.
- `GhostRenderer.isOccupied` assumed every object was 128px; it reads real
  dimensions now.
- A cobblestone seam at 128px, from computing region lighting off unwrapped
  pixel centroids rather than wrapped Voronoi site positions.

### Changed
- Art payload **2.61 MB → 0.27 MB** for more assets at higher resolution. Not
  compression: art made of nine colours compresses like nine colours.
- Asset builds take **17 seconds, offline**. No model, no API token, no network,
  and byte-identical output for the same input.
- The Replicate pipeline is kept but no longer produces anything shipped.

### Known limitations
- The generator is Python (numpy, Pillow, scipy) and is not part of `npm
  install`. A clone builds and runs the game without it — both
  `assets-build/` and the packed atlases are committed.

## [Version 0.4.0] - The world (2026-09-17)

Biomes to travel to, villages to spend loot in, bows to fight with, and a second
ending to choose instead of the first.

### Added
- **Three surface biomes** beside the meadows — the Dust Flats, the White Waste
  and the Sunken Fen — each with its own terrain, flora and native mob, and each
  gating one material the combat tree needs: plant fibre for bows, thick fur for
  the fur armour set, reeds for arrows in bulk. Biome thresholds were chosen by
  sweeping every combination against 6,561 sampled chunks, not guessed.
- **Villages**: a fixed street plan, four residents, roughly one every
  twenty-five chunks, never in the fen. Barter trade by role, two stable
  requests per settlement, and a safe haven where nothing hostile spawns.
- **Sleeping**: a bed at night takes you to dawn, with nothing dangerous within
  600 units. Beds previously did nothing but break.
- **Ranged combat**: bows and crossbows firing simulated arrows that travel, can
  miss, and are mostly recoverable. Bound to the action button, so touch shoots
  too. The sentinel fights at range now, as it was always meant to.
- **Armour that works**: four sets with real defence values, weight, and a
  matched-set bonus. Shields block while held.
- **A second ending.** The signal core powers the antenna or the village
  generator, and there is one core. RESCUED, or SETTLED. Neither is the good
  ending; the summary underneath is identical, because the run was.
- 77 new art assets (248 total), 21 new recipes (63 total), ~35 new items.
- `scripts/world-test.mjs`: 24 browser checks over biomes, villages, trade,
  ranged combat, armour, sleeping and the second ending. Nothing is injected —
  every check walks the generated world.

### Fixed
- **Iron ore, copper ore and collapsed shafts never spawned.** They were listed
  in a random table that no caller reached, so a census of 225 chunks found zero
  of each: no iron, no dungeon, no ending. The game could not be finished.
- **Only leather armour protected anybody.** Chainmail, fur and a full titanium
  suit all gave zero defence, in two separate copies of the same chain.
- The bed could never be used, only chopped up.

### Changed
- Art budget raised from 2.50 MB to 3.50 MB. The asset count went from 113 to
  248; palette quantisation would fit the whole set in 0.9 MB but shifts 3.5% of
  the character atlas by more than 24/255, which is visible banding on every
  sprite. Cheaper art is not smaller art. Actual payload: 2.61 MB.
- `spawnResource` requires a type, so content cannot be added to a dead table
  again. Armour, biome flora, mob profiles, trade stock, village requests and
  placement rules are all data tables.

## [Version 0.3.0] - Content (2026-09-17)

The game now has an arc: stranded, dig, fight, broadcast, rescued. Nothing from
v0.2.0 was removed.

### Added
- **An ending.** Craft the antenna frame, restore it with copper wiring, install
  the signal core taken from the Warden, and broadcast. A summary screen closes
  the run with days survived, depth reached, chests looted and mobs defeated.
- **A quest log**: 13 ordered objectives that always name the next concrete
  action, derived from game state rather than handed in, and sticky so spending
  an item never un-completes a step.
- **Dungeons**: three hand-bounded levels of rooms and corridors, generated from
  the world seed, with chests, ore in the walls, braziers, stairs down and a way
  out. Rooms are joined in sequence, so a level can never strand a room.
- **Loot**: weighted per-depth chest tables with four uniques — the lantern, the
  prospector's pick, the relic blade and the Warden's key — each of which can
  only be found once per run.
- **Four mobs**: husk, crawler, sentinel and the Warden, all driven by one
  profile table and drawn from generated sprite sheets.
- **Two ores**: copper and titanium, with ingots, wiring and a titanium tool
  tier behind an anvil.
- **Building**: walls, floors and doors that snap to a grid so a row of them is
  actually a wall, plus a placeable anvil. Everything placed breaks back into
  the item that made it. Bound to `F` and to a `PUT` button on touch.
- **Farming**: wheat seeds plant into a crop that ripens into wheat, which is
  what bread and meat pies are made of.
- **The survivor's logs**: six story fragments found in chests, read on pickup.
- 18 more recipes (43 total), ~30 more items, and 58 new art assets.
- `scripts/loop-test.mjs`: a 19-check browser run of the entire progression,
  surface to shaft to Warden to broadcast.
- `reachability.test.ts`: proves every recipe ingredient can actually be
  obtained from something in the world. Written because three separate content
  updates had each shipped an item nothing produced.

### Fixed
- **Scrap metal had no source**, which made copper wiring, and therefore the
  antenna, and therefore the ending, unreachable.
- **Cooked food could not be eaten.** The eat check listed six raw ingredients
  by name and nothing a furnace produced, so cooking meat made it useless.
- **Wheat had no source**, so bread and meat pies were uncraftable.
- **Titanium swords and the relic blade did 2 damage** — the same as a bare hand
  — because combat named three swords explicitly. The Warden could not be killed
  with the best weapon in the game.
- **Clearing a collapsed shaft destroyed it** on the hit that opened it, so no
  dungeon could ever be entered.

### Changed
- Tool gates, harvest drops, break thresholds, mob stats, mob drops, chest
  tables, placement rules and food values are all data tables now. Four of the
  five bugs above were branches that a table would not have allowed.
- Lighting underground is set by depth rather than the clock, and the lantern
  lights from anywhere in the pack rather than only the held slot.

## [Version 0.2.0] - Overhaul (2026-09-15)

A full polish and art-regeneration pass. Every system from v0.1.0 still works;
nothing was removed from the game.

### Added
- **All 113 game assets regenerated** and packed into 5 atlases. 33 of 61
  referenced PNGs previously did not exist, so over half the item table was
  drawn with hand-written SVG placeholders.
- Touch support: virtual stick, action/inventory/sprint buttons, tap-to-interact
  on the nearest target, full-screen sheets, portrait rotate prompt.
- Versioned saves in IndexedDB with a migration chain, autosave, an export to
  file, and a readable error instead of a white screen on a bad save.
- Floating "+2 wood" labels, a hit flash on struck objects, per-material harvest
  sounds, pickup/eat/place/container cues, a low-health heartbeat, a day/night
  sting and a two-layer ambient bed that crossfades with the clock.
- Loading screen with real progress, error boundary, favicon and OG image.
- 44 unit tests, a 12-check browser smoke test and a 10-check mobile test.

### Changed
- `components/Game.tsx` went from 5,119 lines to 240. The 3,870-line `useEffect`
  is gone; the engine lives in `src/game/` as 38 modules and runs outside React.
- All UI is React DOM. The canvas HUD is deleted.
- Art payload: 6.75 MB across 37 files to 1.09 MB across 5, so 5 requests at
  load instead of 37.
- Colliders and draw sizes are authored in an asset manifest rather than derived
  from pixels, so regenerating art can no longer change physics or scale.
- Terrain tiles are seamless; the ground no longer shows repeat seams.
- Saves moved from a single unversioned `localStorage` blob to IndexedDB.
  Pre-overhaul saves are listed and migrated on load.

### Fixed
- **Iron was unobtainable.** Mining an iron node yielded nothing, so iron
  ingots, all three iron tools and the antenna could never be crafted.
- **Harvesting was impossible on touch** — the action button had no way to
  select a target.
- Keypresses shorter than a frame were dropped.
- Player and animal sprite sheets were drawn with hardcoded grids that did not
  match the art, so standing animals drew nothing.
- Blight tinted whole chunks, drawing hard straight edges across the world.
- The crafting UI reimplemented crafting rather than using the shared system.
- ESLint had never actually run: both configs were broken and the build
  suppressed it. Lint and TypeScript are enforced at build time now, with zero
  errors and zero `any`.
- The main menu's Exit button destroyed the page; Multiplayer alerted "Coming
  Soon". Both removed.

## [Version 0.1.0] - Current Version (2026-04-04)

### Added
- **Core Gameplay**:
  - Top-down 2D movement with WASD.
  - Resource gathering system (Trees, Rocks, Coal, Ores).
  - Stamina and Hunger management systems.
  - Day/Night cycle with dynamic lighting and time-based events.
  - Animal/Mob system (Chickens, Pigs, Sheep, Cows) with drops (Meat, Wool, Leather, Feathers, Eggs).
  - Combat system with Swords and Tool-based harvesting (Axes, Pickaxes).
- **Inventory & Crafting**:
  - Full inventory system (9 hotbar slots + main inventory).
  - Equipment system (Head, Body, Legs, Feet, Back slots).
  - Crafting menu with multiple recipes (Tools, Armor, Furniture).
  - Smelting system (Furnace) for processing ores into bars.
  - Storage system (Chests) for keeping items.
- **Building & Placement**:
  - Placeable objects: Workbench, Furnace, Chest, Campfire, Torch, Bed.
  - Interaction system for placed objects (E to open, Space to interact).
- **Farming**:
  - Saplings and Wheat Seeds for growing trees and crops.
- **UI/UX**:
  - Modern, dark-themed gaming UI with Fluent Design elements.
  - Health, Hunger, and Stamina bars.
  - Hotbar with selection highlighting.
  - Admin Panel for world control (Time, Hitboxes, Respawn).
  - Dynamic tooltip and message system.

### Changed
- **Icon Visibility Improvements**:
  - Scaled up **Sapling** and **Wheat Seeds** icons to **2.5x** size for better visibility in the hotbar and inventory.
  - Redesigned SVG placeholders for all items to ensure clarity when image assets are missing.
- **Rendering Enhancements**:
  - Implemented manual canvas-based "models" for placed resources (Furnace, Chest, Workbench, Campfire) as fallbacks for missing images.
  - Improved `ItemIcon` component with robust error handling and automatic placeholder switching.
- **Performance & Stability**:
  - Optimized the main game loop for smoother rendering.
  - Fixed various syntax errors and build failures in the `Game.tsx` component.
  - Improved collision detection and interaction shapes for placed items.

### Fixed
- Fixed an issue where sapling and seed icons were too small to see in the hotbar.
- Fixed a bug where placed items (Furnace, Chest, etc.) would not render if their image assets failed to load.
- Resolved build failures related to misplaced code blocks in the drawing logic.

---

## [Version 0.0.0] - Initial Prototype

### Added
- Basic player movement.
- Simple grid-based world generation.
- Placeholder graphics for player and resources.
- Initial inventory structure.
