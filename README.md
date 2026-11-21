# Pixel Island

A shipwreck survivor on a tiny island, built on the [pixel-engine](https://github.com/ahackel/pixel-engine). Design: [DESIGN.md](DESIGN.md).

The engine is vendored in `engine/` as a git subtree of pixel-engine, imported through the alias `@pixel` (Vite and `tsconfig.json`). `.engine-version` says which engine tag was pulled last, so this game's `main` always builds and the engine moves only when you pull. Anything any game could use goes into pixel-engine; this repo holds only the game's rules and content.

```bash
git clone https://github.com/ahackel/pixel-island.git
npm install
```

### Engine

To take a newer engine: `git subtree pull --prefix=engine https://github.com/ahackel/pixel-engine.git <tag> --squash`, build, test, and write the tag into `.engine-version`. Engine files can be edited here like any others; they stay local patches on top of the pulled version until they are promoted to pixel-engine.

```bash
npm run dev
```

Open http://localhost:8330. `npm test` runs the clock and needs tests, `npm run build` type-checks and builds into `dist/`.

The story is a chain of quests in `src/content/quests.json`, edited by hand: each has a goal, and can bring weather, wash-ups, stones or lightning when it starts. Texts are in `src/content/loca.json` by id; `npm test` checks both.

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?quest=5` plays a new game from the fifth quest, with what the quests before it brought, and never saves (the real save stays), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, finish the quest, clock ×10). `?island=2` plays the first try at the rocky island: a rock hill with a cave mouth, a dark cave to walk into, and a lantern in the bag; it never saves. `?cave` starts there straight inside the cave, lantern in hand, with no menu or intro; with `?cheats`, the CAVE button goes in and out. Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the page, input and the game loop.
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/island.ts` — the first island, the same every time from a seed, and the sea bed shelving away round it.
- `src/save.ts` — the saved game, written on waking and checked when read back.
- `src/ui.ts` — the interface as pixel art (HUD, buttons, bag slots), on the engine's `shared/pixel-font.ts` and `shared/pixel-ui.ts`.
- `src/i18n.ts` — `t(id)`: English and German text from `src/content/loca.json`, by id.
- `src/quests.ts` — the quests from `src/content/quests.json`, how they advance, and the content checks (tested in `quests.test.ts`).
- `src/weather.ts` — the weather: set when a quest starts (its own, else a fair one) and the same every day until the next quest begins.
- `src/shark.ts` — the sharks in the deep water and the fin that shows of them.

## Publishing

`.github/workflows/pages.yml` builds the game with GitHub Pages on every push to `main`, with the vendored engine/. It appears at `andreashackel.de/pixel-island/`. 
