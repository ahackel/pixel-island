// Bakes everything the game needs to draw into texture atlases: every plant, rock and driftwood
// in its variants and wind frames, and a character in every facing and clip. This is the export
// step described in docs/export.md: the game itself never runs the rules, it draws quads.
//
// Usage: node scripts/bake.mjs [outDir=dist-bake] [pageSize=1024]
//
// Writes atlas-<n>.png pages and atlas.json:
//   frames:     name -> { page, x, y, w, h, pivot: [x, y] }   pivot = the pixel on the ground
//   animations: name -> { fps, frames: [frame names] }
//   anchors:    animal frame name -> { eye: [x, y, visible], ... }   from the pivot, for symptom overlays;
//               object frame name -> { bed: [x, y, visible], ... }  (the pivot is the middle of the footprint)
// Each frame is trimmed to what it paints. Identical frames are stored once (hard plants have no
// wind frames to speak of, mirrored character facings are not mirrored here: flip the quad).
// Ground shadows are separate frames ending in "/shadow", cast from the sun on flat ground as the
// engine casts them: draw them all into one shadow layer first, so overlapping shadows do not darken
// the ground twice.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { tryPlant, grow, drawPlant, FRAMES } from '../engine/flora/flora.ts';
import { sunShadow } from '../engine/world/island.ts';
import { drawCharacter, BUILDS, CHARACTER_ORIGIN, SPRITE_H, SPRITE_W } from '../engine/core/puppet.ts';
import { AUTHORED } from '../engine/core/poses.ts';
import { baseLook } from '../engine/character/base.ts';
import { ANIMAL_H, ANIMAL_ORIGIN, ANIMAL_W, CLIPS, CLIP_IDS, drawAnimal } from '../engine/animals/animal.ts';
import { PRESETS } from '../engine/animals/animal-presets.ts';
import { drawObject, framesOf, LOOP_RATE, OBJECT_H, OBJECT_ORIGIN, OBJECT_W } from '../engine/objects/object.ts';
import { OBJECT_PRESETS } from '../engine/objects/object-presets.ts';

const [outDir = 'dist-bake', pageArg = '1024'] = process.argv.slice(2);
const PAGE = Number(pageArg);
const VARIANTS = 4;
const BREEZE = 1;

/** A trimmed picture: RGBA bytes plus where the ground pivot is. */
function trim(w, h, pixel, pivot) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!pixel(x, y)) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return null;
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const rgba = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const hex = pixel(x + x0, y + y0);
    if (!hex) continue;
    const o = (y * tw + x) * 4;
    for (let k = 0; k < 3; k++) rgba[o + k] = parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16);
    rgba[o + 3] = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  }
  return { w: tw, h: th, rgba, pivot: [pivot.x - x0, pivot.y - y0] };
}

/** A picture's ground shadow, cast from the sun on flat ground, as a trimmed black mask with the same pivot. */
function shadowOf(picture, w, h, pivot) {
  const xy = sunShadow(picture, w, h, pivot);
  if (!xy.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < xy.length; k += 2) x0 = Math.min(x0, xy[k]), x1 = Math.max(x1, xy[k]), y0 = Math.min(y0, xy[k + 1]), y1 = Math.max(y1, xy[k + 1]);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const rgba = new Uint8Array(tw * th * 4);
  for (let k = 0; k < xy.length; k += 2) rgba[((xy[k + 1] - y0) * tw + xy[k] - x0) * 4 + 3] = 255;
  return { w: tw, h: th, rgba, pivot: [pivot.x - x0, pivot.y - y0] };
}

const frames = new Map(); // name -> picture or alias
const byContent = new Map(); // content key -> name
const animations = {};
function add(name, picture) {
  if (!picture) return null;
  const key = `${picture.w}x${picture.h}|${picture.pivot}|${Buffer.from(picture.rgba).toString('base64')}`;
  const same = byContent.get(key);
  if (same) {
    frames.set(name, { alias: same });
    return name;
  }
  byContent.set(key, name);
  frames.set(name, picture);
  return name;
}

// ---- plants, rocks, driftwood
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'engine', 'flora', 'data');
for (const file of fs.readdirSync(dir).filter((f) => /^plant-[\w-]+\.json$/.test(f)).sort()) {
  const set = file.slice(6, -5);
  JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).forEach((raw, index) => {
    const result = tryPlant(raw);
    if (!result.ok) return console.log('skipped', file, index, result.error);
    const id = `plant-${set}-${index}`;
    for (let seed = 0; seed < VARIANTS; seed++) {
      const grown = grow(result.compiled.plant, { seed });
      const list = [];
      for (let f = 0; f < FRAMES; f++) {
        const r = drawPlant(grown, { frame: f, wind: BREEZE });
        list.push(add(`${id}/${seed}/${f}`, trim(r.w, r.h, (x, y) => r.get(x, y), r.origin)));
        if (f === 0) add(`${id}/${seed}/shadow`, shadowOf(r, r.w, r.h, r.origin));
      }
      animations[`${id}/${seed}/wind`] = { fps: 6, frames: list };
    }
  });
}

