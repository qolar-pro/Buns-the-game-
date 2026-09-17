# Assets

Everything the game draws comes from five packed atlases under `public/sprites/`,
declared in `src/game/assets/manifest.ts`. Nothing else is loaded at runtime.

| Atlas | Contents | Frames |
|---|---|---|
| `terrain.png` | seamless ground tiles | 6 |
| `world.png` | props, resources, ground detail, effects | 33 |
| `items.png` | inventory icons | 48 |
| `characters.png` | player and animal sprite sheets | 5 |
| `ui.png` | HUD icons | 6 |

Total shipped art is about **1.1 MB**, against a 2.5 MB budget, in 5 requests.

---

## Style bible

Every prompt is built from a shared prefix so a mixed-origin set reads as one
game. The prefix lives in `scripts/lib/replicate.mjs` — change it there, never
per asset.

- **View:** top-down three-quarter, camera ~60° above the horizon. This is the
  single biggest consistency failure in generated sets; one wrong-angle tree
  undoes twenty right ones.
- **Light:** one warm sun from the upper left at 45°, soft ambient fill.
- **Rendering:** hand-painted, chunky, stylised. Bold readable silhouettes over
  fine detail, with a crisp dark outline so objects separate from the ground.
- **Palette:** `src/game/render/palette.ts`, 32 colours clustered from the
  shipped art by `scripts/build-palette.mjs`. Canvas-drawn pixels (particles,
  outlines, UI) use it so they sit in the same colour space as the sprites.
- **Background:** flat magenta chroma key, removed in post.
- **Shadows:** the prompt asks for *no* shadow. Every sprite gets one uniform
  contact shadow baked in post instead, so all shadows match by construction.

**Terrain is the exception.** A tileable texture must fill the frame, so it must
not get the "isolated on a chroma key background" language. Mixing the two
produced grass tufts floating on magenta instead of a grass texture. The prefix
is category-aware; `prefixFor('terrain')` swaps in full-bleed framing.

## Canonical sizes

Authored in `scripts/asset-catalog.mjs`. **Never derived from pixels** — deriving
draw size from image dimensions is what made every object in the world shrink
when the art was regenerated at a smaller resolution.

| Category | Size |
|---|---|
| Terrain tiles | 128×128, seamless in both axes |
| Item icons | 64×64 |
| Small props (rock, sapling, twigs) | 64×64 |
| Medium props (bush, campfire, torch, fence) | 128×128 |
| Large props (tree, workbench, furnace, chest, bed) | 128×192 |
| Player sheet | 8 cols × 4 rows of 64×96 |
| Animal sheets | 3 cols × 4 rows of 64×64 |

Sheet rows are always `down, left, right, up`.

## Pipeline

```bash
npm run assets:generate   # Replicate -> assets-src/   (needs REPLICATE_API_TOKEN)
node scripts/build-palette.mjs 32
npm run assets:process    # assets-src/ -> assets-build/
node scripts/build-sheets.mjs
npm run assets:pack       # assets-build/ -> public/sprites/ + frames.ts
npm run audit:assets      # must report 0 missing, 0 unused
```

`assets-src/` (raw generations) and `assets-build/` (processed frames) are
gitignored; only the packed atlases are committed.

### What each step does

**Generate.** `scripts/generate-all.mjs` walks the catalogue, skipping anything
already present, so an interrupted run resumes. Prediction creation is rate
limited to match the account cap (this account is 6/min) with backoff on 429.

**Process.** `scripts/process-asset.mjs`, deterministically:

1. **Background removal** by flood-filling inward from the image edges, keyed on
   *hue* rather than RGB distance. The generator does not reliably return the
   magenta it is asked for, and the shadow it bakes in despite instructions is
   the same hue as the background — a hue test removes both. Filling from the
   edges preserves magenta-ish detail inside a subject; a tighter second pass
   clears background enclosed by the subject.
2. **Trim** to the alpha bounding box.
3. **Resize** into the canonical box with lanczos3.
4. **Outline**, 1–2px of the palette's darkest colour.
5. **Contact shadow**, one ellipse with the same opacity and blur everywhere.
6. **PNG optimise.**

Terrain skips trim, outline and shadow (a tile has no silhouette) and is instead
made seamless by cross-fading the image with wrapped copies of itself, so the
left column matches the right exactly. Verify by tiling 3×3.

**Pack.** Shelf packing sorted by descending height: deterministic, so a
regenerated atlas produces a readable manifest diff rather than a reshuffle.
Emits `src/game/assets/frames.ts`.

## Colliders are authored, not traced

Colliders were previously generated at runtime by reading sprite pixels. That was
slow, non-deterministic, and it meant regenerating art silently changed physics.

They are authored in `manifest.ts` as ellipses at an object's base, sized to its
*footprint* rather than its silhouette — a tree's canopy should not block
movement, only its trunk. `scripts/suggest-collider.mjs` proposes numbers from
the alpha channel for a new asset; a human pastes them in. Generation never feeds
physics.

## Adding one new asset, end to end

1. **Catalogue it** in `scripts/asset-catalog.mjs`:

   ```js
   P('anvil', 'a heavy black iron anvil on a wooden block'),
   ```

   The helper (`T` terrain, `D` detail, `P` prop, `L` large prop, `I` item,
   `U` ui) sets the canonical size and the atlas.

2. **Generate** just that one: `node scripts/generate-all.mjs --id anvil`

3. **Look at it.** `node scripts/contact-sheet.mjs assets-src/world` tiles the
   directory into one sheet. Reviewing assets side by side is the only way to
   catch the inconsistency this process is meant to prevent. Expect to reject
   30–40% on a first pass; regenerate rather than accepting a wrong angle.

4. **Process and pack:**
   ```bash
   node scripts/process-asset.mjs --id anvil
   npm run assets:pack
   ```

5. **Author its metadata** in `src/game/assets/manifest.ts`:

   ```ts
   'world/anvil': solid(110, 120, 32, 14),   // worldSize w,h then collider rx,ry
   ```

6. **Point the game at it** — if it is a placeable entity, add a case to
   `idForEntity()` in `src/game/assets/colliders.ts`. Nothing looks assets up by
   filename, so this is the only wiring needed.

7. `npm run audit:assets` must still report 0 missing, 0 unused.

## Regenerating everything

```bash
rm -rf assets-src assets-build
npm run assets:generate && node scripts/build-palette.mjs 32 \
  && npm run assets:process && node scripts/build-sheets.mjs && npm run assets:pack
```

Roughly 20 minutes at 6 requests/minute, and a few cents on flux-schnell.

## Character sheets are composed, not generated

Diffusion models cannot hold a character consistent across the cells of a sprite
grid: the first attempt returned a scatter of unrelated figures rather than a
walk cycle. So one clean sprite is generated per facing direction and
`scripts/build-sheets.mjs` composes the frames as deterministic transforms of it
— a vertical bob, a slight lean, a contact squash. Every frame is therefore
unmistakably the same character.

To change how a walk reads, edit `gait()` in that script rather than
regenerating art.

## Credentials

`REPLICATE_API_TOKEN` in `.env.local`, which is gitignored. Get one at
https://replicate.com/account/api-tokens. `scripts/mcp/replicate-asset-server.mjs`
exposes the same generator as an MCP tool (`generate_game_asset`) for editors
that speak MCP; it reads each model's OpenAPI schema and sends only the
parameters that model declares, so it works across model families.
