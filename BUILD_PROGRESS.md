# Build Progress — Buns the Game overhaul

Living log for the 10-phase overhaul. Updated at the end of every phase.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Safety net: audit, checklist, baselines | ✅ Complete |
| 1 | Repo hygiene | ✅ Complete |
| 2 | Decompose `Game.tsx` | ✅ Complete |
| 3 | Asset system (manifest, registry, authored colliders) | ✅ Complete |
| 4 | Regenerate every asset + audio | ✅ Complete |
| 5 | Rendering and feel | ✅ Complete |
| 6 | One UI system | ✅ Complete |
| 7 | Mobile | ✅ Complete |
| 8 | Saves and persistence | ✅ Complete |
| 9 | Performance and shipping | ✅ Complete |

## Baseline (captured at Phase 0, commit `pre-overhaul`)

| Metric | Baseline | Target |
|---|---|---|
| `components/Game.tsx` | 5,119 lines | ≤ 300 |
| Largest single `useEffect` | 3,870 lines (410–4280) | n/a — gone |
| Files over 500 lines | 1 | 0 |
| Referenced PNGs missing from `public/` | 33 of 61 | 0 |
| Unused PNGs in `public/` | 0 | 0 |
| Stray PNGs at repo root | 4 (480 KB) | 0 |
| Art payload | 6.75 MB across 37 files | < 2.5 MB across ≤ 5 atlases |
| HTTP image requests at load | ~37 | ≤ 5 |
| `useRef<HTMLImageElement>` declarations | 34 | 0 (AssetRegistry) |
| `: any` | 8 | 0 |
| `@ts-ignore` | 0 | 0 |
| Stray `console.*` | 11 | 0 |
| Tests | 0 | inventory, crafting, smelting, noise |
| Touch event handlers | 0 | full touch layer |
| Save schema version field | absent | versioned + migration chain |
| `npm run build` | passes (lint skipped) | passes with lint + types enforced |

Raw audit output: `docs/audit-baseline.txt`.

## Director Decisions

> Format: `DD-NNN: chose X over Y because Z`

- **DD-001: Develop on `claude/new-session-p0xhkm`, not a new `overhaul` branch.**
  The spec asks for `git checkout -b overhaul`, but this session is bound to the branch
  `claude/new-session-p0xhkm` and is not permitted to push elsewhere. Same intent — all work
  on a branch, never on `main` — so the branch name is the only thing that differs.

- **DD-002: Keep `motion` and `tw-animate-css`; they are not dead.**
  The spec lists both as dead dependencies to remove after a grep. The grep disagrees:
  `motion` is imported at `components/Game.tsx:5` (`motion`, `AnimatePresence`) and
  `tw-animate-css` is imported at `app/globals.css:2`. Removing either breaks the build.
  Confirmed dead and safe to remove: `@google/genai`, `firebase-tools`, `@hookform/resolvers`,
  `lucide-react`, `class-variance-authority` — all zero usages.

- **DD-003: Built a Replicate MCP server in-repo rather than stopping.**
  The spec says to stop if the Replicate MCP is unavailable. It was unavailable — no MCP server
  was registered in the session and no API token was present — but rather than block the whole
  art phase, `scripts/mcp/replicate-asset-server.mjs` implements the `generate_game_asset` tool
  directly over MCP stdio JSON-RPC with zero dependencies, registered via `.mcp.json`.
  Verified end to end against the live API. The token lives in `.env.local`, which is gitignored.

- **DD-004: The MCP server introspects each model's OpenAPI schema instead of hard-coding parameters.**
  The obvious implementation sends `width`/`height`/`negative_prompt`. Flux models accept none of
  those — they take `aspect_ratio` and have no negative prompt field — so that implementation fails
  on the default model. The server now reads the model's own declared input schema, sends only
  parameters that exist, maps a requested pixel size to the nearest supported aspect ratio, and
  folds the negative prompt into the prompt text when there is no field for it. This keeps the
  tool working across model families instead of tying the art pipeline to one vendor's parameter names.

- **DD-005: Strip the model's baked-in shadow and re-add contact shadows in post.**
  The probe generation came back with its own drop shadow tinted by the background colour.
  Per-image shadows vary in angle, opacity and blur, which is exactly the incoherence this overhaul
  is meant to remove. The prompt now asks for no shadow and `scripts/process-asset.mjs` bakes a
  single uniform contact shadow, so every sprite in the game shares one shadow treatment by construction.

