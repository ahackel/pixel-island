# Getting characters, plants and terrain into the game

Everything in this repository is made by rules from small descriptions: a character is a look (body,
colours, items) plus poses, a plant is a recipe of parts, the ground is a height map. The game
should not run those rules every frame. It should draw finished pictures: textured quads, sorted
back to front. This page describes how to get from one to the other and how to draw it cheaply.

## 1. Bake to texture atlases

`node scripts/bake.mjs [outDir] [pageSize]` writes what the game draws:

- `atlas-<n>.png`: pages of trimmed frames, packed on shelves.
- `atlas.json`: per frame its page, rectangle and **pivot** (the pixel that stands on the ground),
  and per animation its frame names and frames per second.

What it bakes today:

| What | Frames | Notes |
| --- | --- | --- |
| Each plant, rock, driftwood | 4 variants × 8 wind frames | Hard plants (cacti, rocks, wood) are identical in every wind frame and stored once. |
| Their ground shadows | 1 per variant | A separate mask frame cast from the sun, see *Shadows* below. |
| A character | every clip × 4 facings | Facings 1 and 2 are mirrors of 0 and 3; a game can bake two and flip the quad. |
| Each animal preset | 6 clips × 4 facings | `anchors` in `atlas.json` gives each frame's symptom points (eye, nose, mouth, top, head, body, back, foot) as `[x, y, visible]` from the pivot. A game can also skip baking and call `drawAnimal()` from `engine/animals/animal.ts` at load time. |

The whole current catalogue bakes in about a second into two 1024² pages, half full. Size and
season are two more axes when they are needed: bake the sizes the level design uses (for example
80, 100 and 120 %) rather than a continuous range, and season as two or three steps.

### Bake at build time or at load time

Both work, because the rules are deterministic and fast:

- **Build time** (what `bake.mjs` does): the game ships PNG atlases and never sees a recipe.
  Simplest to integrate in any engine.
- **Load time**: ship the recipes (a few kilobytes each) and the rule code, and bake into a GPU
  atlas when a level or a character appears. This is what makes model-generated or player-edited
  content work without a new build, and it keeps downloads small. The rule code is plain
  TypeScript without dependencies, so it runs in a browser game as is and ports to C# or GDScript
  in a few hundred lines per module.

## 2. Characters: compose once per look, not per frame

A character is many layers (body, hair, clothes, tools, face). Drawing those layers every frame
multiplies the draw cost by the layer count. Instead, compose each **look** once into its own
small atlas: for one look, the five clips in two facings are 72 frames, 43 of them different
once repeats are stored once, about 140 KB of texture after trimming. Recompose only when the look changes (new clothes,
more ragged, a different mood). Dozens of characters on screen are then dozens of quads.

**Colour choices without more textures:** bake frames as *palette indices* (one byte per pixel:
palette entry and tone) instead of colours, and look colours up in a small palette texture in the
shader. A shirt in 30 colours, a skin tone, dryness of a plant or a dusk tint is then a different
palette row, not a different atlas. The palette here is already built for this: every colour is a
base with one shade and one light tone, derived by one rule.

## 3. Drawing a frame

- **Batching**: one atlas page, one material, one draw call for everything on it. Put all plants
  of a region and all composed characters on as few pages as possible.
- **Sorting**: draw back to front by the ground position of the pivot, `i + j` on the map, the
  same order the island scene on the flora page uses. Engines that sort sprites by a key (Unity
  sorting groups with a custom axis, Godot y-sort, a sort in Pixi) take this directly.
- **Wind**: every plant instance plays the same 8-frame loop with its own phase offset, picked
  from its position. No per-instance state, no shader; at 6 frames per second most frames are
  unchanged. Far away, or with the wind calm, plants can stay on frame 0.
- **Static scenery**: rocks, driftwood and calm plants never change. Draw them once into the
  terrain chunk they stand on (see below) and they cost nothing per frame, except where something
  can walk behind them; those stay sprites.
- **Pixel-perfect output**: render the scene at its native pixel size into a small render target,
  then scale it to the screen by a whole number with nearest-neighbour filtering. Snap sprite
  positions to whole pixels. This keeps every pixel square at any screen size and is also the
  cheapest way to fill a high-resolution screen.

## 4. Shadows

Ground shadows are partly transparent. Drawn one by one, two overlapping shadows darken the ground
twice and show their outlines. The fix is to draw all shadows into one **shadow layer** first,
as plain coverage (on or off), and lay that layer over the ground once:

- No picture carries a shadow of its own: a ground shadow is always cast from the sun, never a
  painted blob or ellipse. `sunShadow` in `engine/world/island.ts` casts one on flat ground (each
  painted pixel stands upright over the foot and is sent away from the light, as the world casts
  over the terrain), and the atlas has it as a `/shadow` mask frame per plant variant, for the
  character, per animal and per object turn, from the first frame. It is cast for the facing baked,
  so a quad flipped for a mirrored facing needs its shadow cast again, not flipped.
- In an engine: render shadow sprites into a render target (or the stencil buffer) with any
  opaque colour, then draw one full-screen quad over the ground that darkens where the target is
  set. Sprites are drawn after, so shadows never fall on the plants themselves.

The flora page does exactly this in software for its preview and its island.

## 5. Terrain

`engine/world/terrain.ts` is the start of the ground: a height map with one whole level per one-metre
tile, level 0 at the water line, one level is 8 screen pixels (about a third of a metre). From
the heights alone, by rule:

- slopes: each tile's corners take the average of the four tiles round them, kept within one
  level of the tile, so neighbours differing by up to two levels share a slope and larger
  differences remain as cliffs;
- the surface: deep water, shallows, beach (level 0), sand, grass, rock (high or steep); low
  ground is sand whatever the tile, so grass gives way to sand down a slope;
- the sea floor slopes too, and water is laid over everything below level 0 in bands by depth:
  foam at the edge, sand showing through, shallow, deep. A beach runs into the sea in a curve;
- walking: `canStep` allows slopes, not cliffs, and no water;
- what grows where: each plant group has the surfaces it belongs on, and things stand on the
  sloped ground at their exact point (`heightAt`).

**Drawing it efficiently:** the ground does not move. Draw it in chunks (for example 16 × 16
tiles) into a texture once, and only redraw a chunk when its heights change. Sprites standing on
the ground are hidden by higher ground in front of them: here each terrain pixel remembers which
tile painted it (`TerrainImage.cell`) and a sprite pixel is dropped when that tile is nearer and
higher (`hiddenByGround`). In an engine the same test is a depth value written by the chunk and
compared in the sprite shader, or simply splitting cliffs that can hide things into sprites of
their own and sorting them with everything else.

**Next steps for the terrain:** more surfaces (mud, wet rock, paths), tile textures painted by
rule like the plants, and placement rules that read neighbours (palms leaning over the beach,
reeds at the water's edge, jungle denser away from the sea).
