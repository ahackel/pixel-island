// The pixel-art engine is imported from the sibling folder by the alias `@pixel`
// (one source of truth: ../pixel-art/pixel-art must exist), as in animal-hospital.
import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
const PIXEL = path.resolve(here, '../pixel-art/pixel-art');

export default defineConfig({
  base: './',
  resolve: { alias: { '@pixel': PIXEL } },
  server: { port: 8330, strictPort: true, fs: { allow: [here, PIXEL] }, headers: { 'Cache-Control': 'no-store' } },
  preview: { port: 8331 },
});
