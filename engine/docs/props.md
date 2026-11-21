# Props: one thing in the world (proposal, 2026-11-20)

## Status (2026-11-21)

| Phase | State |
| --- | --- |
| 0 | Done: `Build`, `cleanBuild`, `DEFAULT_BUILD`. |
| 1 | Done: `engine/world/prop.ts` (`PropKind`, `PlacedProp`, view maps, features, `propKinds()` over flora, object presets, saved objects and decorations). `Scene.props` is a new optional list; `plants`, `decor` and `items` keep what they hold. |
| 2 | Done: `tools/props`, with search and filter chips by source and feature, hidden kinds behind a chip. |
| 3 | Mostly: the Shape tab edits a flora recipe (stored where the flora tool keeps it) and a built prop's size, parts and points (`tools/objects/build-panel.ts`, shared with the object editor). The library renames, duplicates, hides, deletes and paints new. **Not done:** the flora and object pages are not retired. The flora tool's island preview, dryness and colour swaps live only there. |
| 4 | Done: views (1, 2, 4, 8, optionally mirrored) and features apply to every source; wind on a painted prop shears its columns by height (`flex`), loop bobs it. `states` is not built. |
| 5 | Done as a new Props tool in the scene editor (one search box over everything); the Plant and Decor tools stay. Plants, decorations and the crate picked there still go into their own lists. With Move, T turns a prop or plant an eighth. |
| 6 | Done: the `painted` source and the pixel editor (`tools/paint/pixel-editor.ts`), shared with the wall and parts editors. |
| 7 | Done: freezing draws every own view once into one art (`engine/core/stamp.ts`). A catalogue kind is **locked**: the world draws its pixels for plants, the crate and placed props, with a badge in the library and Unlock to go back. A kind of this device just becomes painted. Scene files carry the painted kinds and locks they use (`Scene.carried`), so a game on another site draws them too. |

Answers to the open questions below: `seed` is a variant index clamped to what a kind has. A grown kind has four and everything painted has one. The views of a painted kind are separate grids in one art with one shared legend. `carry` reuses the kind's own picture.

The same freezing serves walls (`tools/walls`, `engine/world/building/walls.ts`) and wardrobe parts (`tools/parts`, `engine/character/parts.ts`).

**The name.** A prop is anything standing in the world that is not terrain and not a character: a
palm, a rock, a crate, a chest, a tuft of grass. `Item` is taken by the wardrobe's clothing and the
game's bag (66 uses), and `Object` is both too general and the name of today's box-and-cylinder
editor (87). `Prop` is used 20 times, all of them the geometry type in `engine/objects/object.ts`,
which this absorbs — so the word is freed by the same change that needs it. That type is renamed
`Build`, one source among four.

Today the engine has several kinds of content that are really all props. Foliage is
grown from a recipe, sways in the wind and keeps to the ground it grows on. An object is built from
boxes and turns with the camera. Items, decorations and props are each their own small system. What
a prop is allowed to do follows from which of those boxes it was put in, not from what it is.

This proposes one record for every prop placed in the world, one way of saying which of the eight
directions it shows, and a list of features any of them may opt into. It does **not** propose one
renderer: a plant grown by rule, a raycast box and a jointed puppet are different for good reasons.

## What is already shared

More of this exists than it looks.

- `Thing` in `engine/world/island.ts` is already the common draw interface. Flora, objects, items,
  buildings, animals and characters all reduce to `{ spot, picture, w, h, foot }` before
  `World.compose` sees any of them.
- `PlacedPlant` in `engine/world/world.ts` is already nearly the record below: an id, a position in
  metres, a variant seed, a size and `turn` in eighths of a turn, 0 to 7.
- Eighth turns already work in two places. Flora stores them, and `rotate(u, v, turn)` in
  `engine/objects/object.ts` takes fractional turns, "a half turn (0.5, 1.5…) is an eighth turn".

So the gap is not drawing and not rotation. It is that content is split by category at the
authoring layer, and the category decides what a thing may do.

## The record

One row per placed prop, one list per scene:

```ts
interface PlacedProp {
  kind: string;          // catalogue id
  i: number; j: number;  // metres from the north corner, fractional
  turn: number;          // eighths of a turn, 0 to 7
  seed: number;          // which variant, clamped to what the kind has
  size: number;
  state?: unknown;       // open, stage, whatever the kind defines
}
```

Plants, furniture, ground clutter and dropped items are all this row.

## The definition

```ts
interface PropKind {
  id: string;
  name: string;
  anchor: 'point' | 'edge' | 'cell';
  source: Painted | Grown | Built | Rigged;
  views: ViewMap;
  features: Feature[];
  footprint: { w: number; d: number };
  pivot: { x: number; y: number };
  prefers?: Surface[];   // a hint for the generator, not a rule for the editor
  tags: string[];        // what the editor searches and filters by
}
```

