import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createServer } from 'vite';

// The scenes saved from the scene editor are what the game plays: each must pass the engine's checks as the game reads
// it. A scene that fails them would make the game play another island (and lose every saved game) or not start. The
// scene code reads its catalogues with import.meta.glob, so it is loaded through Vite as the game loads it.
test('every saved scene is read back whole, as the game reads it', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { savedScene, firstIsland, rockyIsland, caveScene } = await vite.ssrLoadModule('/src/island.ts');
    const names = readdirSync(new URL('./content/scenes/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    assert.ok(names.includes('island'), 'island.json is the island the game plays');
    for (const name of names) assert.ok(savedScene(name), `${name}.json is not a valid scene`);
    assert.ok(firstIsland() && rockyIsland().scene && caveScene().scene);
  } finally {
    await vite.close();
  }
});
