// The face shape editor: a small pixel editor over the face, for the eyes, brows and mouths every
// character uses (engine/character/face-shapes.json). It edits what the preview shows: its mood, and its eyes
// looking aside or not. Changes show at once, and every finished stroke is saved into the project
// through the dev server, which only exists while developing.
import { browState, BROWS, EYE_SHAPES, eyeState, FACE_REGIONS, FACE_SHAPES, faceRows, headRows, type FaceOptions, type FaceView, type Mood } from '../../engine/character/base.ts';
import { download, pickFile } from '../../shared/files.ts';
import { saveToProject } from '../../shared/project.ts';
import { PALETTE, type PaletteKey } from '../../engine/core/palette.ts';
import { h, row, segmented, type IconName } from '../../shared/shell.ts';
import { choice, pixelButton } from '../../ui/components.ts';
import { t, type Key } from './i18n.ts';

export interface ShapeContext {
  face: FaceOptions;
  skin: PaletteKey;
  hair: PaletteKey;
  /** The preview's mood and whether its eyes look aside: the shapes being edited. */
  mood: Mood;
  aside: boolean;
  /** A pixel changed: redraw the preview. */
  live: () => void;
  /** A stroke ended: rebuild the pictures. */
  done: () => void;
  /** The view the preview shows, which is the one edited, and whether it faces left: the editor is then mirrored too. */
  view: FaceView;
  mirror: boolean;
}

// What is being edited stays picked while the panel is rebuilt.
let feature: 'eyes' | 'brows' | 'mouths' = 'eyes';
let eyeShape: (typeof EYE_SHAPES)[number] | null = null;
let browStyle: (typeof BROWS)[number] | null = null;
/** Blinking is no mood, so the editor has its own switch for the shut eyes. */
let blink = false;
let ink = 'I';
let status = '';
/** The status line on show; the panel is rebuilt after every stroke, so it is looked up each time. */
let statusNode: HTMLElement | null = null;
let saving: Promise<void> = Promise.resolve();

const tell = (text: string) => {
  status = text;
  if (statusNode) statusNode.textContent = text;
};

/** Saves the shapes into the project (face-shapes.json in the game's content), one save after another. */
function save(): void {
  if (!import.meta.env.DEV) return tell(t('shapes.devOnly'));
  tell(t('shapes.saving'));
  saving = saving.then(async () => {
    tell(t((await saveToProject('face-shapes.json', FACE_SHAPES)) ? 'shapes.saved' : 'shapes.failed'));
  });
}

/** The letters a shape can hold; '.' leaves the skin. */
const INKS = ['I', 'C', 'T', 'M', 'e', '%', '.'] as const;

/** Whether an imported file has every shape the editor knows, each the same size and only in known letters. */
function sameShape(known: unknown, given: unknown): boolean {
  if (Array.isArray(known)) {
    return Array.isArray(given) && given.length === known.length &&
      given.every((line, i) => typeof line === 'string' && line.length === known[i].length && [...line].every((ch) => (INKS as readonly string[]).includes(ch)));
  }
  if (!known || typeof known !== 'object') return true;
  return !!given && typeof given === 'object' && Object.entries(known).every(([key, value]) => sameShape(value, (given as Record<string, unknown>)[key]));
}

/** Reads shapes from a file the user picks; they replace the current ones and are saved. */
async function importShapes(done: () => void): Promise<void> {
  try {
    const data = JSON.parse(await pickFile());
    if (!sameShape(FACE_SHAPES, data)) throw new Error('not face shapes');
    for (const key of ['eyes', 'mouths', 'brows'] as const) FACE_SHAPES[key] = data[key];
  } catch {
    return tell(t('shapes.badFile'));
  }
  save();
  done();
}

// The part of the head grid shown: brows to chin, ear to nose.
const CROP = { x: 2, y: 8, w: 19, h: 14 };
const CELL = 16;

