# Buns the Game

A top-down 2D survival game for the browser. Gather wood and stone, craft tools,
smelt ore, farm, keep animals, and stay fed through a day/night cycle in a
procedurally generated, infinitely streaming world.

Built with Next.js 15, React 19 and TypeScript, rendered to a single `<canvas>`.

## Running it

**Prerequisites:** Node.js 20 or newer.

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build (ESLint + TypeScript both enforced)
npm start        # serve the production build
```

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint (needs hunger above 6) |
| `Space` | Interact / harvest / attack |
| `F` / right-click | Place the held item (walls, floors and doors snap to a grid) |
| `Space` (holding a bow) | Shoot |
| `E` | Toggle inventory and crafting |
| `1`–`9` | Select hotbar slot |
| `X` | Sit |
| `R` | Respawn at world spawn |
| `N` | New game |
| `Esc` | Pause menu (save, settings, return to main menu) |

On a touch device the game swaps to a virtual stick, USE/PUT/BAG/RUN buttons and
full-screen inventory sheets. Portrait orientation shows a rotate prompt.

## Project structure

```
app/                    Next.js app router entry (layout, page, globals.css)
components/
  Game.tsx              canvas element, React <-> engine bridge, lifecycle only
  MainMenu.tsx          title screen, save browser, options
  ui/                   React DOM overlays: hotbar, inventory, crafting, furnace
src/game/
  core/                 game loop, state shape, tunable config, shared types
  world/                noise, chunk lifecycle, world generation rules
  systems/              pure logic: movement, collision, harvesting, combat,
                        inventory, crafting, smelting, placement, animals,
                        day/night, survival, farming. No React, no DOM, no canvas.
  render/               draw orchestration, terrain, lighting, entities, particles
  assets/               manifest (single source of truth), registry, colliders
  input/                keyboard+mouse, touch, shared input state
  save/                 save schema, serialisation, version migrations
lib/                    sound, debug logging, small shared helpers
scripts/                asset pipeline and maintenance tooling
public/                 shipped art: packed atlases only
docs/                   ASSETS.md, audit baseline, screenshots, save fixtures
```

`src/game/systems/` and `src/game/world/` are deliberately pure TypeScript.
Given `(state, input, dt)` they mutate state and nothing else, which is what
makes them unit-testable without a browser.

## Tests

```bash
npm test          # vitest, single run
npm run test:watch
npm run typecheck
npm run lint
```

Unit tests cover inventory, crafting, smelting and noise determinism — the four
systems that break silently when refactored.

`TEST_CHECKLIST.md` is the 25-step manual regression pass. Run it after any
change that touches gameplay.

## Assets

All shipped art lives in a handful of packed atlases under `public/sprites/`, and
every frame is declared in `src/game/assets/manifest.ts` — the single source of
truth for frame rectangles, anchors, world sizes and colliders.

To regenerate or add art, see **[docs/ASSETS.md](docs/ASSETS.md)**, which covers
the style bible, the exact prompt template, the pipeline commands and how to add
one new asset end to end.

```bash
npm run audit:assets      # referenced-but-missing / present-but-unused, and payload size
npm run assets:generate   # generate raw art via Replicate (needs REPLICATE_API_TOKEN)
npm run assets:process    # background removal, trim, resize, quantise, outline, shadow
npm run assets:pack       # pack atlases and emit manifest frame data
```

`npm run audit:assets` must report **0 missing, 0 unused**; it exits non-zero
otherwise so it can gate CI.
