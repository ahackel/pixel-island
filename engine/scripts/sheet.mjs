// Renders sprite sheets to PNG for inspection. Usage: node scripts/sheet.mjs <out.png> [scale]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { drawCharacter, SPRITE_W, SPRITE_H } from '../engine/core/puppet.ts';
// Sheets show the whole drawing canvas, margins included, so swung tools are visible.
import { AUTHORED } from '../engine/core/poses.ts';
import { baseLook } from '../engine/character/base.ts';

/**
 * Writes rows of pictures as one PNG. `cell` is the size of one picture, a character sprite by
 * default; `pixelOf` reads a picture's colour at a pixel, for pictures that keep more than `get` gives.
 */
export function writeSheet(file, rows, scale = 6, background = [233, 217, 160], cell = { w: SPRITE_W, h: SPRITE_H }, pixelOf = (sprite, x, y) => sprite.get(x, y)) {
  const cols = Math.max(...rows.map((r) => r.length));
  const gap = 2;
  const cw = cell.w + gap;
  const ch = cell.h + gap;
  const png = new PNG({ width: cols * cw * scale, height: rows.length * ch * scale });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = background[0]; png.data[i + 1] = background[1]; png.data[i + 2] = background[2]; png.data[i + 3] = 255;
  }
  rows.forEach((row, r) => row.forEach((sprite, c) => {
    if (!sprite) return;
    for (let y = 0; y < (sprite.h ?? cell.h); y++) for (let x = 0; x < (sprite.w ?? cell.w); x++) {
      const hex = pixelOf(sprite, x, y);
      if (!hex) continue;
      const rgb = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
      const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const o = (((r * ch + y) * scale + sy) * png.width + (c * cw + x) * scale + sx) * 4;
        for (let k = 0; k < 3; k++) png.data[o + k] = Math.round(rgb[k] * alpha + png.data[o + k] * (1 - alpha));
      }
    }
  }));
  fs.writeFileSync(file, PNG.sync.write(png));
}

if (process.argv[1].endsWith('sheet.mjs')) {
  const look = baseLook();
  const frames = [...AUTHORED.idle.frames, ...AUTHORED.walk.frames, ...AUTHORED.wave.frames];
  const rows = [0, 1, 2, 3].map((facing) => frames.map((pose) => drawCharacter(look, pose, facing)));
  writeSheet(process.argv[2], rows, Number(process.argv[3] ?? 6));
}
