# Art brief — Buns the Game

**This file is generated** by `scripts/make-art-brief.mjs`. Do not edit it by
hand; it is regenerated from the catalogue and from the art that actually
exists, so the sizes in it are always the real ones.

It is written to be handed to someone — or something — that is going to draw
these, and it assumes no knowledge of the codebase.

---

## The job

Replace any or all of the game's 203 sprites with hand-drawn pixel art.

**You do not have to do all of them.** Every file is optional and independent.
Draw one sprite, drop it in, and it appears in the game; everything you do not
draw keeps its generated version. A half-finished set is a working game.

## Where the files go

```
assets-hand/<atlas>/<id>.png
```

So the tree is `assets-hand/world/tree.png`, the bread icon is
`assets-hand/items/bread.png`, the player sheet is
`assets-hand/characters/player.png`.

**The filename is the contract.** It has to match the id in the tables below
exactly — lowercase, underscores, no spaces. A misspelled filename is silently
ignored, which is the worst outcome: the art looks delivered and nothing uses
it. The checker below catches this.

## Check your work before handing it over

```bash
node scripts/check-hand-art.mjs
```

It validates every file in `assets-hand/` and prints exactly what is wrong with
each one — wrong size, missing transparency, unknown id, anti-aliased edges.
It exits non-zero if anything is broken. **Run it and fix everything it reports
before saying you are done.**

Then `npm run assets:pack` puts them in the game.

---

## Hard rules

These are not style preferences. Breaking them produces visible defects.

1. **Exact canvas size.** Every sprite has one, listed in the tables below. If
   your art is a different size, change the *canvas* size and redraw — do not
   scale the image, which blurs every pixel.

2. **32-bit RGBA PNG.** Background fully transparent (alpha 0), object fully
   opaque (alpha 255). Terrain is the exception: fully opaque, no transparency.

3. **No anti-aliasing. No soft brushes. No feathering. No gradients tools.**
   Use a hard 1-pixel pencil. Every pixel is either fully on or fully off.
   Partly-transparent pixels become visible fringes when the game scales
   sprites, and soft edges are the single most common way pixel art is ruined.

4. **One light source, from the upper left.** Every sprite in the game is lit
   this way. Top and left surfaces are lighter, bottom and right darker. This is
   what makes a set of sprites look like one set.

5. **A dark outline**, `#1c120b`, around the outside of every object — except
   terrain tiles, and except things thinner than about three pixels (a grass
   blade outlined is a blade made of outline; give those a dark side and a light
   side instead).

6. **Few colours.** Aim for 5–9 shades per material, plus the outline. Not a
   rule you must count, but if a sprite has 200 colours in it, something soft
   got used. The checker warns above 64.

7. **World objects stand on the bottom edge** of their canvas. The engine
   plants the sprite's bottom row on the ground.

---

## Palette

Every material in the game is drawn from one of these ramps, dark to light.
You do not have to use these exact values, but a sprite drawn from them will
sit with the rest of the set automatically, and one drawn from the default
Windows colour picker will not.

| Material | Ramp, darkest to lightest |
|---|---|
| `oak_wood` | `#50351f` `#6d4c28` `#8b6432` `#a67c41` `#bc9351` `#cda763` `#dcb978` `#e8cb8f` |
| `oak_bark` | `#2f2216` `#42301e` `#574127` `#6b5031` `#81623c` `#967549` `#aa8858` `#bb9967` |
| `spruce_wood` | `#2f2015` `#432d1a` `#573b23` `#6a4a2c` `#7c5935` `#8e6941` `#9f794c` `#ae895a` |
| `dark_bark` | `#1c120b` `#27190f` `#342215` `#412a1a` `#4f3421` `#5f3f28` `#6e4b31` |
| `stone` | `#35312d` `#45403b` `#57514b` `#6a635c` `#7d766e` `#908880` `#a29a90` `#b3aca1` `#c3bdb2` |
| `dirt` | `#3b2416` `#4d301d` `#5f3d26` `#714b2f` `#855938` `#976944` `#a87a52` |
| `path` | `#5c4a2c` `#716036` `#867440` `#99864b` `#aa9656` `#baa462` `#c7b16e` |
| `pebble` | `#5b554f` `#756e67` `#8f8880` `#aaa399` |
| `moss` | `#33401f` `#435228` `#556633` `#687a3e` `#7c8e4a` `#90a257` `#a2b266` |
| `grass` | `#313c12` `#3c5018` `#48641f` `#587b28` `#6c9432` `#80ab41` `#94bd56` `#a9d06b` |
| `leaf` | `#283615` `#33451a` `#3d5520` `#486828` `#557d30` `#62923c` `#71a64b` `#81bb5a` |
| `iron` | `#2b2f36` `#434b55` `#5f6974` `#7f8996` `#a3adb9` `#c8d0d9` |
| `steel_dark` | `#1b1f26` `#292e35` `#383f46` `#485058` `#5c656e` `#727b86` |
| `copper` | `#3f1f14` `#632f19` `#89421c` `#ae5a1d` `#ca792c` `#df9c43` |
| `gold` | `#4d3005` `#734d05` `#996d06` `#bc8f12` `#d5b13e` `#ead369` |
| `cloth_red` | `#4c1719` `#651f1e` `#802822` `#9a3525` `#b44428` `#ca5f36` `#df7a45` |
| `cloth_blue` | `#182841` `#213555` `#2c426a` `#3b5280` `#4a6296` `#6479ad` `#7f91c3` |
| `skin` | `#6e3d28` `#865130` `#9f6738` `#b37a44` `#c58d52` `#d6a164` `#e2b77c` `#eecd94` |
| `parchment` | `#5e4834` `#7d654b` `#9d8464` `#bca784` `#dccaa5` `#ede1c5` `#fff7e5` |
| `snow` | `#8e9aa9` `#a0acb9` `#b2bdc8` `#c3ccd7` `#d2dbe4` `#e1e8ef` `#eef2f7` `#f6f8fa` |
| `sand` | `#715025` `#88632d` `#9f7836` `#b08a40` `#bf9c4c` `#cdae5d` `#d8c075` `#e4d38e` |
| `marsh` | `#2b2416` `#362e1c` `#423821` `#4d4228` `#584c2f` `#645737` `#706340` |
| `cactus` | `#284018` `#304f20` `#385f28` `#407032` `#49813d` `#54944a` `#64a85b` `#74bc6c` |

