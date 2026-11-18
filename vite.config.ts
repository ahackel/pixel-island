// The pixel-art engine is imported from the sibling folder by the alias `@pixel`
// (one source of truth: ../pixel-art/pixel-art must exist), as in animal-hospital.
import { defineConfig, type Plugin } from 'vite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkContent } from './src/days.ts';

const here = import.meta.dirname;
const PIXEL = path.resolve(here, '../pixel-art/pixel-art');

/**
 * The day editor (editor/) saves through this: POST /__content with { days, loca } writes
 * src/content/days.json and loca.json. Only while developing; the built game has no editor.
 */
function content(): Plugin {
  const file = (name: string) => path.join(here, 'src/content', name);
  return {
    name: 'content',
    configureServer(server) {
      server.middlewares.use('/__content', (req, res) => {
        if (req.method !== 'POST') return void ((res.statusCode = 405), res.end());
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { days, loca } = JSON.parse(body);
            const problems = checkContent(days, loca);
            if (problems.length) throw new Error(problems.join('\n'));
            writeFileSync(file('loca.json'), JSON.stringify(loca, null, 1) + '\n');
            writeFileSync(file('days.json'), JSON.stringify(days, null, 1) + '\n');
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

export default defineConfig({
  base: './',
  plugins: [content()],
  resolve: { alias: { '@pixel': PIXEL } },
  server: { port: 8330, strictPort: true, fs: { allow: [here, PIXEL] }, headers: { 'Cache-Control': 'no-store' } },
  preview: { port: 8331 },
});