`anchor` is load-bearing. Walls and roofs sit on cell edges, not on points, and forcing them into
the point model would make them worse. They keep their own anchor and stay as they are.

### source: the only part that genuinely differs

| Source | What makes the pixels | Where it lives |
| --- | --- | --- |
| `painted` | a stamp drawn by hand, one per view | new; the pixel editor's own format |
| `grown` | a flora recipe grown by rule | `engine/flora/flora.ts` |
| `built` | boxes, cylinders and balls, ray-cast per pixel in the 2:1 view | `engine/objects/object.ts`, today's `Prop` |
| `rigged` | joints and poses | `engine/core/puppet.ts`, `engine/animals/animal.ts` |

All four already produce a `Picture`, so this costs nothing where things are drawn. The categories
stop being kinds of thing and become ways of making pixels.

### views: the eight directions

One map per kind, the pattern `FACING_VIEWS` in `engine/core/puppet.ts` already uses: each of the
eight directions names a view and whether it is mirrored.

| Views | For | Notes |
| --- | --- | --- |
| 1 | a bush, a rock, ground clutter | all eight directions draw the same picture |
| 2 | front and back | |
| 4 | most furniture | the axis-aligned iso quadrants |
| 8 | rare | the diagonals show a box corner-on, with stepped edges; worth it only where the thing really reads differently |

Each source fills the views its own way: `painted` means that many stamps were drawn, `built`
ray-casts at `turn × 0.5`, `grown` grows at the turn, `rigged` uses its facings. One map, four
fillers.

### features: capability, not category

Today foliage *means* animated and wind-blown, and an object *means* geometric and turnable. These
invert that: any kind may opt into any of them.

| Feature | What it adds | Who has it today |
| --- | --- | --- |
| `wind` | sway by a phase taken from the position | foliage only |
| `loop` | n frames at a rate | objects only (`blink`, `flow`, `bob`) |
| `states` | discrete frames, such as a chest lid | hand-written in the game |
| `glow` | gives light and survives the tint pass | the palette's fire tones (`GLOWING` in `daylight.ts`) |
| `blocks` | a collision footprint | per system |
| `carry` | can be picked up and held; gives the picture drawn in the hand | `itemPicture` in `engine/world/props.ts` |
| `shadow` | derived from the picture's own pixels; an override for flat things | `World.shadowOf` already derives it |

A palm is `source: grown` with `wind`. A table is `source: built` with nothing. A painted bush may
have `wind` too, through a bend rig: one number for how flexible it is, and the engine shears its
columns by height. Nothing is animated because of the box it was filed in.

## Where a prop may stand

`docs/engine-spec.md` settled that "plants keep to the ground they grow on in the flora tool (palms
not on rock, driftwood only on the beach, and so on)". That becomes a hint rather than a rule:

- the editor places anything anywhere, and refuses nothing;
- `prefers` is read **only by the island generator** when it scatters things automatically.

One hard rule stays, because it is physics rather than taste: nothing stands below the water line
unless it declares that it floats.

Worth knowing what this costs. Those surface rules are the reason a generated island looks right
with no hand placement. Dropping them outright means every island needs manual work; keeping them
as generator hints keeps both.

## Painting and freezing

`painted` is the editor's own format, and it is also where the other three sources can be frozen:

```
grown / built / rigged  ->  draft  ->  freeze to painted  ->  edit the pixels
```

Ground clutter is then the case that simply starts painted: `source: painted`, one view, no
features, a stamp and a pivot. Nothing about it is special in the data model, which is the test of
whether the model is right.

Freezing keeps what matters because a stamp is `Cell[][]`, a palette key and a tone per pixel
(`engine/core/palette.ts`), so a frozen thing can still be recoloured and lit. The object
ray-caster already works out `(colour key, tone)` per pixel before flattening to hex, so freezing a
built object captures an editable stamp directly.

## One editor

`tools/flora` and `tools/objects` are two views of the same thing, and the split is what makes a
prop's category decide what it may do. They become one tool, `tools/props`. The wardrobe stays: it
dresses a rigged puppet, a different job. The animal editor is also rigged and could follow one
day, but a character is not placed the way a crate is, so it stays for now. Five tools become four.

Three panes: a **library** on the left, a **stage** in the middle, a **panel** of four tabs on the
right.

- **Library.** One search box over name, tags, source and features, with filter chips. Rename in
  place, duplicate, delete, new. Duplicating matters most: the catalogue ships in
  `engine/flora/data/*.json` and `object-presets.ts`, and duplicating is how a shipped palm becomes
  your palm without editing a file the engine owns. Catalogue entries are hidden rather than
  deleted. **New** asks for a source: paint, grow or build.
