# Pixel Art

Tools for a pixel-art game in isometric view about a shipwreck survivor on an island: stylized characters with good animation, plants, rocks and terrain, with the content written by a language model and drawn by rules. People only review and touch up.

The tools are published at [andreashackel.de/pixel-art](https://andreashackel.de/pixel-art/): a start page, the [wardrobe](https://andreashackel.de/pixel-art/tools/wardrobe/), the [animal editor](https://andreashackel.de/pixel-art/tools/animals/), the [object editor](https://andreashackel.de/pixel-art/tools/objects/) ([`docs/animal-spec.md`](docs/animal-spec.md), [`docs/object-spec.md`](docs/object-spec.md), made for Animal Hospital), the [flora tool](https://andreashackel.de/pixel-art/tools/flora/), the [props tool](https://andreashackel.de/pixel-art/tools/props/), the [wall editor](https://andreashackel.de/pixel-art/tools/walls/), the [parts editor](https://andreashackel.de/pixel-art/tools/parts/) and the [scene editor](https://andreashackel.de/pixel-art/tools/scene/).

The repository started as an exploration of customizable characters, and the earlier work is still here:

- [`docs/research.md`](docs/research.md) compares six 2D and 3D approaches, recommends one, and covers how it carries over to pixel art.
- A 3D prototype of that approach (3D characters from modular parts, drawn as pixel art) was removed once the 2D puppet replaced it; it is in the git history before the scene editor.
- [`docs/pixel-style-research.md`](docs/pixel-style-research.md) collects what makes small pixel-art characters appealing and how shipped games build layered ones.
- [`docs/plan.md`](docs/plan.md) is the plan that followed feedback on that prototype: a true 2D pixel-art character whose items are written by a language model. Its first experiments and their results are described there; the code from them lives on in `engine/`.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open the printed address for the start page.

```bash
npm run build
```

builds the start page and the tools into `dist/`, which is what gets published. The type check (`tsc --noEmit`) is the only static check.

## Publishing

`.github/workflows/pages.yml` builds the site and publishes it with GitHub Pages on every push to `main`. With the repository named `pixel-art`, it appears at `andreashackel.de/pixel-art/`. It needs one setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## The 2D wardrobe

With the dev server running, open `/tools/wardrobe/` to dress a pixel person: gender, skin, three builds, face options, hair, beard, hat, top, bottom, shoes and a held item, with colour swaps, five actions and four facings. A condition from neat to tattered is a value of the character and ages everything worn, and the hair, by rule (`engine/character/wear.ts`). A mood drives the facial expression. **Saved characters** keeps named characters on this device (save, save as new, delete, export and import as JSON); the scene editor plays them. The character model and that list are in `engine/character/character.ts`. Its items are the model-generated ones from `engine/character/data/`, assembled by `engine/character/catalog.ts`. The text is in English and German (`tools/wardrobe/i18n.ts`).


## Polishing by hand: props, walls and parts

Everything is drawn by rule first; these three tools let a person freeze what a rule drew into pixels and touch it up in one shared pixel editor (`tools/paint/pixel-editor.ts`: pencil, eraser, fill, picker, line, rectangle, mirror painting, nudging, the rule-drawn version as an onion skin). Paint is always a palette entry in one of its three tones (`engine/core/stamp.ts`), so frozen things can still be recoloured and lit.

- **Props** (`/tools/props/`, `engine/world/prop.ts`, plan in [`docs/props.md`](docs/props.md)): one searchable library over every plant, object, decoration and the crate, and props painted on this device. A stage shows the picked prop beside the survivor from all eight directions; tabs set how many views it has and which are mirrored, its shape (a flora recipe, or an object's parts), its features (wind, loop, glow, blocks, carry) and its pixels. Freezing a catalogue prop **locks** it: scenes and games draw the painted pixels until it is unlocked. Scenes carry the painted props and locks they use, so a game shows them too. The scene editor's Props tool searches the same library.
- **Walls** (`/tools/walls/`, `engine/world/building/walls.ts`): the wall pieces of buildings on a test ground with a hut, a ramp, a cliff and the thatch roof. A painted wall is kept per screen column from its foot up (`pieces/painted-wall.ts`), so it still follows slopes and cliffs. A frozen built-in wall is locked, and `wallKind()` hands games the painted one.
- **Parts** (`/tools/parts/`, `engine/character/parts.ts`): every wardrobe item as the stamps the puppet draws, layer by layer, on a figure from all eight sides with wear. Edits are laid over the catalogue, so the wardrobe and everything else here wears them.

## Island flora

Open `/tools/flora/` for plants, rocks and driftwood in the same style: palms, grass, cacti, jungle plants, stones and washed-up wood. A language model describes each one as a few parts (`docs/specs/spec-plant.md`); `engine/flora/flora.ts` grows them by rule, adds variants, sizes, wind, drying out and cactus spikes, and draws them in the characters' view and palette. The page shows them on the ground and on a generated island with a survivor, and lets you edit a recipe and watch it regrow.

The island's ground is a height map (`engine/world/terrain.ts`): one whole level per one-metre tile, level 0 at the water line. Surfaces, cliffs, foam, where one can walk and what grows where all follow from the heights.

`node scripts/bake.mjs` bakes everything into texture atlases with pivots and animations for a game engine. How to export and draw it efficiently is in `docs/export.md`.

## Scene editor and engine

Open `/tools/scene/` to build a scene and walk around it. Spec: [`docs/engine-spec.md`](docs/engine-spec.md).

- **Edit**: the Ground tool shapes the ground with one gesture: press and pull up or down, and the ground under the brush follows the pointer a level at a time, up to a plateau or down to a pit (lowered below the water line it becomes sea floor); only how far the pointer is above or below the press counts, until it is let go; in a cave, a quick tap turns rock into floor and floor into rock, and rock pulled down is carved open. The walls of a cave's rock, those along the back of the map too, are picked as that rock. Shift-drag smooths, Alt-drag flattens to the height where it starts (or one picked with Ctrl-click), and its Edges choice makes the ground it works smooth or cut. Ways lays ladders and doors on edges, and ramps and holes in cells. The Material tool paints what it is pressed on, over the height rule: on a top, the tops of the ground (its faces staying as they are); on the face of a step or on a cave's rock, the faces and walls (rock walls of stone, brick or mine); with Shift, both; the brush tints only what it will paint, and Ctrl-click (Cmd-click) picks a tile's material. The other tools place plants from the flora tool (with the recipes and colours edited there), decorations, animals, people and objects, erase them, and set the start point. Brushes of 1 to 7 tiles, sized on the gizmo at the top left of the view, which shows the brush's tiles as they lie (press or drag on it, the wheel, or [ and ]). A smoothing or flattening stroke keeps to the flat plane at the height where it was pressed, so ground rising or falling under the pointer does not pull the stroke onto other tiles. The tile under the pointer is outlined (grid lines, when shown, are one pixel wide). The cutaway, a slider with two knobs at the left of the view (Page Up and Page Down move the upper one), keeps the tools to a band of levels: ground over the upper knob is cut away, drawn as a hatched cap at that level with what stands on it hidden, so floors behind cliffs and lower tiers of a cave can be worked; ground under the lower knob is drawn darker and out of reach. Nothing is raised over the band or lowered under it. A view toggle hides the water, so the sea floor shows bare (while editing only). The Settings tool sets the scene's name, size, what lies beyond it, light, water line, a cave's headroom, tint, darkness and rubble, and who walks it in Play, in the inspector; each change applies at once and is undone in one step.
- **Play**: a saved character from the wardrobe walks (WASD or arrows, Shift to run) or goes where you tap; far taps run. E waves, F uses the held item. Water, cliffs of more than two levels and every plant but grass block the way. The camera stays put; pan it by hand.
- **View**: turn the scene by quarter turns (Q and R, or the arrows by the zoom buttons), zoom and pan, in both modes. Turning only changes the view; the saved scene keeps its own coordinates.
- **Scenes**: several per device, each with a name and a size of 8 to 64 tiles a side; new, settings (the Settings tool), delete, export and import as JSON. Saved in this browser on every change.

The runtime is in `engine/world/`, built on the rest of `engine/`: `scene.ts` (the saved form, checks for anything read back, storage and files), `world.ts` (ground image, plant pictures, composing the camera window, picking tiles, collision) and `actor.ts` (movement, facing, clips and emotes). The page in `scene/` is the editor on top.

Known limit: every ground edit redraws the whole ground, about 70 ms for a 28 by 28 scene and 300 ms for 64 by 64 on a laptop, so large scenes stutter while sculpting.

## Layout

| Folder | Purpose |
|---|---|
| `shared/` | Utilities with no knowledge of the game: seeded random, local storage and file helpers, undo history, brush, language switch, the page shell and styles shared by every tool |
| `engine/` | Everything that draws or simulates, no page code |
| `tools/` | The editors, one folder per page: `wardrobe/`, `parts/`, `animals/`, `props/`, `objects/`, `flora/`, `walls/`, `scene/`; `paint/` is the pixel editor they share |
| `home/` | The start page (`index.html` at the root loads it) |
| `scripts/` | Node scripts: baking, format descriptions, preview sheets and checks |
| `docs/` | Specs and research; `docs/specs/` holds the format descriptions given to the model |

Inside `engine/`:

| Folder | Purpose |
|---|---|
| `core/` | `puppet.ts` draws a 32 by 48 character from joint positions by fixed pixel rules, in four facings (eight with mirroring); `poses.ts` has the hand-written key poses and clips; `palette.ts` is the master palette |
| `character/` | `base.ts` (generated base body, faces, hairstyles), `items.ts` (the two item formats, their checks, conversion to one item shape), `shell.ts` (hair as one shape round the skull), `wear.ts` (condition ages everything worn), `catalog.ts` (turns every file in `data/` into wardrobe items and handles colour swaps), `character.ts` (the character model and saved list); `data/` holds the model's unedited answers |
| `flora/` | `flora.ts` grows plants from recipes by rule; `flora-catalog.ts` lists them; `data/` holds the model's plant files |
| `animals/`, `objects/` | The renderers and presets of the animal and object editors |
| `world/` | The height-map terrain and island generator, and the game runtime: scene format, world, actor, herd, ocean, decor, props |

`node scripts/make-specs.mjs` rewrites the format descriptions in `docs/specs/` for the current body; items in `engine/character/data/` belong to the first base body and should be generated again afterwards. Scripts: `review.mjs` renders wardrobe characters in every facing and walking; `parts-check.mjs` draws every hairstyle, hat and tool in flat part colours from all sides and reports broken frames; `turntable-check.mjs` (`npm run check:turntable`) measures each hairstyle, hat and garment in the five drawn views and reports where they disagree; `check-all.mjs` compiles every generated item and reports what was valid, repaired or rejected; `animals-check.mjs` and `objects-check.mjs` check the presets.