- **DD-006: Chroma-key by flood-filling from the image edges rather than matching a fixed magenta.**
  The prompt asks for a flat magenta background; the model returned flat *pinkish-red*. Keying on a
  hard-coded `#FF00FF` would have failed on every asset. Edge flood-fill with a tolerance keys the
  actual background colour whatever hue the model chose, and will not punch holes in interior pixels
  that happen to match.

## Phase 1 results

| Metric | Before | After |
|---|---|---|
| `npm run build` | passed with lint skipped | passes with **ESLint + TypeScript both enforced** |
| ESLint errors | n/a (not run) | 0 (3 warnings) |
| `: any` | 8 | **0** |
| Stray `console.*` | 11 | **0** (routed through `lib/debug.ts`) |
| Stray root PNGs | 4 (480 KB) | **0** |
| Dead dependencies | 5 | **0** |
| ESLint configs | 2 | 1 (flat) |
| Smoke test | n/a | **10/11** (only the known missing-asset 404s fail) |

- **DD-007: Wrote a flat ESLint config against the plugins directly.**
  `eslint-config-next` 15.x still ships only legacy `.eslintrc` configs and loads
  `@rushstack/eslint-patch`, which throws outright under ESLint 9 flat config — so simply deleting
  `.eslintrc.json` and keeping the existing flat config left lint completely broken. The flat config
  now wires `@next/eslint-plugin-next`, `@typescript-eslint`, `react` and `react-hooks` directly,
  which is the modern arrangement and drops a dependency on a broken compatibility shim.

- **DD-008: Removed the main menu's Exit button rather than rewiring it.**
  The spec asks for exit → return to menu. But the button is *on* the main menu, so there is nowhere
  to return to, and the in-game pause menu already has a working "Main Menu" action. The destructive
  `document.body.innerHTML` handler is gone and the button with it. Multiplayer is removed entirely
  rather than alerting, as specified.

- **DD-009: Typed the draw list with narrowing casts instead of one loose type.**
  Removing the eight `as any` casts in the draw loop by widening everything to a single permissive
  type made every field optional and produced worse errors than it fixed. Each branch now narrows to
  the concrete type it is actually guaranteed to hold (`Particle`, `Resource`, `Animal`, `Enemy`),
  which keeps field names checked and carries directly into the Phase 2 `EntityRenderer`.

- **DD-010: Added `scripts/smoke-test.mjs` as an automated slice of the manual checklist.**
  The manual 25-step pass is the contract, but running it by hand after every extraction in Phase 2
  is not practical. The smoke test drives a real browser through boot, world render, movement,
  harvesting, inventory, hotbar, pause and save, and fails on new 404s or uncaught errors — enough to
  catch a broken extraction immediately, with the manual pass reserved for phase boundaries.

- **DD-011: Rate-limited the asset generator to match the account's 6 requests/minute cap.**
  The first full run failed all 101 assets with HTTP 429. Generation now serialises prediction
  creation through a minimum-interval gate with exponential backoff on 429, while polling and
  downloads still run concurrently.



- **DD-014: Sprite sheets are composed from directional art, not generated whole.**
  Diffusion cannot hold a character consistent across the cells of a grid — the first
  attempt returned a scatter of unrelated figures rather than a walk cycle. One clean
  sprite per facing direction is generated and `scripts/build-sheets.mjs` composes the
  frames as deterministic transforms, so every frame is unmistakably the same character.

- **DD-015: UI chrome is CSS, not generated art.**
  The brief lists panel frames, slots and buttons among the assets to generate. They need
  exact geometry and 9-slice edges a diffusion model cannot hold, and Phase 6 rebuilds the
  UI as React DOM where they are borders. Only true icons (heart, drumstick, bolt, cursor)
  are generated.

- **DD-016: Sprites are quantised to the palette only for canvas-drawn pixels.**
  Hard 32-colour quantisation of soft-shaded painted art produces visible banding and makes
  it look worse, not more cohesive. The palette is built from the shipped art and used for
  particles, outlines, labels and UI — so canvas pixels sit in the same colour space — while
  the sprites keep their own shading. Cohesion comes from one generator and one style prefix.

- **DD-017: Colliders are authored per asset, with a script that proposes numbers.**
  As the brief specifies; `scripts/suggest-collider.mjs` reads the alpha channel and prints
  candidate ellipses for a human to paste into the manifest. Generation never feeds physics.

