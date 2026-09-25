# Buns — game design

## The arc

You are stranded. The only way out is the **antenna**: a ruined transmitter you
rebuild from parts you can only get by going underground. Survive long enough,
dig deep enough, and you can call for rescue.

The game ends when you broadcast.

## Progression gates

Each tier exists to make the next one reachable. Nothing is a collectathon —
every material unlocks a specific capability.

| Tier | Gated by | Unlocks |
|---|---|---|
| **Wood** | nothing | basic tools, campfire, workbench |
| **Stone** | workbench | stone tools, furnace, the first ores |
| **Copper** | stone pickaxe | `copper_wiring`, lanterns — light to go underground |
| **Iron** | stone pickaxe | iron tools and armour, clearing dungeon rubble |
| **Titanium** | iron pickaxe, found only in deep dungeons | best tools/armour, antenna frame |
| **Signal core** | boss drop | the last antenna part |

The chain is deliberately linear: the player should always know what the next
thing to do is, and the quest log tells them.

## Ores

| Ore | Where | Needs | Yields |
|---|---|---|---|
| Coal | surface, caves | any pickaxe | fuel |
| Copper | surface, shallow caves | stone pickaxe | `copper_ore` → `copper_ingot` → wiring |
| Iron | surface (rare), caves | stone pickaxe | `iron_ore` → `iron_ingot` |
| Titanium | deep dungeons only | iron pickaxe | `titanium_ore` → `titanium_ingot` |

`scrap_metal` is looted from dungeon ruins, not mined. It smelts to
`copper_wiring`, which is why dungeons are mandatory rather than optional.

## Dungeons

Entrances appear on the surface as collapsed shafts. Clearing one needs an iron
pickaxe. Inside is a separate, darker world:

- **Depth 1 — Ruins.** Scrap metal, copper, a few hostiles.
- **Depth 2 — Deep ruins.** Iron and titanium, more hostiles, chests.
- **Depth 3 — The Vault.** The boss, and the signal core.

Dungeons are dark: without a light source you can barely see, which is what
makes the copper→lantern step matter.

## Dungeon loot

Chests are the reward for going down, and they are where the *interesting* items
live — not just more of what the surface already gives you.

| Rarity | Examples | Where |
|---|---|---|
| Common | scrap metal, coal, copper ore, bandages, rations | any depth |
| Uncommon | iron ingots, lantern, leather armour pieces, throwing knives | depth 1+ |
| Rare | titanium ingots, **relic blade**, **prospector's pick**, reinforced armour | depth 2+ |
| Unique | **Warden's key**, **signal core**, **survivor's log** pages | depth 3 / boss |

Uniques are one-per-run and do something the crafting tree cannot:

- **Relic blade** — highest damage in the game; cannot be crafted.
- **Prospector's pick** — mines any ore in one hit, including titanium.
- **Lantern** — a carried light source, the practical key to deep dungeons.
- **Survivor's log** — lore pages that explain the antenna and the Warden.

Loot is rolled from a weighted table per depth, so going deeper is always worth
it but never guaranteed.

## Mobs

| Mob | Where | Behaviour |
|---|---|---|
| Wolf | surface at night | chases, fast, hits hard |
| Husk | surface at night | slow, tanky, drops scrap |
| Crawler | dungeons | fast, weak, swarms |
| Sentinel | deep dungeons | slow, armoured, long sight |
| **The Warden** | the Vault | boss; drops the signal core |

Stats live in one table (`systems/mobs.ts`) and the dungeon scales them by
depth; nothing about a mob is written down twice. Shades are the only thing
light hurts, which is what makes a torch a weapon as well as a lamp.

## The endings

1. Craft the **antenna frame** (titanium + iron).
2. Place it and feed it **copper wiring** until the structure is restored.
3. Take the **signal core** from the Warden.
4. Spend it — on one of two things.

The core fits the antenna and it fits the village hall's generator, and there is
exactly one of them. That is the whole choice.

- **RESCUED** — power the antenna, send the signal, leave.
- **SETTLED** — power the village instead. Nobody is coming; by spring there are
  forty of you.

Neither is the good ending. The summary underneath is identical, because the run
was. Committing to the village takes two presses, with a warning between them: an
ending reached by an accidental keypress next to a building is not a choice.

## Farming

Wheat seeds come off grass, plant into a crop, and ripen over about a minute of
play into wheat. Wheat is bread and meat pies, which are the best food in the
game. Pulled up early a crop returns only its seed, so the cost of impatience is
the wait itself rather than a lost plant.

## Food

Raw meat is edible and nearly worthless; cooking roughly doubles what it
restores and makes it heal; prepared food is better again. That gradient is the
only reason to spend fuel on anything but ore.

## Building

Walls, floors and doors snap to a 128-unit grid so a row of them is actually a
wall. Props — torches, workbenches, beds, furnaces, the anvil — are placed
freely. Anything placed can be broken back into the item that made it.