Outline colour, used by everything: `#1c120b`. Never pure black, never
pure white — the palette floor is `#1c120b` and the ceiling `#fff7e6`.

All 43 ramps are in `tools/hearthwood/palettes.py` if you want the rest.

---

## Start here

Do **not** work through the tables below in order. They are reference, not a
plan — 203 sprites is a project, and most of them are things the player sees
once an hour.

These twelve are what is on screen in the first minute of a new game. Drawing
just these changes how the whole game looks, and the game stays perfectly
playable throughout because everything else keeps its generated art.

| # | id | why it is first |
|---|---|---|
| 1 | `terrain/grass` | The ground under almost everything. Changes the look of the game more than any other single file. |
| 2 | `characters/player` | On screen 100% of the time. The hardest one (12 cells) but the highest payoff. |
| 3 | `world/tree` | The first thing you are told to chop. |
| 4 | `world/bush` | The other starting wood source. |
| 5 | `world/twigs` | Scattered in every meadow chunk. This is what the game calls a "branch". |
| 6 | `world/pebbles` | Ground detail, everywhere. |
| 7 | `world/tall_grass` | Ground detail, everywhere. Thin — give it a dark side and a light side, no outline. |
| 8 | `world/rock_a` | The stone source. |
| 9 | `items/wood` | First item you ever pick up. |
| 10 | `items/stone` | Second item you ever pick up. |
| 11 | `items/wooden_axe` | First thing you craft. |
| 12 | `items/wooden_pickaxe` | Second thing you craft. |

After those, in rough order of how often they are seen: the other ore rocks,
the workbench and campfire, the remaining starting-tier items, the villagers and
livestock, then the biome flora, then everything else.

**The id is not always the name the game uses for the thing.** A few entities
draw from a differently-named sprite — a `branch` draws as `world/twigs`, a
`small_rock` shares the rock art, a young `tree` draws as
`world/small_tree`. The tables below list the *sprite* ids, which are the
filenames. If you cannot find something by the name you expect, search the table
for what it looks like rather than inventing a filename; an invented one is
silently ignored.

**Leave the character sheets until last except for the player.** They are twelve
cells each and have to stay consistent across all of them, which is much harder
than a single icon. If the walk cycle is too fiddly, draw the four standing
poses (column 1 of each row) and copy them across the other columns — a
character that does not animate looks far better than one that wobbles.

---

## Setting up the editor

The palette is exported as files so nothing has to be retyped:

| File | Load it in |
|---|---|
| `docs/palette/hearthwood.gpl` | Krita, LibreSprite, Aseprite, GIMP |
| `docs/palette/hearthwood.hex` | Piskel, Paint.NET, JASC-compatible tools |
| `docs/palette/hearthwood.png` | anything that imports a palette from an image |

Every row of the swatch image is one material, dark to light. The top row is the
outline colour.

### LibreSprite / Aseprite

1. **New file** at the exact canvas size from the tables below. Colour mode RGBA.
2. **Palette → Load Palette** → `hearthwood.gpl`.
3. Use the **pencil** (B), size **1**. Aseprite's pencil has no anti-aliasing,
   which is the point of using it.
4. Avoid the blur, smudge and gradient tools entirely. The paint bucket is fine
   — set **Tolerance 0** and turn **anti-aliasing off** in its tool bar.
5. Export: **File → Export**, PNG, **Resize 100%**. Do not "export scaled"; the
   game does its own scaling and wants the original pixels.

### Krita

1. **New file** at the exact size, **RGBA / 8-bit**, background **transparent**.
2. **Settings → Dockers → Palettes**, then import `hearthwood.gpl`.
3. Pick the **Pixel Art** brush preset, or any brush with **size 1**,
   **Hardness 100%**, **Opacity 100%**, **Flow 100%** and anti-aliasing off.
   Krita's default brushes are all soft — this step is not optional.
4. **View → Pixel Grid** on, and work zoomed in.
5. Export: **File → Export**, PNG, **alpha on**, no scaling.

### Piskel (browser or desktop)

1. **New sprite** at the exact size.
2. Palette panel → **Import** → `hearthwood.hex`.
3. The pencil is 1px and hard by default. Leave it alone.
4. Export → **PNG**, scale **1x**.