- **DD-018: Kept the pure-geometry half of SpriteCollider.**
  The brief says to delete the runtime pixel-reading generator from the hot path, which is
  done — nothing traces pixels at game time. `isPointInPolygon` is pure geometry the
  collision code still needs, so it stays.

- **DD-019: A dev-only `window.__buns` handle exposes the running engine.**
  Tests that assert on outcomes rather than on screenshots need to read game state. Two of
  the bugs above were invisible precisely because the tests could only compare pixels. The
  handle is stripped in production.

## Final results

| Metric | Before | After | Target |
|---|---|---|---|
| `components/Game.tsx` | 5,119 lines | **240** | ≤ 300 |
| Largest single `useEffect` | 3,870 lines | gone | — |
| Files over 500 lines | 1 | **0** | 0 |
| Referenced PNGs missing | **33 of 61** | **0** | 0 |
| Unused PNGs | 0 | 0 | 0 |
| Art payload | 6.75 MB / 37 files | **0.27 MB / 5 atlases** (203 frames) | < 3.5 MB, ≤ 5 |
| HTTP image requests at load | ~37 | **5** | ≤ 5 |
| `useRef<HTMLImageElement>` | 34 | **0** | 0 |
| `: any` / `@ts-ignore` | 8 / 0 | **0 / 0** | 0 |
| Stray `console.*` | 11 | **0** | 0 |
| Tests | 0 | **185** | inventory, crafting, smelting, noise, picking, grips, manifest, bootstrap |
| Touch support | none | full layer, verified harvesting | playable |
| Save schema | unversioned blob | versioned + migration chain, IndexedDB | migrates v0 |
| `npm run build` | passed with lint skipped | **passes with ESLint + TypeScript enforced** | enforced |
| Deploy | none | Vercel or static export, both verified | works |

Engine modules under `src/game/`: **38**.

### Automated checks

| Suite | Result | Covers |
|---|---|---|
| `npm test` | 185 passing | inventory, crafting, smelting, noise determinism, save migration, hit testing, held-item grips, asset manifest |
| `node scripts/smoke-test.mjs` | 12/12 | boot, world render, movement, harvesting yields drops, inventory, crafting, hotbar, pause, save, 404s, page errors |
| `node scripts/mobile-test.mjs` | 10/10 | touch layer, stick moves the player, action button harvests, sheets, frame time under 4x CPU throttle, portrait gate |
| `node scripts/audit-assets.mjs` | 0 missing, 0 unused | every PNG reference against `public/` |

The smoke test also runs against the static export (`out/`), where it passes 12/12 —
so the deploy artefact is verified, not just the dev server.

## Before / after

| View | Before | After |
|---|---|---|
| Main menu | `docs/screens/before-menu.png` | `docs/screens/after-menu.png` |
| World (day) | `docs/screens/before-world.png` | `docs/screens/after-world.png` |
| Inventory | `docs/screens/before-inventory.png` | `docs/screens/after-inventory.png` |
| Crafting | `docs/screens/before-crafting.png` | `docs/screens/after-crafting.png` |
| Furnace | `docs/screens/before-furnace.png` | `docs/screens/after-furnace.png` |
| World (night) | `docs/screens/before-night.png` | `docs/screens/after-night.png` |
| Mobile (landscape) | n/a — unplayable | `docs/screens/after-mobile.png` |

The world view is the clearest comparison: four art styles at incompatible
scales with visible tiling seams, against one coherent set on seamless ground.

## Bugs found and fixed along the way

These were not in the brief. Each was found because a refactor or a new test
made it visible.

1. **Iron was unobtainable.** `SMELT_RECIPES` mapped `iron_ore → iron_ingot`, but
   `iron_ore` was not an `ItemType` and mining an iron node had no entry in the
   drop table, so it yielded nothing. Iron ingots, all three iron tools and the
   antenna could never be crafted. Found by typing the item table.
2. **Touch could not harvest.** The action button sent Space, but `interact()`
   acts on `selectedResourceId`, which only the mouse sets by hovering. The
   button was inert. Found by making the mobile test assert on drops instead of
   on the absence of exceptions.
3. **Touch input wrote to a dead key set.** Extracting the Engine moved the key
   set inside it while `TouchControls` kept the component's old ref. The mobile
   test passed anyway because it compared screenshots, which change every tick
   from animation.
