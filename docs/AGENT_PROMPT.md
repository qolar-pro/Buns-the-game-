# The prompt

Copy everything in the box below and give it to the computer-use agent. It is
self-contained — it does not assume the agent has seen this conversation or
knows anything about the project.

---

```
You are drawing pixel art for a game called Buns the Game. You have control of
this computer. Work carefully and check your work as you go.

SETUP

1. Install LibreSprite (free, https://libresprite.github.io) if no pixel art
   editor is installed. Krita or Piskel are acceptable alternatives. Do NOT use
   a general image editor like Photoshop or Paint — they anti-alias by default
   and that will ruin every sprite.

2. Clone the repository and check out the branch:
      git clone https://github.com/qolar-pro/Buns-the-game-
      cd Buns-the-game-
      git checkout claude/new-session-p0xhkm

3. Install Node dependencies so the validator works:
      npm install

4. READ docs/ART_BRIEF.md COMPLETELY BEFORE DRAWING ANYTHING. It contains every
   sprite's exact canvas size, the rules, and the editor setup. It is the
   specification; this message is only the assignment.

5. Load the palette into your editor: docs/palette/hearthwood.gpl
   (Palette > Load Palette in LibreSprite/Aseprite; import as a palette docker
   in Krita. Piskel: use docs/palette/hearthwood.hex instead.)

THE JOB

Draw replacement sprites and save them to assets-hand/<atlas>/<id>.png

Do the twelve sprites in the "Start here" section of the brief, in that order.
Do not work through the full tables — they are reference, not a plan. Stop after
those twelve and report back.

For each sprite:
  a. Look at the existing version at assets-build/<atlas>/<id>.png to see the
     subject and the exact size. You may open it and draw over it.
  b. Create a new file at EXACTLY the canvas size the brief lists.
  c. Draw it, following the hard rules in the brief.
  d. Export as PNG at 100% scale (never "export scaled") to
     assets-hand/<atlas>/<id>.png
  e. Run: node scripts/check-hand-art.mjs
     Fix everything it reports before moving on. Do not batch this up — a wrong
     canvas size or a soft edge means redrawing, and finding out after twelve
     sprites means redrawing twelve.

THE RULES THAT MATTER MOST

- Exact canvas size. If your art is the wrong size, change the CANVAS size and
  redraw. Never scale the image — it blurs every pixel.
- Hard 1-pixel pencil only. No anti-aliasing, no soft brushes, no feathering,
  no gradient tools, no blur, no smudge. Every pixel fully opaque or fully
  transparent, nothing in between.
- 32-bit RGBA PNG, transparent background. (Terrain tiles are the exception:
  fully opaque, and they must tile seamlessly.)
- One light source, upper left, on every sprite. Top and left surfaces lighter,
  bottom and right darker.
- A dark outline, #1c120b, around the outside of objects — except terrain, and
  except anything thinner than about 3 pixels.
- Use the loaded palette. 5-9 shades per material plus the outline.
- World objects stand on the BOTTOM edge of the canvas.

HOW TO WORK EFFICIENTLY

Clicking individual pixels is slow and drifts. Instead, per sprite:
  1. Block the silhouette with rectangle/ellipse/fill tools in one mid-tone.
     Get the shape right first — silhouette is most of whether a sprite reads.
  2. Add the outline around it.
  3. Add two or three flat shade bands, lit from the upper left. Flat bands with
     hard edges, NOT a gradient.
  4. Add details last.
Work zoomed to at least 8x. Save often.

SCOPE — DO NOT

- Do not modify any file outside assets-hand/. In particular do not touch
  tools/, src/, scripts/, or assets-build/.
- Do not delete or edit the existing generated art.
- Do not invent filenames. If you cannot find a sprite by the name you expect,
  search the tables in the brief — a misspelled filename is silently ignored,
  so the art would look delivered while nothing uses it.
- Do not run npm run assets:art or any generator script.

WHEN DONE

1. Run node scripts/check-hand-art.mjs one final time. It must report 0 errors.
2. Commit and push:
      git add assets-hand/
      git commit -m "Hand-drawn art: <list what you drew>"
      git push origin claude/new-session-p0xhkm
3. Report back with: which sprites you completed, the final output of the
   checker, and anything you could not do and why.

IF YOU GET STUCK

If a sprite is too difficult, skip it, say so in your report, and move to the
next. A partial set is fine — every sprite not replaced keeps its existing
version and the game still runs. Do not produce a low-quality sprite to avoid
skipping one.
```

---

## If the agent cannot push to GitHub

Drop the `git` steps entirely. Have it save the PNGs to a folder and send them
over however is convenient — the files are all that matters, and the folder
layout (`<atlas>/<id>.png`) is the only thing that has to survive the trip.