### Making GUI work reliable

Clicking individual pixels through a screenshot loop is the slowest and most
error-prone way to do this, so lean on the things that are not per-pixel:

- **Block out the silhouette first** with the rectangle and ellipse tools, in
  one mid-tone. Get the shape right before any shading. The silhouette is most
  of whether a sprite reads.
- **Then the outline**, then **two or three shade bands**, then details. Working
  light-to-dark in passes is far fewer actions than drawing finished pixels.
- **Use selections and fills** rather than painting areas by hand.
- **Mirror rather than redraw** for the left/right character rows — but flip the
  *shape* only and then repaint the light, which always comes from the upper
  left.
- **Zoom in.** At 8x or 16x a misplaced click is visible; at 100% it is not.
- **Save often**, and run `node scripts/check-hand-art.mjs` as you go rather
  than at the end. It catches wrong canvas sizes and soft edges immediately,
  and those are the two mistakes that require redrawing rather than patching.

---

## Sprite sheets (characters)

A character sheet is one image containing every frame of that character's
animation, in a grid.

- **4 rows**, always, in this order, top to bottom:
  1. facing **down** (toward the viewer)
  2. facing **left**
  3. facing **right**
  4. facing **up** (away from the viewer)
- **N columns**, one per walk frame, listed per character below. The character
  should look like it is walking as the frames advance, returning to the start.
- Every cell is the same size. Cell size = image width ÷ columns, image height ÷ 4.
- The character stands on the **bottom** of its cell and is **centred**
  horizontally in it.
- Keep the character the same size in every cell. A character that changes size
  between frames appears to pulse.

The left and right rows are the same character mirrored — but **only the shape
is mirrored, not the shading**. The sun does not move when a character turns
around, so both rows are lit from the upper left. If you flip the left row to
make the right row, flip the shape and then repaint the light.

---

## `characters` — 15 sprites

Sprite sheets. See the layout section below — these are the fiddliest and worth reading about before starting.

| id | file | canvas | grid | cell | what it is |
|---|---|---|---|---|---|
| `bog_lurker` | `assets-hand/characters/bog_lurker.png` | 384x512 | 3x4 | 128x128 | A hunched mossy swamp creature of tangled weed and dark wet limbs, glowing eyes |
| `chicken` | `assets-hand/characters/chicken.png` | 384x512 | 3x4 | 128x128 | A white chicken with a red comb |
| `cow` | `assets-hand/characters/cow.png` | 384x512 | 3x4 | 128x128 | A white and brown spotted cow |
| `crawler` | `assets-hand/characters/crawler.png` | 384x512 | 3x4 | 128x128 | A small fast six-legged insectoid crawler with a dark chitin shell |
| `elder` | `assets-hand/characters/elder.png` | 384x512 | 3x4 | 128x128 | An old village elder in grey robes with a white beard and a walking staff |
| `frost_wolf` | `assets-hand/characters/frost_wolf.png` | 384x512 | 3x4 | 128x128 | A large shaggy white winter wolf with pale blue eyes |
| `husk` | `assets-hand/characters/husk.png` | 384x512 | 3x4 | 128x128 | A gaunt hunched humanoid husk with grey cracked skin and hollow glowing eyes |
| `pig` | `assets-hand/characters/pig.png` | 384x512 | 3x4 | 128x128 | A plump pink pig |
| `player` | `assets-hand/characters/player.png` | 1024x768 | 8x4 | 128x192 | A friendly farmer character wearing a wide straw hat, a red shirt and blue denim overalls |
| `scorpion` | `assets-hand/characters/scorpion.png` | 384x512 | 3x4 | 128x128 | A large sand coloured desert scorpion with raised pincers and a curled stinger tail |
| `sentinel` | `assets-hand/characters/sentinel.png` | 384x512 | 3x4 | 128x128 | A tall armoured stone golem sentinel with glowing blue seams |
| `sheep` | `assets-hand/characters/sheep.png` | 384x512 | 3x4 | 128x128 | A fluffy cream white sheep |
| `trader` | `assets-hand/characters/trader.png` | 384x512 | 3x4 | 128x128 | A travelling merchant in a long blue coat with a heavy pack and a wide brimmed hat |
| `villager` | `assets-hand/characters/villager.png` | 384x512 | 3x4 | 128x128 | A friendly villager in a brown belted tunic, simple trousers and a woollen cap |
| `warden` | `assets-hand/characters/warden.png` | 384x512 | 3x4 | 128x128 | A massive hulking armoured warden boss with a glowing blue core in its chest, imposing |

## `world` — 69 sprites

Things standing in the world: trees, rocks, buildings, furniture. Transparent background. Drawn standing on the BOTTOM edge of the canvas — the bottom row is where the object meets the ground, and the engine plants it there.

