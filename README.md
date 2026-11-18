# Pixel Island

A shipwreck survivor on a tiny island, built on the [pixel-art](../pixel-art/pixel-art) engine. Design: [DESIGN.md](DESIGN.md).

The engine is imported from the sibling folder `../pixel-art/pixel-art` through the alias `@pixel` (Vite and `tsconfig.json`), so engine edits show up here on reload. Anything any game could use goes into pixel-art; this repo holds only the game's rules and content.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:8330. `npm test` runs the clock and needs tests, `npm run build` type-checks and builds into `dist/`.

Day editor: http://localhost:8330/editor/ sets what happens on each day (weather, wash-ups, coconuts, driftwood, the morning thought, timed thoughts, wash-ups and lightning) and edits every text of the game by id. Save writes `src/content/days.json` and `src/content/loca.json` through the dev server; it is not part of the built game. **Play this day** opens `?day=N`.

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?day=5` plays a new game from day 5 and never saves (the real save stays), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, clock ×10). Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the page, input and the game loop.
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/island.ts` — the first island, the same every time from a seed.
- `src/save.ts` — the saved game, written on waking and checked when read back.
- `src/ui.ts` — the interface as pixel art (HUD, buttons, bag slots), on the engine's `shared/pixel-font.ts` and `shared/pixel-ui.ts`.
- `src/i18n.ts` — `t(id)`: English and German text from `src/content/loca.json`, by id.
- `src/days.ts` — the day plans from `src/content/days.json` and the checks the editor and the save endpoint run (tested in `days.test.ts`).
- `src/editor/`, `editor/index.html` — the day editor; `vite.config.ts` has its save endpoint.

## Publishing

`.github/workflows/pages.yml` builds the game with GitHub Pages on every push to `main`, checking out pixel-art beside it. It appears at `andreashackel.de/pixel-island/`. A change to the engine alone does not republish the game: run the workflow by hand (Actions → Publish game → Run workflow).
