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

Debug URL options: `?speed=30` runs the game clock 30 times faster, `?new` starts a new game (not saved until the first sleep), `?cheats` shows a row of orange cheat buttons (fill needs, hungry, tired, fill the bag, jump to sunset or night, next morning, clock ×10). Options combine: `?cheats&speed=5`.

## Layout

- `src/main.ts` — the page, input and the game loop.
- `src/clock.ts` — day phases and survival needs as plain numbers (tested in `clock.test.ts`).
- `src/island.ts` — the first island, the same every time from a seed.
- `src/save.ts` — the saved game, written on waking and checked when read back.
- `src/ui.ts` — the interface as pixel art (HUD, buttons, bag slots), on the engine's `shared/pixel-font.ts` and `shared/pixel-ui.ts`.
- `src/i18n.ts` — English and German text.
