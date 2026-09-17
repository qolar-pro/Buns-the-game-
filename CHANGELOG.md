# Survivors Juicy Buns - Change Log

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