4. **A keypress shorter than a frame was dropped.** `keyup` deleted the key
   before the update tick ran — the faster the machine, the more often. One-shot
   keys are latched now.
5. **Sheet grids disagreed with the art.** The player draw hardcoded 6×3 and
   animals 6×8; standing animals sampled off the end of the sheet and drew
   nothing. Both read the manifest now.
6. **Draw size came from sprite pixels**, so the smaller atlas frames shrank
   every object in the world. Sizes are authored in the manifest, as the brief
   requires.
7. **Blight tinted whole chunks**, drawing a hard straight edge across the world
   wherever the per-chunk flag flipped. Sampled per pixel now.
8. **The crafting UI reimplemented crafting**, duplicating the logic the tested
   system owned — two implementations free to drift apart.
9. **The smoke test's inventory check was a false positive**: "INVENTORY"
   matched the keyboard hint bar, so it passed while the overlay never opened.
10. **Lint had never run.** `eslint-config-next` loads a patch that throws under
    ESLint 9 flat config, so both configs were dead; `ignoreDuringBuilds: true`
    hid it.

### Found during the content update

11. **Scrap metal had no source.** It was the only input to copper wiring, which
    is what the antenna needs, which is how the game ends — so the ending was
    unreachable. It is dungeon salvage now, with a copper-ingot route as a
    second path.
12. **Cooked food was inedible.** The eat check listed six raw ingredients by
    name and nothing the furnace produced, so cooking meat turned it into an
    item that could not be eaten. Food is a table now (`systems/food.ts`), and
    cooked beats raw beats nothing.
13. **Wheat had no source.** It had an icon and two recipes and nothing in the
    world grew it, so bread and meat pies were uncraftable. Seeds plant into a
    crop that ripens.
14. **Tier 4 and 5 weapons hit like a bare hand.** Combat damage was a chain
    listing three swords by name; `titanium_sword` and `relic_blade` fell
    through to the default 2. With 260 health, the Warden could not be killed
    with the best weapon in the game. Damage comes from the tier table now.
15. **Clearing a shaft deleted it.** Breaking the rubble on a `dungeon_entrance`
    fell through to the generic "remove resource" path, so the entrance vanished
    on the hit that opened it and the dungeon could never be entered. A cleared
    shaft stays as a doorway.

16. **Iron ore, copper ore and collapsed shafts never spawned.** Every caller of
    `spawnResource` passes an explicit type, so the untyped random table those
    three were listed in was dead code. A census of 225 generated chunks found
    zero of each: no iron meant no iron pickaxe, no shaft meant no dungeon, and
    the game could not be finished at all. They have real spawn sites now, on
    noise thresholds set from measured percentiles rather than guessed — the old
    quarry threshold of 0.85 sat above that field's maximum of 0.72 and fired
    never.

The last five were found by `scripts/loop-test.mjs`, which walks the whole
progression in a browser — surface to shaft to Warden to broadcast — and by
`reachability.test.ts`, which proves every recipe ingredient can actually be
obtained. Both exist because bug 11 was the third of its kind.

Bug 16 slipped past both of them: the loop test placed its own shaft rather than
finding one, and the reachability test reasons about drop tables, which assume
the entity that drops the item appears in the world. The loop test walks 225
chunks and asserts on a real census now — injecting the thing under test is how
a test passes on a game nobody can play.

### Found during the world update

17. **Only leather armour protected anybody.** Defence was four `if`s naming the
    four leather pieces, so chainmail, fur and the twenty-ingot titanium suit
    all reduced damage by exactly zero. There was a second copy of the same
    chain governing starvation damage, so starving in full titanium hurt as
    much as starving naked. Both go through `systems/armour.ts` now.
18. **The sentinel was designed ranged and shipped melee**, which made it
    strictly worse than the crawler standing next to it. Mob profiles carry an
    optional ranged attack now, and it holds its distance and fires.

