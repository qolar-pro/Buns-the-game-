# Importing Hearthwood art into an engine

These textures are **index-map pixel art**: every pixel is one of 7–9 exact
colours off a named ramp. That is the whole point of the pipeline, and it is
also the thing an engine's default import settings will destroy. A bilinear
sample between ramp step 3 and ramp step 4 is a colour that exists on no ramp;
a mipmap is a whole pyramid of them. The art does not degrade gracefully into
blur — it stops being the same art.

Three settings, everywhere:

| Setting | Value | Why |
|---|---|---|
| Filter | **Point / nearest** | Bilinear invents between-ramp colours and softens every deliberate 1px edge. |
| Compression | **None** (or lossless) | Block compression quantises in RGB, which shifts ramp steps unevenly and bands the shading. |
| Mipmaps | **Off**, or pixel-art-safe | Mip level 1 is already a blur of the ramp. If the camera zooms far enough out to need them, generate them with a point/box filter, never the default. |

Also: **no premultiplied alpha on import** if the engine offers the choice, and
no sRGB↔linear conversion round-trip on the texture. The final OKLab grade is
already baked in; converting and converting back rounds every channel twice.

## Per engine

**Canvas 2D** (what this game uses):

```ts
ctx.imageSmoothingEnabled = false;   // per context, and it resets on resize
```

and on the element, so the backing store scales up crisply too:

```tsx
<canvas style={{ imageRendering: 'pixelated' }} />
```

Both are set here — `components/Game.tsx:198` for the element, and every context
the renderer creates (`Renderer.ts`, `TerrainRenderer.ts`, `AssetRegistry.ts`).
`imageSmoothingEnabled` is a property of the *context*, not the image, so any
new offscreen canvas needs it again. The two places `TerrainRenderer` turns
smoothing back **on** are deliberate and are not art: they blur an alpha-only
noise mask used to fade dirt and blight between biomes. Blurring a mask is
fine; blurring a texture is not.

**Unity.** Texture type Sprite (2D and UI), Filter Mode `Point (no filter)`,
Compression `None`, Generate Mip Maps off, and Pixels Per Unit set from the
table below rather than left at 100. Max Size must clear the *largest* atlas
dimension: `characters.png` is 1932×2314, so 2048 silently downsamples it and
the setting has to be 4096.

**Godot.** Project Settings → Rendering → Textures → Canvas Textures → Default
Texture Filter = `Nearest`. Per-texture, the `.import` file wants
`compress/mode=0` and `mipmaps/generate=false`.

**Unreal.** Texture Group `UI` or `2D Pixels`, Filter `Nearest`, Compression
Settings `UserInterface2D (RGBA)`, Mip Gen Settings `NoMipmaps`, sRGB on.

**WebGL / raw GL.**

```
gl.texParameteri(TEXTURE_2D, TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(TEXTURE_2D, TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(TEXTURE_2D, TEXTURE_WRAP_S, gl.REPEAT);   // terrain only
```

`NEAREST` for **min** as well as mag. `LINEAR_MIPMAP_LINEAR` on a min filter is
the single most common way this art gets silently ruined.

## Scale

Draw at an integer multiple of the source pixel, or the nearest-neighbour
sampler duplicates some rows and not others and the texture shimmers as the
camera moves. This game's world scale is:

| Kind | Source | Drawn at |
|---|---|---|
| Terrain tile | 128×128 | 128 world units — 1:1 (`TILE` in `TerrainRenderer.ts`) |
| Item icon | 128×128 | 28–32 CSS px in the HUD |
| Prop / building | 128×W | authored `worldSize` in `src/game/assets/manifest.ts` |
| Character cell | sheet cell | authored per entity in the renderer |

Item icons are the one deliberate non-integer downscale: they are DOM
elements, not canvas draws, so `ItemIcon` scales the atlas frame with a CSS
`transform` under `image-rendering: pixelated`. At icon size the shimmer an
in-world sprite would show has nowhere to appear — the element does not move.
Anything drawn into the world canvas should still land on integer scale.

The authored world size is the authority, never the pixel size — deriving draw
size from image dimensions is what made every object in the world shrink the
last time the art was regenerated at a different resolution. The packer now
reads pixel sizes from the files and the generator derives pixel sizes from the
authored world sizes (`scripts/dump-world-sizes.mjs` → `world_sizes.json`), so
the two cannot drift apart in either direction.

## Tiling

Every `terrain/*` texture is seamless in both axes and is meant to be sampled
with `REPEAT`. They are also **isotropic** — no directional ripples — because
the terrain renderer varies each tile's orientation by a hash of its world
position to break up the repeat. A tile with a visible direction in it turns
that into butterfly-wing mirror artifacts. If you add a structured tile
(planks, boards), exclude it from rotation the way `structured` does in
`TerrainRenderer.ts`.

Verify a new tile by rendering it 3×3 before shipping it; `assets:sheet`'s
middle panel does exactly that for the whole set.

## Atlases

Five PNGs in `public/sprites/`, 2px transparent gutter between frames. The
gutter exists so that if something *does* sample bilinearly — a scaled-down
minimap, a post effect — it bleeds transparent rather than a neighbouring
sprite. Frame rectangles are generated into `src/game/assets/frames.ts`; don't
hand-edit it.

PNGs are encoded with `palette: false` on purpose. sharp turns on palette
quantisation as soon as any palette-only option is present, and quantising the
character atlas shifts 3.5% of its opaque pixels by more than 24/255 — visible
banding on every sprite. Measured, not assumed.