| id | file | canvas | what it is |
|---|---|---|---|
| `antenna` | `assets-hand/world/antenna.png` | 128x208 | A tall makeshift metal radio antenna tower with wires and a small dish |
| `anvil` | `assets-hand/world/anvil.png` | 128x128 | A heavy black iron anvil on a thick wooden block |
| `barrel` | `assets-hand/world/barrel.png` | 128x128 | A wooden barrel with iron hoops |
| `bed` | `assets-hand/world/bed.png` | 128x136 | A simple wooden bed with a red blanket and a white pillow |
| `bog_iron` | `assets-hand/world/bog_iron.png` | 128x128 | A rust orange lump of bog iron ore crusted with dark peat |
| `brazier` | `assets-hand/world/brazier.png` | 128x192 | A standing iron brazier with burning orange coals |
| `bush` | `assets-hand/world/bush.png` | 128x128 | A rounded leafy green shrub with small red berries |
| `cactus` | `assets-hand/world/cactus.png` | 128x192 | A tall green saguaro cactus with two raised arms and rows of white spines |
| `campfire_1` | `assets-hand/world/campfire_1.png` | 128x128 | A small campfire, ring of stones around burning logs with orange flames |
| `campfire_2` | `assets-hand/world/campfire_2.png` | 128x128 | A small campfire, ring of stones around burning logs with taller orange flames |
| `chest` | `assets-hand/world/chest.png` | 128x140 | A closed wooden treasure chest with iron bands and a brass lock |
| `chest_open` | `assets-hand/world/chest_open.png` | 128x140 | An open wooden treasure chest with iron bands, lid raised, interior visible |
| `coal_ore` | `assets-hand/world/coal_ore.png` | 128x128 | A grey boulder studded with glossy black coal chunks embedded in the rock |
| `copper_ore` | `assets-hand/world/copper_ore.png` | 128x128 | A grey boulder studded with bright orange-green copper veins embedded in the rock |
| `crate` | `assets-hand/world/crate.png` | 128x128 | A stack of two wooden shipping crates with iron banding |
| `crop_growing` | `assets-hand/world/crop_growing.png` | 128x128 | A clump of young green wheat stalks, knee high, not yet eared |
| `crop_seedling` | `assets-hand/world/crop_seedling.png` | 128x128 | A row of tiny green wheat shoots just sprouted from dark tilled soil |
| `crop_wheat` | `assets-hand/world/crop_wheat.png` | 128x128 | A clump of tall ripe golden wheat stalks heavy with grain ears |
| `dead_bush` | `assets-hand/world/dead_bush.png` | 128x128 | A dry brittle leafless brown bush of tangled twigs |
| `desert_rock` | `assets-hand/world/desert_rock.png` | 128x128 | A wind-carved pale sandstone boulder with smooth banded layers |
| `door` | `assets-hand/world/door.png` | 128x176 | A heavy wooden door with iron hinges and a round handle |
| `dungeon_entrance` | `assets-hand/world/dungeon_entrance.png` | 128x128 | A collapsed mine shaft entrance in the ground, wooden support beams, dark opening choked with rubble |
| `dungeon_exit` | `assets-hand/world/dungeon_exit.png` | 128x168 | A wooden ladder leading up out of a dark hole in the ground |
| `fence` | `assets-hand/world/fence.png` | 128x100 | A short section of rustic wooden post and rail fence |
| `floor` | `assets-hand/world/floor.png` | 128x128 | A square of fitted wooden planks laid as flooring |
| `flowers_a` | `assets-hand/world/flowers_a.png` | 128x128 | A small cluster of white and yellow daisies with green leaves |
| `flowers_b` | `assets-hand/world/flowers_b.png` | 128x128 | A small cluster of purple and pink wildflowers with green leaves |
| `frost_flower` | `assets-hand/world/frost_flower.png` | 128x128 | A small cluster of pale blue crystalline frost flowers on a frozen stem |
| `furnace` | `assets-hand/world/furnace.png` | 128x156 | A squat stone furnace with a dark empty arched opening, cold and unlit |
| `furnace_lit` | `assets-hand/world/furnace_lit.png` | 128x156 | A squat stone furnace with bright orange fire roaring inside the arched opening |
| `glow_moss` | `assets-hand/world/glow_moss.png` | 128x128 | A patch of soft glowing pale green moss, faintly luminous |
| `hit_spark` | `assets-hand/world/hit_spark.png` | 128x128 | A sharp white and yellow impact spark burst, radiating star shape |
| `ice_shard` | `assets-hand/world/ice_shard.png` | 128x128 | A cluster of pale translucent blue ice shards jutting up from the ground |
| `iron_ore` | `assets-hand/world/iron_ore.png` | 128x128 | A grey boulder studded with rusty orange-brown iron ore veins embedded in the rock |
| `lamppost` | `assets-hand/world/lamppost.png` | 128x192 | A wrought iron village lamppost with a glowing warm yellow lantern on top |
| `leaf_burst` | `assets-hand/world/leaf_burst.png` | 128x128 | A scatter of small green leaves flying outward |
| `lily_pad` | `assets-hand/world/lily_pad.png` | 128x128 | Two flat round green lily pads floating on dark water, one with a white flower |
| `loot_chest` | `assets-hand/world/loot_chest.png` | 128x140 | An ornate iron-bound treasure chest with a heavy lock, slightly battered and ancient |
| `market_stall` | `assets-hand/world/market_stall.png` | 128x128 | A small wooden market stall with a striped awning and crates of goods |
| `mushroom` | `assets-hand/world/mushroom.png` | 128x128 | A pair of small red mushrooms with white spots |
| `palm_tree` | `assets-hand/world/palm_tree.png` | 128x192 | A tall slender palm tree with a curved trunk and a crown of green fronds |
| `pebbles` | `assets-hand/world/pebbles.png` | 128x128 | A few small smooth grey pebbles scattered together |
| `pine_tree` | `assets-hand/world/pine_tree.png` | 128x192 | A tall dark green conifer pine tree with snow resting on its branches |
| `reeds` | `assets-hand/world/reeds.png` | 128x128 | A dense clump of tall green marsh reeds with brown seed heads |
| `rock_a` | `assets-hand/world/rock_a.png` | 128x128 | A single grey granite boulder, rounded, with flat facets |
| `rock_b` | `assets-hand/world/rock_b.png` | 128x128 | A cluster of three small grey stones of different sizes |
| `rock_c` | `assets-hand/world/rock_c.png` | 128x128 | A angular grey rock shard with sharp broken edges |
| `rubble` | `assets-hand/world/rubble.png` | 128x128 | A pile of broken grey stone rubble and rock debris |
| `sapling` | `assets-hand/world/sapling.png` | 128x128 | A tiny tree seedling, two green leaves on a short thin stem, freshly planted |
| `signpost` | `assets-hand/world/signpost.png` | 128x128 | A weathered wooden signpost with two blank arrow boards pointing opposite ways |
| `sleep_z` | `assets-hand/world/sleep_z.png` | 128x128 | Three pale blue letter Z shapes floating upward in a row, cartoon sleep symbol |
| `small_tree` | `assets-hand/world/small_tree.png` | 128x128 | A young slender tree with a thin trunk and a small green canopy |
| `smoke_puff` | `assets-hand/world/smoke_puff.png` | 128x128 | A soft round pale grey smoke puff cloud |
| `snow_rock` | `assets-hand/world/snow_rock.png` | 128x128 | A grey boulder capped with a thick rounded layer of white snow |
| `stairs_down` | `assets-hand/world/stairs_down.png` | 128x128 | A dark stone staircase descending into a black hole in the ground |
| `stone_chip` | `assets-hand/world/stone_chip.png` | 128x128 | A scatter of small grey stone chips and dust flying outward |
| `swamp_tree` | `assets-hand/world/swamp_tree.png` | 128x192 | A gnarled dead swamp tree with bare twisted branches and hanging moss |
| `tall_grass` | `assets-hand/world/tall_grass.png` | 128x128 | A small tuft of tall green grass blades |
| `titanium_ore` | `assets-hand/world/titanium_ore.png` | 128x128 | A dark grey boulder studded with glowing pale blue-white titanium crystals |
| `torch` | `assets-hand/world/torch.png` | 128x236 | A wooden torch staked upright in the ground with an orange flame at the top |
| `tree` | `assets-hand/world/tree.png` | 128x192 | A big broadleaf oak tree with a thick brown trunk and a full round green canopy |
| `trunk` | `assets-hand/world/trunk.png` | 128x128 | A cut tree stump with a flat top showing pale growth rings and rough bark sides |
| `twigs` | `assets-hand/world/twigs.png` | 128x128 | Two or three small fallen brown twigs crossed on the ground |
| `village_hall` | `assets-hand/world/village_hall.png` | 128x192 | A larger timber-framed longhouse with a thatched roof and a carved wooden porch |
| `village_house` | `assets-hand/world/village_house.png` | 128x192 | A small cosy cottage with whitewashed walls, a steep red tiled roof, a wooden door and one shuttered window |
| `wall` | `assets-hand/world/wall.png` | 128x152 | A section of stacked wooden log wall, sturdy and rough hewn |
| `water_splash` | `assets-hand/world/water_splash.png` | 128x128 | A small blue water splash with droplets flying outward |
| `well` | `assets-hand/world/well.png` | 128x128 | A round stone village well with a wooden roof frame, a rope and a hanging bucket |
| `workbench` | `assets-hand/world/workbench.png` | 128x144 | A sturdy wooden carpentry workbench with tools and a vice on top |

