import { defineConfig } from 'vite';
import { contentSave } from './dev/content-plugin.ts';

// Relative base so the built site works from any path (static hosting, file previews).
// `vite build` builds the published site (andreashackel.de/pixel-art/): the start page and the tools
// in `tools/`: wardrobe, parts editor, animal editor, props tool, object editor, flora tool, wall editor, particle editor and scene editor.
export default defineConfig({
  base: './',
  plugins: [contentSave({ dir: 'engine/character' })],
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
        particles: 'tools/particles/index.html',
        parts: 'tools/parts/index.html',
        icons: 'tools/icons/index.html',
        ui: 'tools/ui/index.html',
      },
    },
  },
});
