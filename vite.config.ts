import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * The wardrobe's shape editor saves the eye and mouth shapes through the dev server into
 * engine/character/face-shapes.json, so they are part of the project. Only while developing; the published
 * site has no such endpoint and the editor there cannot save. The editor already shows what it
 * saved, so its own saves do not reload the page; an edit to the file by hand still does.
 */
function faceShapes(): Plugin {
  const file = fileURLToPath(new URL('./engine/character/face-shapes.json', import.meta.url));
  const rows = (v: unknown) => Array.isArray(v) && v.length <= 8 && v.every((r) => typeof r === 'string' && r.length <= 12 && /^[.ICTM%e]*$/.test(r));
  const valid = (data: any) =>
    data && typeof data === 'object' && ['eyes', 'mouths', 'brows'].every((k) => data[k] && typeof data[k] === 'object') &&
    Object.values(data.eyes).every((view: any) => Object.values(view).every((shape: any) => Object.values(shape).every(rows))) &&
    Object.values(data.mouths).every((view: any) => Object.values(view).every(rows)) &&
    Object.values(data.brows).every((view: any) => Object.values(view).every((style: any) => Object.values(style).every(rows)));
  let written = '';
  return {
    name: 'face-shapes',
    handleHotUpdate({ file: changed, read }) {
      if (changed !== file) return;
      return read().then((text) => (text === written ? [] : undefined));
    },
    configureServer(server) {
      server.middlewares.use('/__face-shapes', (req, res) => {
        if (req.method !== 'POST') return void (res.statusCode = 405, res.end());
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (!valid(data)) throw new Error('not face shapes');
            written = JSON.stringify(data, null, 1) + '\n';
            writeFileSync(file, written);
            res.end('ok');
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        });
      });
    },
  };
}

// Relative base so the built site works from any path (static hosting, file previews).
// `vite build` builds the published site (andreashackel.de/pixel-art/): the start page and the tools
// in `tools/`: wardrobe, parts editor, animal editor, props tool, object editor, flora tool, wall editor and scene editor.
export default defineConfig({
  base: './',
  plugins: [faceShapes()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: 'index.html',
        wardrobe: 'tools/wardrobe/index.html',
        animals: 'tools/animals/index.html',
        objects: 'tools/objects/index.html',
        flora: 'tools/flora/index.html',
        scene: 'tools/scene/index.html',
        props: 'tools/props/index.html',
        walls: 'tools/walls/index.html',
        parts: 'tools/parts/index.html',
      },
    },
  },
});
