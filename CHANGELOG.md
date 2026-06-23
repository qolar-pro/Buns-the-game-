# Survivors Juicy Buns - Change Log

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
