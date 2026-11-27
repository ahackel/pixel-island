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

Each island has its own story in `src/content/islands/<island>/`: `quests.json`, edited by hand, and its own texts (`loca.json`) and rules if it has any (`src/islands.ts` bundles them; a game says which island's story it is on, `Game.story`). A story is a chain of quests: each waits for a goal (any name that the game or an interaction rule reports, among them `got:<item>`, `ate:<item>` and `made:<item>`), and its `start` is a list of effects done as it starts: its weather, what the sea washes up (`{ "washUp": { "items": [...], "near": 6 } }` leaves it within 6 metres of the survivor, for an island too big to leave things anywhere), stones (likewise `{ "stones": { "n": 2, "near": 8 } }`), lightning. Texts are in `src/content/loca.json` by id (and each island's own); `npm test` checks all of it. What a hand does to a thing (the crate, a palm, the burning stump, driftwood) is in `src/content/interactions.json` the same way.

Scenes saved from the scene editor ("Save to project") are files in `src/content/scenes/<name>.json`. The game uses `island.json` there as its island instead of the one made from the seed, and `smuggler-cave.json` as the rocky island's cave; `?scene=<name>` plays any saved scene as the island (never saves). An older saved game of a different island is ignored.

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?quest=5` plays a new game from the fifth quest, with what the quests before it brought, and never saves (the real save stays), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, finish the quest, clock ×10). `?island=2` plays the first try at the rocky island, with its own quests (the pot washes up in the bay, then cook a first meal): a rock hill with a cave mouth, a dark cave to walk into, and a lantern in the bag; it never saves. `?cave` starts there straight inside the cave, lantern in hand, with no menu or intro; with `?cheats`, the CAVE button goes in and out. Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the game's state and how it is played: input, picking things up, sleeping and the morning, going between scenes, the cheats; its frame runs in named steps (`live`, `walk`, `stir`, `skyNow`, `sceneThings`, `draw`, `showPage`). It wires the modules below together.
- `src/options.ts` — the debug options in the address, below (tested in `options.test.ts`).
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/sky.ts` — the time of day's tint, nightfall, and how the weather is seen and lights the world (tested in `sky.test.ts`).
- `src/weather.ts` — the weather: set when a quest starts (its own, else a fair one) and the same every day until the next quest begins.
- `src/effects.ts` — the one vocabulary of what content does: a thought, a goal reached, a thing into the bag or out of it (by item or group), a named handler, a bag-room check, the weather, wash-ups, stones, a lightning strike. An interaction rule and a quest's start are both lists of these effects, done in order; what each does to the game is `doer()` in `main.ts`, and what a list may say is checked here (`effects.test.ts`).
- `src/interactions.ts` — what a hand does to a thing in the world (a stone on the crate, the axe on a palm, a stick on the burning stump, a torch on driftwood, the pot on a lit campfire): rules in `src/content/interactions.json`, tried in order, the first that fits wins, each a list of effects (`effects.ts`). `npm test` checks every rule's texts, goals, items and handlers, and rules that can never be reached (`interactions.test.ts`).
- `src/islands.ts` — each island's story as a bundle: its quests, its own interaction rules (before the shared ones, so it can override) and its texts; `bundleOf`/`questsOf` find them by a game's `story`. The first island is the demo's week, the rocky island (`?island=2`, `?cave`) has its first two quests so far (the pot washes up, cook fish soup); the rest of Island 2 is a draft in `src/content/drafts/island2/`, checked by `island2-draft.test.ts` (`islands.test.ts` checks the bundles).
- `src/quests.ts` — the quest rules (the quests themselves are in the bundles), how they advance, and the content checks, which also see that every goal a quest waits for is reported by the game's code or an interaction rule (tested in `quests.test.ts`).
- `src/crafts.ts` — the bag's items (`src/content/items.json`: which are loose on the ground, which are food and what each fills, which are fish) and what can be tied together (`src/content/recipes.json`), both checked by the tests; also which slots a drag lights, and the hut and raft built in stages, as plain data and rules (tested in `crafts.test.ts`, which also checks every bag item has its text).
- `src/shore.ts` — what the island gives (coconuts, wood, stones, wash-ups), where the hut and raft can be built, and where the survivor washes up and which way they lie (tested in `shore.test.ts`).
- `src/camp.ts` — sleeping (blanket, the hut's shelter, rain, the fire quest, storms), what burns and frightens animals, the lightning's palm, when the raft sails (tested in `camp.test.ts`).
- `src/places.ts` — chests and doors as the save keeps them: what a chest still holds, a door's state by scene and edge, unlocking (tested in `places.test.ts`).
- `src/throw.ts` — where a thing thrown from the bag lands and its arc (tested in `throw.test.ts`).
- `src/island.ts` — the islands: the saved scenes in `src/content/scenes/` (a scene that fails the checks stops the game rather than being replaced; `scenes.test.ts` reads them all), else made from a seed, and the sea bed shelving away round them.
- `src/save.ts` — the saved game, written on waking and checked when read back; it remembers its island's fingerprint, so an edited island starts a new game.
- `src/shark.ts` — the sharks in the deep water and the fin that shows of them.
- `src/bag-ui.ts`, `src/talk.ts`, `src/menu.ts` — the page's parts, on the engine's pixel UI (`shared/game-ui.ts`): the bag's slots (tap to eat or hold, drag to tie or put down), the thought bubble and story box, the menu and settings.
- `src/pictures.ts`, `src/rows.ts`, `src/things.ts`, `src/fire.ts`, `src/fishing.ts` — the game's small hand-drawn pictures (rows of letters): the bag's things in their slots and on the ground, the quests' pictures, the week's new things and the hut, fire and the burnt stump, the spear, fish and crabs.
- `src/i18n.ts` — `t(id)`: English and German text from `src/content/loca.json`, by id.

Tests are `node:test` files beside what they test; `npm test` runs them with `scripts/pixel-alias.mjs`, which resolves the `@pixel` alias, so a module that imports the engine can be tested as long as it touches no page and no `import.meta.glob` when loaded.

## Publishing

`.github/workflows/pages.yml` builds the game with GitHub Pages on every push to `main`, with the vendored engine/. It appears at `andreashackel.de/pixel-island/`. 