export function shapeEditor(ctx: ShapeContext): HTMLElement {
  eyeShape ??= ctx.face.eyes;
  browStyle ??= ctx.face.brows;
  const mood = ctx.mood;
  const view = ctx.view;
  const shapes = () =>
    feature === 'eyes' ? FACE_SHAPES.eyes[view][eyeShape!][eyeState(mood, blink, ctx.aside)]
    : feature === 'brows' ? FACE_SHAPES.brows[view][browStyle!][browState(mood)]
    : FACE_SHAPES.mouths[view][mood];
  const region = () => FACE_REGIONS[feature][view];
  const canvas = h('canvas', { class: 'shapes__canvas', width: String(CROP.w * CELL), height: String(CROP.h * CELL) });
  const g = canvas.getContext('2d')!;
  if (ctx.mirror) canvas.style.transform = 'scaleX(-1)';

  const colour = (ch: string): string | null => {
    const tone = (key: PaletteKey, shade = false) => PALETTE[key][shade ? 'shade' : 'base'];
    switch (ch) {
      case '#': return tone(ctx.skin);
      case '%': return tone(ctx.skin, true);
      case '+': return PALETTE[ctx.skin].light;
      case 'I': return tone('ink');
      case 'C': return tone(ctx.face.eyeColor ?? 'ink');
      case 'T': return tone('tooth');
      case 'M': return tone('mouth');
      case 'B': return tone('blush');
      case 'e': return tone(ctx.hair, true);
      case 'G': return tone(ctx.face.glassesColor ?? 'black');
      default: return null;
    }
  };

  const draw = () => {
    const head = headRows(view, ctx.face.shape);
    const face = faceRows({ ...ctx.face, eyes: eyeShape!, brows: browStyle! }, mood, blink, ctx.aside, view);
    const [rx, ry, rw, rh] = region();
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CROP.h; y++) {
      for (let x = 0; x < CROP.w; x++) {
        const hx = x + CROP.x, hy = y + CROP.y;
        const fill = colour(face[hy]?.[hx] ?? '.') ?? colour(head[hy]?.[hx] ?? '.');
        if (!fill) continue;
        g.fillStyle = fill;
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    // Cells the shape leaves empty show the skin through a checker, so they read as transparent.
    const rows = shapes();
    const half = CELL / 2;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if ((rows[y]?.[x] ?? '.') !== '.') continue;
        const [cx, cy] = [(rx - CROP.x + x) * CELL, (ry - CROP.y + y) * CELL];
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(cx, cy, half, half);
        g.fillRect(cx + half, cy + half, half, half);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(cx + half, cy, half, half);
        g.fillRect(cx, cy + half, half, half);
      }
    }
    // Outside the frame is darkened, for context only.
    g.fillStyle = 'rgba(20, 24, 32, 0.45)';
    const [fx, fy, fw, fh] = [(rx - CROP.x) * CELL, (ry - CROP.y) * CELL, rw * CELL, rh * CELL];
    g.fillRect(0, 0, canvas.width, fy);
    g.fillRect(0, fy + fh, canvas.width, canvas.height - fy - fh);
    g.fillRect(0, fy, fx, fh);
    g.fillRect(fx + fw, fy, canvas.width - fx - fw, fh);
    // A grid over the editable cells and a frame round them.
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let i = 0; i <= rw; i++) g.strokeRect((rx - CROP.x + i) * CELL + 0.5, (ry - CROP.y) * CELL + 0.5, 0, rh * CELL);
    for (let j = 0; j <= rh; j++) g.strokeRect((rx - CROP.x) * CELL + 0.5, (ry - CROP.y + j) * CELL + 0.5, rw * CELL, 0);
    g.strokeStyle = '#e8487a';
    g.lineWidth = 2;
    g.strokeRect((rx - CROP.x) * CELL, (ry - CROP.y) * CELL, rw * CELL, rh * CELL);
  };

  // Painting: press and drag; the right button rubs out.
  let painting: string | null = null;
  let changed = false;
  const paintAt = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    const across = Math.floor(((e.clientX - box.left) / box.width) * CROP.w);
    const x = (ctx.mirror ? CROP.w - 1 - across : across) + CROP.x;
    const y = Math.floor(((e.clientY - box.top) / box.height) * CROP.h) + CROP.y;
    const [rx, ry, rw, rh] = region();
    if (painting === null || x < rx || x >= rx + rw || y < ry || y >= ry + rh) return;
    const rows = shapes();
    const line = rows[y - ry];
    if (line[x - rx] === painting) return;
    rows[y - ry] = line.slice(0, x - rx) + painting + line.slice(x - rx + 1);
    changed = true;
    draw();
    ctx.live();
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    painting = e.button === 2 ? '.' : ink;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e);
  });
  canvas.addEventListener('pointermove', paintAt);
  const end = () => {
    if (painting === null) return;
    painting = null;
    // A stroke that changed something is saved as soon as it ends.
    if (changed) save();
    changed = false;
    ctx.done();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const statusEl = (statusNode = h('span', { class: 'shapes__status', role: 'status' }, status));

  const rebuild = () => ctx.done();
  const picker = feature === 'brows'
    ? [row(t('brows'), segmented(t('brows'), BROWS.map((id) => ({ id, label: t(`brows.${id}` as Key), icon: `brow.${id}` as IconName })), browStyle!, (id) => {
        browStyle = id;
        rebuild();
      }))]
    : feature === 'eyes'
    ? [
        row(t('eyes'), segmented(t('eyes'), EYE_SHAPES.map((id) => ({ id, label: t(`eyes.${id}` as Key), icon: `eye.${id}` as IconName })), eyeShape!, (id) => {
          eyeShape = id;
          rebuild();
        })),
        row(t('shapes.blink'), segmented(t('shapes.blink'), [
          { id: 'open', label: t('shapes.open'), icon: 'part.eyes' as IconName },
          { id: 'shut', label: t('shapes.blink'), icon: 'eye.blink' as IconName },
        ], blink ? 'shut' : 'open', (id) => {
          blink = id === 'shut';
          rebuild();
        })),
      ]
    : [];
  // The paint colours as a colour bar; the last cell rubs out to the skin.
  const inks = choice(t('shapes.inkLabel'), INKS.map((id) => (id === '.' ? { id, icon: 'eraser' } : { id, color: colour(id) ?? '#ffffff' })), () => ink, (id) => { ink = id; }, 'colors', 64);

  draw();
  return h('div', { class: 'shapes' },
    h('p', { class: 'note' }, t('shapes.note', { mood: t(`mood.${mood}` as Key), view: t(`shapes.view.${view}` as Key) })),
    row(t('shapes.part'), segmented(t('shapes.part'), [
      { id: 'eyes' as const, label: t('eyes'), icon: 'part.eyes' as IconName },
      { id: 'brows' as const, label: t('brows'), icon: 'part.brows' as IconName },
      { id: 'mouths' as const, label: t('shapes.mouth'), icon: 'part.mouth' as IconName },
    ], feature, (id) => {
      feature = id;
      rebuild();
    })),
    ...picker,
    row(t('shapes.inkLabel'), inks),
    canvas,
    h('div', { class: 'shapes__actions' },
      pixelButton(t('shapes.export'), { icon: 'download' }, () => download('face-shapes.json', JSON.stringify(FACE_SHAPES, null, 1) + '\n')),
      pixelButton(t('shapes.import'), { icon: 'upload' }, () => void importShapes(ctx.done)),
      import.meta.env.DEV ? statusEl : h('span', { class: 'note' }, t('shapes.devOnly'))),
  );
}