### The placement ghost

Before you place anything you can see exactly where it will land. Holding a
placeable shows a translucent preview at the target spot: a green square on the
grid cell for anything that snaps, a footprint ellipse for anything placed
freely, and the item's own sprite ghosted over it at 45% alpha. Red means the
spot is blocked — occupied, out of reach, or overlapping a collider.

The preview and the placement are the same code. `ghostTarget()` and
`placeHeld()` both call `snapTo(rule, targetSpot(state), dims)`, so the ghost
cannot promise a position the placement then rounds somewhere else. That was a
real failure mode of the obvious implementation, where the renderer computed a
preview position and the placement logic computed its own.

### How the player holds things

`src/game/systems/holding.ts`. What you are carrying is drawn in your hand,
oriented to your facing, with the grip that suits it: a tool is held by the
handle at an angle, a block is carried in front with both hands, a torch is
held up and out, a bow across the body. The grips are a table keyed by item
type, with a fallback per category.

This replaced a rule that guessed an item's size from substrings of its name,
which is the kind of thing that works for twelve items and silently mis-sizes
the thirteenth.

## Clicking on things

One hit test, `src/game/systems/picking.ts`, for everything clickable — mobs,
NPCs, resources, props, dropped items, placed buildings. `pickAt()` collects
every candidate under the cursor and sorts them the way they are drawn,
topmost first, so clicking overlapping objects selects the one you can actually
see. `applyPick()` then does whatever that target does.

The draw sizes it tests against are **imported from the renderers**, never
copied. They were copied once, and three of them — husk, crawler, sentinel —
had drifted far enough that you could not click the sprite you were looking at.
A test now fails if the two ever disagree again.

## The survivor's logs

Six fragments, found in chests, that say who was here before and why the Vault
is sealed. They are read on pickup and reveal in order. Nothing gates on them:
they are the reason a chest holding "just a log" is still worth opening.

## Biomes

Two noise fields — temperature and moisture — pick a chunk's biome, the way a
real climate map works. Thresholds were chosen by sweeping every combination
against 6,561 sampled chunks for a target mix, not guessed; the world generator
already shipped one "biome" gated above its own field's maximum, which fired
never.

| Biome | Share | Gates | Native |
|---|---|---|---|
| Meadows | 45% | — | wolves, shades (night only) |
| The Dust Flats | 17% | **plant fibre** → every bow and quiver | sand scorpion |
| The White Waste | 19% | **thick fur** → the fur armour set; frost crystals | frost wolf |
| The Sunken Fen | 19% | **reeds** → arrows in bulk; bog iron | bog lurker |

Each gate is a material the combat tree needs, so travel is rewarded with
capability rather than with a collectible. The fen has no villages in it: it is
the one biome with no help, which is most of its character.

**You always start in the meadows.** Not by chance — the climate field is
offset per world until spawn and the whole chunk around it are grassland. The
meadows are the only biome that bootstraps: every tool costs wood, wood comes
from a tree, a tree needs an axe, and only grassland scatters the branches and
loose rock that get you the first axe with your hands. The other three are
places you travel to *with* tools, and waking up in one of them is not a
harder start, it is a stopped one.

## Villages

One chunk, a fixed street plan, and four residents. Roughly one village every
twenty-five chunks, never within a chunk of spawn, never in the fen. Generated
from the chunk coordinates, so a village is identical every time you walk back
to it without being written to the save.

- **Trade** is barter, not currency. A coin would need a source, a sink and a
  price for everything, all balanced against a player who can mine forever.
- **Requests** are side objectives: two per village, stable, each paying out
  gear or a material from somewhere else. They are a shortcut past a journey.
- **Safe haven**: nothing hostile spawns inside a settlement, and a bed at night
  sleeps you to dawn — but only with nothing dangerous within 600 units.

## Ranged combat

Arrows are simulated, not hitscan: they travel, they can miss, and most of them
survive to be picked back up. That last part is what stops ammunition being a
tax on using the weapon.

A bow in hand turns the action button into a shot, so there is no second button
and the game plays the same on a phone. The sentinel is the one mob that fights
at range — it was designed that way and shipped as a slow melee mob, which made
it strictly worse than the crawler standing next to it.

## Armour

| Set | Defence | Speed | Where |
|---|---|---|---|
| Leather | 7 + 1 | +2% | anywhere |
| Fur | 12 + 2 | +8% | the White Waste |
| Chainmail | 15 + 3 | −3% | iron |
| Titanium | 23 + 6 | −2% | the deep |

The second number is the matched-set bonus. Fur sits between leather and
chainmail and buys speed instead of plate, so the Waste is worth the walk on its
own rather than only as a stop on the way to the end.

## Quest log

A short, ordered list of objectives, always visible, always pointing at the next
concrete action. It is the difference between a sandbox and a game with an
ending. Objectives complete automatically from game state; nothing is a
fetch-quest hand-in.