## `items` — 104 sprites

Inventory icons. Transparent background, object centred with a couple of pixels of margin. These are shown small (about 28px) in the hotbar, so silhouette matters far more than detail.

| id | file | canvas | what it is |
|---|---|---|---|
| `antenna` | `assets-hand/items/antenna.png` | 128x128 | A small metal radio antenna tower with a dish |
| `antenna_frame` | `assets-hand/items/antenna_frame.png` | 128x128 | A folded metal antenna frame assembly of struts and brackets |
| `anvil` | `assets-hand/items/anvil.png` | 128x128 | A small black iron anvil on a wooden block |
| `arrow` | `assets-hand/items/arrow.png` | 128x128 | A single wooden arrow with grey fletching and a sharp iron head, pointing up-right |
| `bandage` | `assets-hand/items/bandage.png` | 128x128 | A rolled white cloth bandage tied with a strip |
| `bed` | `assets-hand/items/bed.png` | 128x128 | A small wooden bed with a red blanket and white pillow |
| `bog_iron` | `assets-hand/items/bog_iron.png` | 128x128 | A rough rust orange lump of bog iron ore crusted with dark peat |
| `bow` | `assets-hand/items/bow.png` | 128x128 | A curved wooden shortbow strung with a taut pale string |
| `bread` | `assets-hand/items/bread.png` | 128x128 | A golden brown baked loaf of crusty bread |
| `cactus_flesh` | `assets-hand/items/cactus_flesh.png` | 128x128 | A wedge of pale green juicy cactus flesh with a cut face |
| `campfire` | `assets-hand/items/campfire.png` | 128x128 | A small campfire of logs with an orange flame |
| `chainmail_chausses` | `assets-hand/items/chainmail_chausses.png` | 128x128 | Iron chainmail leg armour of fine interlocking rings |
| `chainmail_coif` | `assets-hand/items/chainmail_coif.png` | 128x128 | An iron chainmail hood of fine interlocking rings |
| `chainmail_hauberk` | `assets-hand/items/chainmail_hauberk.png` | 128x128 | An iron chainmail shirt of fine interlocking rings |
| `chest` | `assets-hand/items/chest.png` | 128x128 | A small closed wooden treasure chest with iron bands |
| `coal` | `assets-hand/items/coal.png` | 128x128 | A cluster of glossy black coal lumps |
| `cooked_beef` | `assets-hand/items/cooked_beef.png` | 128x128 | A cooked browned beef steak with seared grill marks |
| `cooked_chicken` | `assets-hand/items/cooked_chicken.png` | 128x128 | A cooked golden brown roasted chicken drumstick |
| `cooked_mutton` | `assets-hand/items/cooked_mutton.png` | 128x128 | A cooked browned mutton chop on the bone, roasted and glazed |
| `cooked_pork` | `assets-hand/items/cooked_pork.png` | 128x128 | A cooked browned pork chop with a crisp seared edge |
| `copper_ingot` | `assets-hand/items/copper_ingot.png` | 128x128 | A single polished orange copper ingot bar with a metallic sheen |
| `copper_ore` | `assets-hand/items/copper_ore.png` | 128x128 | A grey rock chunk streaked with bright orange copper veins |
| `copper_wiring` | `assets-hand/items/copper_wiring.png` | 128x128 | A neat coil of bright orange copper wire |
| `crossbow` | `assets-hand/items/crossbow.png` | 128x128 | A compact wooden crossbow with an iron trigger and a short taut string |
| `door` | `assets-hand/items/door.png` | 128x128 | A small wooden door with iron hinges |
| `egg` | `assets-hand/items/egg.png` | 128x128 | A single smooth white chicken egg |
| `feather` | `assets-hand/items/feather.png` | 128x128 | A single white bird feather |
| `fence` | `assets-hand/items/fence.png` | 128x128 | A short section of wooden post and rail fence |
| `floor` | `assets-hand/items/floor.png` | 128x128 | A square tile of fitted wooden planks |
| `frost_crystal` | `assets-hand/items/frost_crystal.png` | 128x128 | A single faceted pale blue frost crystal with a cold inner glow |
| `fur_boots` | `assets-hand/items/fur_boots.png` | 128x128 | A pair of tall white fur lined winter boots |
| `fur_cap` | `assets-hand/items/fur_cap.png` | 128x128 | A warm white fur hat with thick folded flaps |
| `fur_coat` | `assets-hand/items/fur_coat.png` | 128x128 | A heavy white fur coat with a thick collar |
| `fur_leggings` | `assets-hand/items/fur_leggings.png` | 128x128 | Thick white fur trousers |
| `furnace` | `assets-hand/items/furnace.png` | 128x128 | A small squat stone furnace with a dark arched opening |
| `glass` | `assets-hand/items/glass.png` | 128x128 | A clear polished glass pane square with a faint blue-green edge |
| `glow_moss` | `assets-hand/items/glow_moss.png` | 128x128 | A small clump of glowing pale green moss |
| `iron_arrow` | `assets-hand/items/iron_arrow.png` | 128x128 | A single arrow with a heavy iron broadhead and white fletching, pointing up-right |
| `iron_axe` | `assets-hand/items/iron_axe.png` | 128x128 | A woodcutting axe with a wooden handle and a polished cold blue-grey iron head with a bright metallic highlight |
| `iron_boots` | `assets-hand/items/iron_boots.png` | 128x128 | A pair of heavy riveted iron boots |
| `iron_ingot` | `assets-hand/items/iron_ingot.png` | 128x128 | A single polished cold blue-grey iron ingot bar with a metallic highlight |
| `iron_ore` | `assets-hand/items/iron_ore.png` | 128x128 | A grey rock chunk streaked with rusty orange-brown iron ore veins |
| `iron_pickaxe` | `assets-hand/items/iron_pickaxe.png` | 128x128 | A pickaxe with a wooden handle and a polished cold blue-grey iron head with a bright metallic highlight |
| `iron_shield` | `assets-hand/items/iron_shield.png` | 128x128 | A kite shaped iron shield with a riveted rim |
| `iron_sword` | `assets-hand/items/iron_sword.png` | 128x128 | A sword with a polished cold blue-grey iron blade, bright metallic highlight and a leather wrapped grip |
| `lantern` | `assets-hand/items/lantern.png` | 128x128 | A copper and glass lantern with a warm glowing flame inside |
| `leather` | `assets-hand/items/leather.png` | 128x128 | A folded piece of tan brown tanned leather hide |
| `leather_backpack` | `assets-hand/items/leather_backpack.png` | 128x128 | A brown leather backpack with buckled straps |
| `leather_boots` | `assets-hand/items/leather_boots.png` | 128x128 | A pair of brown leather boots with laces |
| `leather_cap` | `assets-hand/items/leather_cap.png` | 128x128 | A brown leather cap helmet with stitched seams |
| `leather_pants` | `assets-hand/items/leather_pants.png` | 128x128 | Brown leather trousers armour with stitched seams |
| `leather_tunic` | `assets-hand/items/leather_tunic.png` | 128x128 | A brown leather tunic chest armour with stitched seams and laces |
| `meat_pie` | `assets-hand/items/meat_pie.png` | 128x128 | A golden baked meat pie with a latticed pastry top in a tin |
| `mutton` | `assets-hand/items/mutton.png` | 128x128 | A raw deep red cut of mutton on the bone |
| `omelet` | `assets-hand/items/omelet.png` | 128x128 | A folded yellow omelette on a small plate |
| `plant_fiber` | `assets-hand/items/plant_fiber.png` | 128x128 | A small bundle of pale green stringy plant fibres, loosely tied |
| `power_cell` | `assets-hand/items/power_cell.png` | 128x128 | A cylindrical industrial power cell with a glowing green charge window |
| `prospectors_pick` | `assets-hand/items/prospectors_pick.png` | 128x128 | An ornate brass and steel pickaxe with an engraved head, clearly a masterwork |
| `quiver` | `assets-hand/items/quiver.png` | 128x128 | A brown leather quiver holding several arrows with feather fletching |
| `ration` | `assets-hand/items/ration.png` | 128x128 | A wrapped bundle of preserved food tied with string |
| `raw_beef` | `assets-hand/items/raw_beef.png` | 128x128 | A raw red cut of beef steak, marbled and glistening |
| `raw_chicken` | `assets-hand/items/raw_chicken.png` | 128x128 | A raw pale pink chicken drumstick |
| `raw_pork` | `assets-hand/items/raw_pork.png` | 128x128 | A raw pink cut of pork with a pale fat edge |
| `reed_bundle` | `assets-hand/items/reed_bundle.png` | 128x128 | A tied bundle of straight green marsh reeds |
| `relic_blade` | `assets-hand/items/relic_blade.png` | 128x128 | An ancient ornate sword with a dark blade and glowing golden runes along it |
| `rope` | `assets-hand/items/rope.png` | 128x128 | A neat coil of braided brown rope |
| `sand` | `assets-hand/items/sand.png` | 128x128 | A small conical heap of fine pale golden sand |
| `sapling` | `assets-hand/items/sapling.png` | 128x128 | A tiny green tree seedling with two leaves in a small clump of soil |
| `scrap_metal` | `assets-hand/items/scrap_metal.png` | 128x128 | A twisted bundle of rusty scrap metal sheets and bent rods |
| `signal_core` | `assets-hand/items/signal_core.png` | 128x128 | A glowing blue crystalline power core in a metal housing, humming with energy |
| `stick` | `assets-hand/items/stick.png` | 128x128 | A pair of crossed brown wooden sticks |
| `stone` | `assets-hand/items/stone.png` | 128x128 | A few chunks of grey stone piled together |
| `stone_axe` | `assets-hand/items/stone_axe.png` | 128x128 | A woodcutting axe with a wooden handle and a chipped grey stone head |
| `stone_pickaxe` | `assets-hand/items/stone_pickaxe.png` | 128x128 | A pickaxe with a wooden handle and a chipped grey stone head |
| `stone_sword` | `assets-hand/items/stone_sword.png` | 128x128 | A short sword with a chipped grey stone blade and a wrapped grip |
| `supply_crate` | `assets-hand/items/supply_crate.png` | 128x128 | A small closed wooden supply crate with rope handles |
| `survivors_log` | `assets-hand/items/survivors_log.png` | 128x128 | A weathered leather-bound journal with loose handwritten pages |
| `thick_fur` | `assets-hand/items/thick_fur.png` | 128x128 | A folded pelt of thick shaggy white winter fur |
| `throwing_knife` | `assets-hand/items/throwing_knife.png` | 128x128 | A small slim steel throwing knife with a wrapped handle |
| `titanium_axe` | `assets-hand/items/titanium_axe.png` | 128x128 | A woodcutting axe with a dark handle and a glowing pale blue titanium head |
| `titanium_boots` | `assets-hand/items/titanium_boots.png` | 128x128 | A pair of pale blue titanium armoured boots |
| `titanium_chestplate` | `assets-hand/items/titanium_chestplate.png` | 128x128 | A pale blue titanium breastplate armour |
| `titanium_greaves` | `assets-hand/items/titanium_greaves.png` | 128x128 | Pale blue titanium leg armour greaves |
| `titanium_helm` | `assets-hand/items/titanium_helm.png` | 128x128 | A pale blue titanium helmet with a narrow visor slit |
| `titanium_ingot` | `assets-hand/items/titanium_ingot.png` | 128x128 | A single polished pale blue-white titanium ingot bar, faintly glowing |
| `titanium_ore` | `assets-hand/items/titanium_ore.png` | 128x128 | A dark rock chunk studded with glowing pale blue titanium crystals |
| `titanium_pickaxe` | `assets-hand/items/titanium_pickaxe.png` | 128x128 | A pickaxe with a dark handle and a glowing pale blue titanium head |
| `titanium_shield` | `assets-hand/items/titanium_shield.png` | 128x128 | A sleek pale blue-white titanium shield with a glowing seam |
| `titanium_sword` | `assets-hand/items/titanium_sword.png` | 128x128 | A sword with a glowing pale blue titanium blade and a dark wrapped grip |
| `torch` | `assets-hand/items/torch.png` | 128x128 | A wooden torch with a burning orange flame at the top |
| `torch_bundle` | `assets-hand/items/torch_bundle.png` | 128x128 | A bundle of four wooden torches tied together with rope |
| `trade_token` | `assets-hand/items/trade_token.png` | 128x128 | A small stamped bronze trade token coin with a worn emblem |
| `village_charter` | `assets-hand/items/village_charter.png` | 128x128 | A rolled parchment charter tied with a red ribbon and a wax seal |
| `wall` | `assets-hand/items/wall.png` | 128x128 | A small section of stacked wooden log wall |
| `wardens_key` | `assets-hand/items/wardens_key.png` | 128x128 | A large ornate dark iron key with a glowing blue gem set in the bow |
| `wheat` | `assets-hand/items/wheat.png` | 128x128 | A bundle of golden ripe wheat stalks with full ears |
| `wheat_seeds` | `assets-hand/items/wheat_seeds.png` | 128x128 | A small handful of pale golden wheat seeds |
| `wood` | `assets-hand/items/wood.png` | 128x128 | A stack of two cut brown wooden logs |
| `wooden_axe` | `assets-hand/items/wooden_axe.png` | 128x128 | A woodcutting axe with a warm brown wooden handle and a shaped wooden head |
| `wooden_pickaxe` | `assets-hand/items/wooden_pickaxe.png` | 128x128 | A pickaxe with a warm brown wooden handle and a shaped wooden head |
| `wooden_shield` | `assets-hand/items/wooden_shield.png` | 128x128 | A round wooden shield with iron bands and a central boss |
| `wooden_sword` | `assets-hand/items/wooden_sword.png` | 128x128 | A short sword with a warm brown wooden blade and a wrapped grip |
| `wool` | `assets-hand/items/wool.png` | 128x128 | A soft fluffy bundle of cream white wool |
| `workbench` | `assets-hand/items/workbench.png` | 128x128 | A small wooden carpentry workbench |

