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

The story is a chain of quests in `src/content/quests.json`, edited by hand: each has a goal, and can bring weather, wash-ups, stones or lightning when it starts. Texts are in `src/content/loca.json` by id; `npm test` checks both.

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?quest=5` plays a new game from the fifth quest, with what the quests before it brought, and never saves (the real save stays), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, finish the quest, clock ×10). Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the page, input and the game loop.
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/island.ts` — the first island, the same every time from a seed.
- `src/save.ts` — the saved game, written on waking and checked when read back.
- `src/ui.ts` — the interface as pixel art (HUD, buttons, bag slots), on the engine's `shared/pixel-font.ts` and `shared/pixel-ui.ts`.
- `src/i18n.ts` — `t(id)`: English and German text from `src/content/loca.json`, by id.
- `src/quests.ts` — the quests from `src/content/quests.json`, how they advance, and the content checks (tested in `quests.test.ts`).
- `src/weather.ts` — each day's weather: the quest's own, else a fair one.

## Publishing

`.github/workflows/pages.yml` builds the game with GitHub Pages on every push to `main`, checking out pixel-art beside it. It appears at `andreashackel.de/pixel-island/`. A change to the engine alone does not republish the game: run the workflow by hand (Actions → Publish game → Run workflow).
