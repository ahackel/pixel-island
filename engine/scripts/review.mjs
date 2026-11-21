// Review sheet of real wardrobe characters: each in all eight facings standing, then walking side
// on, in 3/4 and face on. Loads the code through Vite, because the catalogue reads its item files
// with import.meta.glob. Usage: node scripts/review.mjs <out.png> [scale]
import { createServer } from 'vite';
import { writeSheet } from './sheet.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (path) => server.ssrLoadModule(root + path);
const { lookOf, defaultState } = await load('engine/character/character.ts');
const { drawCharacter, FACING_RING } = await load('engine/core/puppet.ts');
const { AUTHORED, STAND } = await load('engine/core/poses.ts');

// Characters as the wardrobe would save them: changes to the default survivor.
const CHARACTERS = [
  {},
  { state: { frame: 'f', skin: 'skinC', hair: 'recipe-hair-loose-0', hairColor: 'hairBlack' }, worn: { hat: 'sprite-cap-0', tool: null, top: 'sprite-dresses-0', bottom: null } },
  { state: { build: 'sturdy', skin: 'skinA', hair: 'recipe-hair-tied-0', hairColor: 'hairRed' }, worn: { hat: 'recipe-everyday-hats-0', tool: 'sprite-axe-0', beard: 'base-beard-short' } },
];
// The body window and a margin, so swung tools still show.
const CELL = { w: 40, h: 56 };
const crop = (sprite) => ({ get: (x, y) => sprite.get(x + 12, y + 4) });

const rows = [];
for (const change of CHARACTERS) {
  const state = defaultState();
  Object.assign(state, change.state ?? {});
  Object.assign(state.worn, change.worn ?? {});
  const look = lookOf(state);
  rows.push(FACING_RING.map((f) => crop(drawCharacter(look, STAND, f))));
  for (const f of [7, 0, 4]) rows.push(AUTHORED.walk.frames.map((pose) => crop(drawCharacter(look, pose, f))));
}
writeSheet(process.argv[2], rows, Number(process.argv[3] ?? 4), undefined, CELL);
await server.close();