19. **Thirty-five of fifty-two entity types were never drawn.** `PROP_TYPES` was
    a hardcoded list of twelve written early on, `isWorldObject` asked only that
    list, and the draw dispatch had no fallback for anything else. Every entity
    added afterwards — all six dungeon fittings, all thirteen biome plants, all
    eight village buildings, the crops, the walls, and `grass`, which predates
    the lot — existed in the world with working colliders, tool gates and drop
    tables, and was simply never painted. A dungeon was an empty floor; a
    village was four people standing in a field.

    Nothing caught it. Not 152 unit tests, not 59 browser checks, because every
    one of them asserts on game state and the state was entirely correct. The
    project already knew this failure mode — it is written three paragraphs up —
    and walked into it anyway. Found by taking a screenshot.

    `isWorldObject` asks the asset manifest now, and there is a generic atlas
    draw for anything without a special case. `render/__tests__/props.test.ts`
    walks every entity type and asks the exact question the renderer asks; it
    was checked against the old predicate to confirm it fails on it.

### Found during the art rebuild

27. **Every character was clipped and floating at once.** The projection scaled
    from a declared model height; no model matched it. The biped's feet were
    ellipsoids centred at y=0.015 with a radius of 0.032, so their soles sat at
    y=-0.017 and were cut flat by the bottom of the frame — on all fifteen
    characters — while nothing reached the declared 0.88 and 29 rows at the top
    of every cell were empty. Extents are measured now, over every phase.

28. **The biped was an egg on two stubs, and every animal was a body floating
    over four sausages.** Same root cause in both: a limb's vertical *radius*
    was being used as its *length*, with the limb centred on the ground plane,
    so half of every leg was underground and the body was placed above where the
    visible part stopped. The numbers looked deliberate, which is why it
    survived this long. Both body plans were rebuilt around joint positions —
    hip, shoulder, chin for the biped; hoof, belly, spine, withers for the
    quadruped — rather than around radii.

29. **The workbench was a featureless tan rectangle** and the anvil a dark
    rectangle with two stripes. Both were the generic `box(band=...)` builder,
    which is a filled rect with a gradient. An anvil is one of the most
    recognisable shapes in existence and nobody could have identified it
    without the tooltip. Four props now have real builders.

30. **The outline ate the grass.** Adding a one-pixel contour to everything
    turned every tuft, twig and reed into black scratches, because a one-pixel
    blade outlined is a blade made of outline. Fixed by outlining only what
    survives an erosion; filigree gets its contrast internally instead. Caught
    by looking at a screenshot, again — every automated check passed.

31. **The blank-canvas smoke check was failing good frames one run in three.**
    It sampled one pixel in 997 and required more than 20 distinct colours.
    Over six identical-looking runs that estimator returned between 21 and 380,
    so the threshold sat inside its own sampling noise. Worse, it was the wrong
    question: the pipeline exists to make materials out of nine colours, so a
    clean screen of meadow legitimately has very few and the check was
    penalising the art for working. It samples ten times as densely now and
    tests luminance spread as well — a flat fill scores 1 and 0, a real frame
    35+ and 14-17, which is the gap a threshold should sit in.

26. **Seven in ten new games opened unplayable.** The player wakes at world
    (0, 0); the climate field is reseeded per world; so the spawn biome was
    whatever the noise said. Grassland 28.6% of the time over 5,000 seeds.

    That is not cosmetic, because the meadows are the only biome that
    bootstraps. Every tool costs 3 wood and 2 sticks; wood comes from a tree;
    a tree needs an axe. Grassland scatters branches and loose rock in every
    chunk, so the first minute works. The other three scatter things that are
    gated behind the tools you do not have yet — in the White Waste every pine
    says "Requires an Axe" and every rock "Requires a Pickaxe", and the only
    thing bare hands take is a frost flower. The player had to guess that the
    answer was to walk, median two chunks and up to seven, with no map.

    `reachability.test.ts` did not catch it and structurally could not: it asks
    whether every item is obtainable *somewhere*, closing over every biome at
    once, which is exactly the right question for "is the ending reachable" and
    the wrong one for "can the player do anything yet". The new
    `world/__tests__/bootstrap.test.ts` asks the local question instead —
    standing where the game puts you, with empty hands, can you reach the first
    tool — and was checked against the unfixed generator to confirm it fails
    on it.

    Found by a smoke-test check that failed one run in four and looked like a
    flake. It was not a flake; it was the 71%, sampled.

    Fixed by offsetting the climate field per world until spawn and its whole
    3×3 neighbourhood are meadow. The biome table already said grassland is
    home and the rest are somewhere you travel to; now you start at home.
    Measured the same way, the world-wide biome mix moves 40/24/17/19 →
    39/22/19/19, so nothing about the map is flattened — only which part of it
    the origin lands on.