## `terrain` — 9 sprites

Ground textures. **Must tile seamlessly in both axes** — the left column continues into the right, the top row into the bottom. No outline, no directional features (the engine rotates these by world position, so a plank pattern would mirror against its neighbours). Fully opaque, no transparency.

| id | file | canvas | what it is |
|---|---|---|---|
| `cracked_earth` | `assets-hand/terrain/cracked_earth.png` | 128x128 | Pale dry cracked desert hardpan, polygonal cracks and fine dust |
| `dirt` | `assets-hand/terrain/dirt.png` | 128x128 | Bare brown earth soil texture, fine clods and small stones |
| `grass` | `assets-hand/terrain/grass.png` | 128x128 | A continuous field of short lush green grass blades, dense even turf, natural random growth |
| `grass_variant` | `assets-hand/terrain/grass_variant.png` | 128x128 | Green meadow grass turf with small dry patches and a few tiny yellow wildflowers |
| `marsh` | `assets-hand/terrain/marsh.png` | 128x128 | Dark wet peat bog ground, soaked earth with patches of moss and shallow water |
| `sand` | `assets-hand/terrain/sand.png` | 128x128 | Pale golden beach sand texture, fine even grain, gentle ripples |
| `snow` | `assets-hand/terrain/snow.png` | 128x128 | A continuous field of clean fresh snow, soft even powder with faint wind ripples |
| `stone_floor` | `assets-hand/terrain/stone_floor.png` | 128x128 | Grey cobblestone floor of fitted irregular stones with dark mortar joints |
| `wood_floor` | `assets-hand/terrain/wood_floor.png` | 128x128 | Warm brown wooden plank floor, parallel boards, visible grain and seams |

