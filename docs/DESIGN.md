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

## The ending

1. Craft the **antenna frame** (titanium + iron).
2. Place it and feed it **copper wiring** until the structure is restored.
3. Install the **signal core** from the Warden.
4. Interact to **broadcast**.

Broadcasting ends the run and shows a summary: days survived, depth reached,
things crafted, mobs defeated.

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

## The survivor's logs

Six fragments, found in chests, that say who was here before and why the Vault
is sealed. They are read on pickup and reveal in order. Nothing gates on them:
they are the reason a chest holding "just a log" is still worth opening.

## Quest log

A short, ordered list of objectives, always visible, always pointing at the next
concrete action. It is the difference between a sandbox and a game with an
ending. Objectives complete automatically from game state; nothing is a
fetch-quest hand-in.
