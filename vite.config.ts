// The pixel-art engine is imported from the ./engine git subtree by the alias `@pixel`
// (a vendored copy at a pinned version; see README, Engine).
import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
const PIXEL = path.resolve(here, 'engine');

export default defineConfig({
  base: './',
  resolve: { alias: { '@pixel': PIXEL } },
  server: { port: 8330, strictPort: true, fs: { allow: [here, PIXEL] }, headers: { 'Cache-Control': 'no-store' } },
  preview: { port: 8331 },
});
