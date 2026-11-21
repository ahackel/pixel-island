# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install`, then `npm run dev` — Vite dev server: start page at `/`, tools at `/tools/wardrobe/`, `/tools/parts/`, `/tools/animals/`, `/tools/props/`, `/tools/objects/`, `/tools/flora/`, `/tools/walls/`, `/tools/scene/`.
- `npm run build` — `tsc --noEmit && vite build` into `dist/`; `.github/workflows/pages.yml` publishes it on push to `main`. The type check is the only static check; there is no linter and no test runner.
- `npm run bake` (`scripts/bake.mjs`) — bakes characters and flora into texture atlases with pivots and animations (see `docs/export.md`).
- `npm run check:turntable` — measures hairstyles, hats and garments across the five drawn views.
- Other checks are plain scripts: `node scripts/<name>.mjs` (`parts-check`, `animals-check`, `objects-check`, `check-all`, `history-check`, `brush-check`, `review`). Scripts that need `import.meta.glob` load the code through Vite SSR with the repo root as `root`.

## Layout

Three layers; dependencies point down only (`tools` → `engine` → `shared`):

- `shared/` — game-agnostic utilities: `random.ts`, `files.ts` (local storage and file helpers), `history.ts` (undo), `brush.ts`, `lang.ts`, `pixels.ts`, `shell.ts` (the page shell and top bar), `pixel-font.ts` (the 3×5 pixel font from Lop Hop), `pixel-ui.ts` (pixel frames, buttons, labels and speech bubbles as small scaled canvases), `cheats.ts` (the ?cheats button and drawer any game can add), `viewport.ts` (a pixel canvas with eased zoom, pinch, two-finger and trackpad pan, and presses in ground pixels, for games), `base.css`, `ui.css`. `history.ts` and `brush.ts` have no DOM so scripts can test them.
- `engine/` — everything that draws or simulates, no page code:
  - `core/`: `puppet.ts` (draws a 32x48 character from joint positions, four facings plus mirrors), `poses.ts` (hand-written poses and `AUTHORED` clips), `palette.ts` (master palette), `stamp.ts` (painted art as text over palette cells, freezing drawn pictures into it, drawing it back with wind sway).
  - `character/`: `base.ts` (body, faces, hairstyles; reads `face-shapes.json`), `items.ts` (two item formats, validation, conversion), `shell.ts` (hair as one shape round the skull), `wear.ts` (condition ageing), `catalog.ts` (wardrobe items from `data/` via `import.meta.glob`, colour swaps), `character.ts` (model and saved roster), `parts.ts` (hand edits to wardrobe items, per catalogue id, laid over by `catalog.ts`), `data/` (the language model's unedited JSON: `sprite-*`, `recipe-*`, `shell-hair`).
  - `flora/`: `flora.ts` (plants grown by rule from part recipes), `flora-catalog.ts` (reads `data/plant-*.json`).
  - `animals/`, `objects/`: renderers and presets behind the animal and object editors.
  - `world/`: `terrain.ts` (height map: one whole level per metre tile, level 0 at the waterline; surfaces, cliffs, foam, walkability and plant placement all derive from heights), `island.ts`, and the runtime: `scene.ts` (saved scene format, validation of anything read back), `world.ts` (ground image, camera window, picking, collision), `actor.ts`, `herd.ts`, `ocean.ts`, `decor.ts`, `fish.ts` (fish wandering under the water), `crab.ts` (crabs on the beach and in the shallows), `weather.ts` (cloud, rain, wind, fog and storm amounts and their overlays), `props.ts` (the carried crate), `prop.ts` (props: one `PropKind` over flora, objects, decor and painted kinds; view maps, features, freezing and locks, kinds carried in scene files), `building/` (walls on cell edges and roofs on cells; `walls.ts` the wall catalogue and locks, `pieces/painted-wall.ts`), `path.ts` (A* for walking where the player taps), `daylight.ts` (time-of-day tints and fade to black over a composed picture). Spec: `docs/engine-spec.md`.
- `tools/<name>/` — the editor pages (`wardrobe`, `parts`, `animals`, `props`, `objects`, `flora`, `walls`, `scene`), each an `index.html` + `main.ts` (often `i18n.ts`, `style.css`). `tools/paint/` is the pixel editor the props, wall and parts editors share; `tools/objects/build-panel.ts` the object panels the props tool reuses; `walls-proto` is a dev-only test bench. `home/` is the start page loaded by the root `index.html`.
- `scripts/` — node scripts. `docs/specs/spec-*.md` are the format descriptions given to the model, written by `scripts/make-specs.mjs` from the real renderer; items in `engine/character/data/` belong to the current base body and must be regenerated if it changes.

## Games

Games live in their own repositories next to this one and import it through a Vite alias `@pixel` (`../pixel-art/pixel-art`): animal-hospital, pixel-island. Anything any game could use belongs here; game rules and content stay in the game.

## Conventions

- Pages are Vite entries listed in `vite.config.ts`; a new tool must be added there, to `shared/shell.ts` (`TOOLS`) and to the start page. Published URLs follow the folder: `/tools/<name>/`.
- `engine/character/face-shapes.json` is written by a dev-server-only endpoint in `vite.config.ts` (the wardrobe's shape editor); it can't save on the published site.
- UI text is English and German via per-tool `i18n.ts` (the props, walls, parts and object pages write both inline with `L(en, de)`); add both when adding strings. `tools/scene` also imports `plantName` from `tools/flora/i18n.ts`.
- Painted things are palette cells in a tone, never free colours (`engine/core/stamp.ts`). Freezing a catalogue prop or wall locks it on the device; games get the lock through scene files (`Scene.carried`) or `wallKind()`.
- User data (saved characters, scenes, props, walls, part edits) lives in browser storage and is exported/imported as JSON; anything read back must be validated (see `engine/world/scene.ts`).
- `docs/plan.md` and `docs/research.md` are history: they describe the removed 3D prototype and the `/lab/` comparison page, which are gone (git history only).
