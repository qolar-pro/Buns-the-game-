# Manual Regression Checklist — Buns the Game

25 steps covering every system listed under v0.1.0 in `CHANGELOG.md`.
This is the regression harness for the overhaul: **re-run the whole list after every phase.**
A phase that breaks any item is reverted, not patched forward.

**How to run:** `npm run dev`, open http://localhost:3000, click *New Game*, then work down the list.
Record `PASS` / `FAIL` in the phase columns. Budget ~8 minutes for a full pass.

### Automated coverage

Most of this list is now checked automatically, which is what made it practical to
re-run after every extraction:

```bash
node scripts/smoke-test.mjs     # 12 checks: boot, render, movement, harvesting,
                                # inventory, crafting, hotbar, pause, save, 404s
node scripts/mobile-test.mjs    # 10 checks: touch layer, stick, action button,
                                # sheets, frame time, portrait gate
npm test                        # 44 unit tests, including save migration
node scripts/audit-assets.mjs   # 0 missing, 0 unused
```

**Three steps still need a human**, because they are about judgement rather than
state: item **5** (does the player read as *behind* the tree), **22** (does the
day/night ramp look smooth, not steppy), and **24** (do the animals move
believably). Everything else has an automated equivalent.

## Controls reference

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint (needs hunger > 6) |
| `Space` | Interact / harvest / attack |
| `E` | Toggle inventory |
| `1`–`9` | Select hotbar slot |
| `X` | Sit |
| `R` | Respawn at world spawn |
| `N` | New game |
| `Esc` | Pause menu |
| Mouse | Aim / click to use held item |

---

## A. Boot and world

| # | Step | Expected result | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Load the page, click **New Game** | World renders within 3s; player visible and centred; no console errors | | | | | | | | | | |
| 2 | Walk 30s in one direction | New chunks stream in continuously; no gaps, no flicker, no stall | | | | | | | | | | |
| 3 | Walk to the edge of a grass/dirt boundary | Terrain tiles meet without seams or z-fighting | | | | | | | | | | |
| 4 | Walk into a tree, a rock and a placed workbench | Player is blocked by each; no clipping through, no getting stuck | | | | | | | | | | |
| 5 | Walk behind a tree, then in front of it | Player is occluded when behind, drawn over when in front (z-sort by base Y) | | | | | | | | | | |

## B. Gathering and combat

| # | Step | Expected result | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 | Face a tree, press `Space` repeatedly | Tree takes hits, is destroyed, drops wood; wood enters inventory | | | | | | | | | | |
| 7 | Harvest a bush, a stick and a surface rock | Each yields its item; node disappears or enters a depleted state | | | | | | | | | | |
| 8 | Harvest a rock with bare hands, then with a pickaxe | Pickaxe is measurably faster / yields more | | | | | | | | | | |
| 9 | Mine coal ore and iron ore | Yields coal and iron ore respectively | | | | | | | | | | |
| 10 | Equip a sword, attack a cow until it dies | Cow takes damage, shows hit feedback, dies, drops raw beef + leather | | | | | | | | | | |

## C. Inventory, crafting, smelting

| # | Step | Expected result | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11 | Press `E` | Inventory opens; hotbar + main grid + equipment slots all render | | | | | | | | | | |
| 12 | Drag an item hotbar → inventory → equipment and back | Item moves correctly every time; no duplication, no loss | | | | | | | | | | |
| 13 | Press `1`–`9` | Hotbar selection highlight follows; held item changes in-world | | | | | | | | | | |
| 14 | Craft a wooden axe, then a workbench | Recipe shows as available only with the right inputs; inputs consumed; output added | | | | | | | | | | |
| 15 | Place the workbench, open it, craft a stone tool | Workbench-only recipes appear only when it is open and in range | | | | | | | | | | |
| 16 | Place a furnace, load iron ore + coal, wait | Smelt progresses over time; yields an iron ingot; fuel is consumed | | | | | | | | | | |
| 17 | Place a chest, store items, close, reopen | Contents persist exactly; chest and player inventories stay distinct | | | | | | | | | | |

## D. Survival loop

| # | Step | Expected result | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 18 | Sprint with `Shift` until stamina empties | Stamina drains, sprint cuts out, stamina regenerates when walking | | | | | | | | | | |
| 19 | Play until hunger drops, then eat cooked food | Hunger bar refills; food is consumed from inventory | | | | | | | | | | |
| 20 | Let health drop, then recover | Health bar responds; death/respawn path works without a white screen | | | | | | | | | | |
| 21 | Cook raw beef on a campfire | Raw → cooked conversion completes; cooked item is distinct | | | | | | | | | | |

## E. World systems and persistence

| # | Step | Expected result | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 22 | Watch a full day→night→day cycle (or force it in the admin panel) | Light level ramps smoothly; no hard snap; torches/campfire light their surroundings at night | | | | | | | | | | |
| 23 | Plant a sapling and wheat seeds, wait | Both grow through their stages and become harvestable | | | | | | | | | | |
| 24 | Observe animals for 30s | Chickens, pigs, sheep, cows wander and animate; no stutter, no drift off-chunk | | | | | | | | | | |
| 25 | Save, reload the page, load the save | Player position, inventory, equipment, placed objects, animals and time all restore | | | | | | | | | | |

---

## Pre-overhaul save compatibility

Item 25 has a second, stricter form that must pass from Phase 8 onward:

- Before Phase 1, create a save and export the raw `localStorage` blob to `docs/fixtures/save-v0.json`.
- After Phase 8, load that exact blob. It must migrate and load cleanly — this is the
  "an existing pre-overhaul save still loads" line in the definition of done.