## `ui` — 6 sprites

HUD icons — hearts, hunger, cursor. Transparent background. Very small; keep them to a few bold shapes.

| id | file | canvas | what it is |
|---|---|---|---|
| `cursor` | `assets-hand/ui/cursor.png` | 32x32 | A simple white pointer arrow cursor with a thick dark outline, filling the frame |
| `drumstick` | `assets-hand/ui/drumstick.png` | 32x32 | A golden brown roasted drumstick icon, simple and bold |
| `drumstick_empty` | `assets-hand/ui/drumstick_empty.png` | 32x32 | An empty dark grey outlined drumstick icon, simple and bold |
| `heart` | `assets-hand/ui/heart.png` | 32x32 | A plump glossy red heart icon, simple and bold |
| `heart_empty` | `assets-hand/ui/heart_empty.png` | 32x32 | An empty dark grey outlined heart icon, simple and bold |
| `stamina_bolt` | `assets-hand/ui/stamina_bolt.png` | 32x32 | A bright yellow lightning bolt icon, thick and bold, filling the frame |

---

## If you want to see the current art

`docs/contact/hearthwood.png` is every sprite in the game on one sheet, shown
at 8x. `docs/screens/hearthwood-world.png` shows them in the game. The existing
art is the thing being replaced, so treat it as a size and subject reference
rather than as a style to match.

The generated originals are in `assets-build/<atlas>/<id>.png` if you want to
open one and draw over it at the right size.
