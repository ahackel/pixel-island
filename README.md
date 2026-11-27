# Pixel Island

A shipwreck survivor on a tiny island, built on the [pixel-engine](https://github.com/ahackel/pixel-engine). Design: [DESIGN.md](DESIGN.md).

The engine is vendored in `engine/` as a git subtree of pixel-engine, imported through the alias `@pixel` (Vite and `tsconfig.json`). `.engine-version` says which engine tag was pulled last, so this game's `main` always builds and the engine moves only when you pull. Anything any game could use goes into pixel-engine; this repo holds only the game's rules and content.

```bash
git clone https://github.com/ahackel/pixel-island.git
npm install
```

### Engine

To take a newer engine: `git subtree pull --prefix=engine https://github.com/ahackel/pixel-engine.git <tag> --squash`, build, test, and write the tag into `.engine-version`. The skills `/engine-upgrade` and `/engine-promote` (in `.claude/skills/`) do this with checks. Engine files can be edited here like any others; they stay local patches on top of the pulled version until they are promoted to pixel-engine.

```bash
npm run dev
```

Open http://localhost:8330. The same server also serves the engine's editors at `/engine/tools/*`: F2 (or the EDITOR cheat) jumps from the game to the scene editor, and F2 in any editor jumps back. What an editor saves with "Save to project" is written into `src/content/` (stores such as walls, props, parts and flora under `src/content/store/`) to commit; the game reads them when the browser has no edits of its own. The editors exist only on the dev server; the published build has none of them. `npm test` runs the game's tests (`src/*.test.ts`: clock, crafts, shore, quests and their texts, and that every saved scene reads back) and the engine's (`engine/tests/`); `npm run build` checks the engine boundary, type-checks and builds into `dist/`. `.github/workflows/check.yml` runs both on every push and pull request.

Fires and lights carry particle systems (sparks and their glow halo, the lantern's light) by id: they are edited in the engine's particle editor (`/engine/tools/particles/`) and saved to `src/content/store/pixel-particles.json`.

The story is a chain of quests in `src/content/quests.json`, edited by hand: each has a goal, and can bring weather, wash-ups, stones or lightning when it starts. Texts are in `src/content/loca.json` by id; `npm test` checks both.

Scenes saved from the scene editor ("Save to project") are files in `src/content/scenes/<name>.json`. The game uses `island.json` there as its island instead of the one made from the seed, and `smuggler-cave.json` as the rocky island's cave; `?scene=<name>` plays any saved scene as the island (never saves). An older saved game of a different island is ignored.

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?quest=5` plays a new game from the fifth quest, with what the quests before it brought, and never saves (the real save stays), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, finish the quest, clock ×10). `?island=2` plays the first try at the rocky island: a rock hill with a cave mouth, a dark cave to walk into, and a lantern in the bag; it never saves. `?cave` starts there straight inside the cave, lantern in hand, with no menu or intro; with `?cheats`, the CAVE button goes in and out. Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the page, input and the game loop.
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/island.ts` — the islands: the saved scenes in `src/content/scenes/` (a scene that fails the checks stops the game rather than being replaced; `scenes.test.ts` reads them all), else made from a seed, and the sea bed shelving away round them.
- `src/save.ts` — the saved game, written on waking and checked when read back; it remembers its island's fingerprint, so an edited island starts a new game.
- `src/crafts.ts` — the bag's items, what can be tied together, and the hut and raft built in stages, as plain data and rules (tested in `crafts.test.ts`).
- `src/rows.ts`, `src/things.ts`, `src/fire.ts`, `src/fishing.ts` — the game's small hand-drawn pictures (rows of letters): the week's new things and the hut, fire and the burnt stump, the spear, fish and crabs.
- `src/shore.ts` — what the island gives (coconuts, wood, stones, wash-ups) and where the hut and raft can be built, as plain rules (tested in `shore.test.ts`).
- `src/ui.ts` — the interface as pixel art (HUD, buttons, bag slots), on the engine's `shared/pixel-font.ts` and `shared/pixel-ui.ts`.
- `src/i18n.ts` — `t(id)`: English and German text from `src/content/loca.json`, by id.
- `src/quests.ts` — the quests from `src/content/quests.json`, how they advance, and the content checks (tested in `quests.test.ts`).
- `src/weather.ts` — the weather: set when a quest starts (its own, else a fair one) and the same every day until the next quest begins.
- `src/shark.ts` — the sharks in the deep water and the fin that shows of them.

## Publishing

`.github/workflows/pages.yml` builds the game with GitHub Pages on every push to `main`, with the vendored engine/. It appears at `andreashackel.de/pixel-island/`. 