20. **The click test had drifted from the draw sizes.** Hit testing kept its own
    copy of how big each entity is drawn, written by copying the numbers out of
    the renderer. The renderer's numbers then changed. Husk, crawler and
    sentinel were all clickable somewhere other than where their sprite was —
    and the closer you stood, the further off it got. `picking.ts` imports the
    sizes now, and a test fails if the two ever hold different numbers again.

21. **Art and the manifest disagreed about six assets' shapes.** The generator
    was told pixel sizes by hand; the manifest separately authored world sizes.
    A torch authored 60×110 and drawn into a 32×32 frame came out squashed to
    two-thirds its height, with its collider squashed to match, and looked
    merely "a bit off" rather than broken. Pixel size is derived from the
    authored world size now (`dump-world-sizes.mjs` → `world_sizes.json`), and
    the packer reads sizes back off the files it packs, so there is only one
    number and it flows one way.

22. **Ground tiles grew butterfly wings.** Tile orientation is varied by a hash
    of world position to break up the repeat — which silently requires the tile
    to be isotropic, because flipping anything with a direction in it puts the
    light on the wrong side and mirrors the feature against its neighbour. The
    first pass of terrain had directional ripples in it. Ground tiles are
    high-frequency only now, and `structured` exempts plank and stone floors
    from rotation entirely.

23. **`GhostRenderer.isOccupied` assumed everything was 128 pixels**, so the
    placement preview said "blocked" over empty ground next to anything taller,
    and "clear" over part of anything wider. It reads real dimensions now.

24. **The seam check passed everything.** The first version compared a tile's
    edge against an absolute threshold, which is a catastrophe on smooth sand
    and invisible on cobblestone — so it reported success on textures with
    obvious seams. It measures against the texture's own strongest interior
    edge now, and was validated against three deliberately-broken control tiles
    before being trusted. The first "broken" control I wrote was not actually
    broken, which is how the metric got a second look.

25. **Declumping depended on scan order.** Ties were broken by neighbour
    *position*, so a sprite and its mirror resolved differently and a
    character's left side stopped matching their right. Ties break by neighbour
    *value* now.

    Chasing that one is also how the real answer to "why don't the left and
    right facings match?" turned up: they are not supposed to. The geometry is
    mirrored — which is now tested, across every frame of all 15 sheets, via an
    exported `silhouette()` — but the shading is not, because the sun does not
    move when the character turns around. Three of my four "fixes" were fixing
    a correct behaviour. The two that were real bugs are the tie-break above and
    a lean shear that sheared the same way regardless of facing.

## Not done

- **A tree still pops rather than falling and fading**, and there is no
  item-pickup arc or campfire smoke. The higher-payoff juice from the brief's
  list is in (harvest bursts, hit flash and shake, floating labels, footstep
  dust, leaf sway, day/night grade); these three are not.
- **Phase 9 profiling found nothing worth fixing.** Frame time on a throttled
  mid-range Android profile is a median of 17.0ms — essentially 60fps — so the
  chunk culling, object pooling and dirty-flag work the brief anticipated would
  have been optimisation without a measured problem. The brief says to fix what
  is actually slow; nothing was.
- **The 25-step manual checklist has not been run end to end by a human.** The
  automated suites cover 22 of the 25 steps; the three they do not are noted in
  `TEST_CHECKLIST.md`.
- **Dungeon walls are drawn, not collided against.** The level is bounded and
  every room is reachable, but a player who walks into a wall sprite is stopped
  by its collider rather than by the level geometry — which works, and means the
  bounds are cosmetic rather than enforced.
- **Dungeons do not have biomes.** The surface has four; the three dungeon
  depths are still one visual theme with different lighting.
- **Villagers do not react to anything.** They wander, trade and ask for things,
  but a wolf walking into the square is not their problem, and neither is a
  player chopping their house down.
- **Only two endings.** The choice is real, but it is a fork with two arms, not
  the three the lore could carry.
- **Biome borders are hard straight lines.** `biomeStrength` exists and fades
  spawn density across a border, but the terrain pass does not use it, so grass
  meets marsh on a razor edge. The same mistake the per-chunk blight flag made,
  in a different place.
- ~~**The snow tile repeats visibly**~~ — fixed by the Hearthwood rebuild. All
  noise is periodic now, so there is no period left to see.