- **Stage.** The prop on a ground swatch with the survivor beside it for scale, which the flora
  tool already does and which furniture needs just as much. A ring of the eight directions shows
  which views are a prop's own, which are shared and which are mirrored. Play and pause for wind
  and loops. The flora tool's island preview stays as a preview mode.
- **Panel.** **Views** (how many, which directions share, mirrors), **Shape** (the only tab that
  changes with the source: recipe text, the parts list, or nothing for painted), **Features**, and
  **Pixels**, which opens on any source.

The Features tab is the point of the merge made visible: wind and loops are boxes to tick, not a
consequence of which page was opened.

## Order of work

Each phase ships on its own and leaves the tools working. Sizes are relative.

| Phase | What | Size |
| --- | --- | --- |
| 0 | Free the name: `Prop` becomes `Build` in `engine/objects/` | S |
| 1 | `PlacedProp`, `PropKind`, `ViewMap`, `Feature` over today's renderers | M |
| 2 | `tools/props`, library only, read-only, with search | M |
| 3 | Move flora's and objects' editing in; retire both pages | L |
| 4 | The Views and Features tabs; wind and loops into shared code | M |
| 5 | The library pane in the scene editor | S |
| 6 | The `painted` source and the pixel editor | L |
| 7 | Freeze | S |

**0.** `Prop` → `Build`, `cleanProp` → `cleanBuild`, `DEFAULT_PROP` → `DEFAULT_BUILD`. Twenty uses,
all local. Done when `tsc --noEmit` passes and `objects-check.mjs` still reports 168 frames of 21
objects.

**1.** A new `engine/world/prop.ts` holding the record, the definition and a `kindsOf()` that adapts
the three catalogues without rewriting a renderer. `scene.ts` gains one `props` list and keeps
reading the old `plants` and `items`. Done when a scene round-trips, old files still load and
nothing on screen changes. The risk is the validator: decide what `seed` means for a painted kind
before writing it.

**2.** Registered in `vite.config.ts`, `shared/shell.ts` (`TOOLS`) and the start page. Done when
every plant and every object appears in one searchable grid.

**3.** The largest step. Flora's recipe editor and the objects tool's size, parts and points panels
become the Shape tab. The library gains rename, duplicate, delete and new. The two old pages
redirect. Done when four tools do what five did and nothing is lost, the island preview and the
survivor included.

**4.** Eighth turns already work in both systems, so this is mostly bookkeeping. Done when a painted
bush can sway and a grown plant can be still, with no code change. Default the ring to linked views,
so sharing is what happens unless the link is deliberately broken.

**5.** Lift the library pane into a shared component and use it in `tools/scene` in place of the
plant palette. Small, and the phase that changes the day's work: one search box places anything.

**6.** A stamp per view, and the Pixels tab: pencil, eraser, fill, eyedropper, line, rectangle;
swatches of palette keys and tones, never a free colour, so everything stays recolourable and lit;
an onion skin of the generated version underneath; undo through `shared/history.ts`, which snapshots
JSON and works on a stamp as it is. `brush.ts`, `pixels.ts` and `viewport.ts` are reused. Done when a
piece of ground clutter can be drawn from nothing and placed.

**7.** Explicit, with a badge on the card and a way back to the generated version while the recipe
survives. Freezing a prop with several views freezes all of them together, or they drift apart.

Phases 0 to 4 leave one editor where there were two, with wind and animation as properties. Phase 5
is the one that speeds up building scenes. Phases 6 and 7 are the pixel-art payoff, and 6 is a real
pixel editor, which is never small.

## Deliberately not in this plan

**Palette indices in the live renderer.** `docs/export.md` describes baking frames as one byte per
pixel, a palette entry and a tone, for the export path; that still stands and is unbuilt. Doing the
same inside the engine is not worth it yet. Colours are hex strings only while a picture is being
composed: `packedOf` in `engine/world/island.ts` turns each picture into typed arrays on its first
stamp and keeps them, so the frame loop already walks bytes. Converting would buy first-appearance
time and memory, not frame rate. It becomes worth doing if a WebGL path is wanted, if props need
recolouring after all, or if load time becomes the complaint, since an indexed atlas is a quarter
the size and compresses better.

## Open

- `seed` means nothing for a painted kind. Either define it as a variant index clamped to what the
  kind has, or move it inside the source. The scene validator needs one answer.
- Whether `states` and `loop` are one feature with two ways of advancing, or two.
- Whether a painted kind with several views stores them as one wide stamp or as separate ones.
- Whether `carry` needs its own picture at all, or can reuse the kind's one-view drawing scaled to
  the hand.