// ---- a character: eight facings, every clip
const look = { ...baseLook('skinB', 'hairBrown'), build: BUILDS[1] };
for (const [clipId, clip] of Object.entries(AUTHORED)) {
  for (const facing of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const list = clip.frames.map((pose, i) => {
      const sprite = drawCharacter(look, pose, facing, { face: clip.faces?.[i], swing: clip.swing });
      const name = `character/${clipId}/${facing}/${i}`;
      return add(name, trim(SPRITE_W, SPRITE_H, (x, y) => sprite.get(x, y), CHARACTER_ORIGIN));
    });
    animations[`character/${clipId}/${facing}`] = { fps: clip.rate, frames: list };
  }
}
{
  const sprite = drawCharacter(look, AUTHORED.idle.frames[0], 0);
  add('character/shadow', shadowOf(sprite, SPRITE_W, SPRITE_H, CHARACTER_ORIGIN));
}

// ---- animals: every preset in every clip and facing, with the anchor points of each frame
const anchors = {};
for (const { id, animal } of PRESETS) {
  for (const clipId of CLIP_IDS) {
    for (const facing of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const list = [];
      for (let i = 0; i < CLIPS[clipId].frames; i++) {
        const drawn = drawAnimal(animal, clipId, i, facing);
        const name = `animal/${id}/${clipId}/${facing}/${i}`;
        list.push(add(name, trim(ANIMAL_W, ANIMAL_H, (x, y) => drawn.sprite.get(x, y), ANIMAL_ORIGIN)));
        anchors[name] = Object.fromEntries(Object.entries(drawn.anchors).map(([k, a]) => [k, [a.x - ANIMAL_ORIGIN.x, a.y - ANIMAL_ORIGIN.y, a.visible]]));
      }
      animations[`animal/${id}/${clipId}/${facing}`] = { fps: CLIPS[clipId].rate, frames: list };
    }
  }
  const { sprite } = drawAnimal(animal, 'idle', 0, 0);
  add(`animal/${id}/shadow`, shadowOf(sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN));
}

// ---- objects: every preset in every camera turn and frame, with its points per frame
for (const { id, prop } of OBJECT_PRESETS) {
  for (const turn of [0, 1, 2, 3]) {
    const list = [];
    for (let i = 0; i < framesOf(prop); i++) {
      const drawn = drawObject(prop, turn, i);
      const name = `object/${id}/${turn}/${i}`;
      list.push(add(name, trim(OBJECT_W, OBJECT_H, (x, y) => drawn.sprite.get(x, y), OBJECT_ORIGIN)));
      if (prop.points.length) anchors[name] = Object.fromEntries(Object.entries(drawn.points).map(([k, a]) => [k, [a.x - OBJECT_ORIGIN.x, a.y - OBJECT_ORIGIN.y, a.visible]]));
    }
    animations[`object/${id}/${turn}`] = { fps: LOOP_RATE, frames: list };
    const { sprite } = drawObject(prop, turn, 0);
    add(`object/${id}/${turn}/shadow`, shadowOf(sprite, OBJECT_W, OBJECT_H, OBJECT_ORIGIN));
  }
}

// ---- pack: tallest first onto shelves, 1 pixel apart
const unique = [...frames.entries()].filter(([, f]) => !f.alias).sort((a, b) => b[1].h - a[1].h || b[1].w - a[1].w);
const pages = [];
let page = null;
let shelf = { x: 0, y: 0, h: 0 };
const placed = {};
for (const [name, f] of unique) {
  if (f.w > PAGE || f.h > PAGE) throw new Error(`${name} does not fit a ${PAGE} page`);
  if (!page || shelf.x + f.w > PAGE) shelf = { x: 0, y: shelf.y + shelf.h + 1, h: 0 };
  if (!page || shelf.y + f.h > PAGE) {
    page = new PNG({ width: PAGE, height: PAGE });
    pages.push(page);
    shelf = { x: 0, y: 0, h: 0 };
  }
  for (let y = 0; y < f.h; y++) {
    const o = ((shelf.y + y) * PAGE + shelf.x) * 4;
    page.data.set(f.rgba.subarray(y * f.w * 4, (y + 1) * f.w * 4), o);
  }
  placed[name] = { page: pages.length - 1, x: shelf.x, y: shelf.y, w: f.w, h: f.h, pivot: f.pivot };
  shelf.x += f.w + 1;
  shelf.h = Math.max(shelf.h, f.h);
}
const out = {};
for (const [name, f] of frames) out[name] = f.alias ? placed[f.alias] : placed[name];

fs.mkdirSync(outDir, { recursive: true });
pages.forEach((p, i) => fs.writeFileSync(path.join(outDir, `atlas-${i}.png`), PNG.sync.write(p)));
fs.writeFileSync(path.join(outDir, 'atlas.json'), JSON.stringify({ pageSize: PAGE, pages: pages.length, frames: out, animations, anchors }));
const pixels = unique.reduce((n, [, f]) => n + f.w * f.h, 0);
console.log(`${frames.size} frames, ${unique.length} unique, ${pages.length} page(s) of ${PAGE}², ${Math.round((100 * pixels) / (pages.length * PAGE * PAGE))}% filled`);
