// The character editor before each new game: the survivor as they were (or the default), changed a
// row at a time under four tabs, or rolled at random. A small wardrobe: no tools, the spear is built.
// Laid out for an iPad on its side: the survivor large on the left, the choices on the right.
import { BROWS, EYE_SHAPES, HAIR_STYLES, HEAD_SHAPES } from '@pixel/engine/character/base.ts';
import { CATALOG, CLOTH_KEYS, entryById } from '@pixel/engine/character/catalog.ts';
import { HAIR_COLORS, lookOf, type State, type WornSlot } from '@pixel/engine/character/character.ts';
import { PALETTE, SHADOW, SKIN_KEYS, type PaletteKey } from '@pixel/engine/core/palette.ts';
import { AUTHORED, STAND } from '@pixel/engine/core/poses.ts';
import { BUILDS, drawCharacter, SPRITE_W, turnFacing, type Facing, type Sprite } from '@pixel/engine/core/puppet.ts';
import { textWidth, text } from '@pixel/shared/pixel-font.ts';
import { drawRows, label, panel, pixelCanvas } from '@pixel/shared/pixel-ui.ts';
import { t } from './i18n.ts';
import { C, caps, ICONS, pixelButton, S, type Icon } from './ui.ts';

type Value = string | boolean | null;
/**
 * `none`: how often a roll leaves it at its first value (none, no, own colours). `unset`: what null is called.
 * `swatches`: picked from colour squares, not stepped through; `own` is the colour null stands for.
 */
interface Row { key: string; values: readonly Value[]; get(s: State): Value; set(s: State, v: Value): void; none?: number; unset?: string; swatches?: true; own?(s: State): Value; icon?(v: Value): Icon }

const ids = (slot: string) => CATALOG.filter((e) => e.slot === slot && !e.id.startsWith('job-')).map((e) => e.id);
/** The palette colour a piece's own main colour is swapped for, or null for its own. */
const colorRow = (slot: WornSlot): Row => ({
  key: 'char.color',
  values: [null, ...CLOTH_KEYS],
  get: (s) => s.colors[slot]?.[entryById(s.worn[slot])?.colors[0] ?? 'white'] ?? null,
  set: (s, v) => {
    const own = entryById(s.worn[slot])?.colors[0];
    // Picking the piece's own colour is the same as no swap.
    if (v && own && v !== own) s.colors[slot] = { [own]: v as never };
    else delete s.colors[slot];
  },
  none: 0.5,
  unset: 'char.own',
  swatches: true,
  own: (s) => entryById(s.worn[slot])?.colors[0] ?? null,
});
const wornRow = (key: string, slot: WornSlot, optional: boolean, none = 0): Row => ({
  key,
  values: [...(optional ? [null] : []), ...ids(slot)],
  get: (s) => s.worn[slot],
  // A new piece starts in its own colours.
  set: (s, v) => { s.worn[slot] = v as string | null; delete s.colors[slot]; },
  none,
});

const TABS: { key: string; icon: Icon; rows: Row[] }[] = [
  { key: 'char.body', icon: 'body', rows: [
    { key: 'char.skin', values: SKIN_KEYS, get: (s) => s.skin, set: (s, v) => (s.skin = v as never), swatches: true },
    { key: 'char.figure', values: ['m', 'f'], get: (s) => s.frame, set: (s, v) => (s.frame = v as 'm' | 'f'), icon: (v) => (v === 'f' ? 'female' : 'male') },
    { key: 'char.build', values: BUILDS.map((b) => b.id), get: (s) => s.build, set: (s, v) => (s.build = v as string) },
    { key: 'char.head', values: HEAD_SHAPES, get: (s) => s.face.shape ?? 'round', set: (s, v) => (s.face.shape = v as never) },
  ] },
  { key: 'char.face', icon: 'face', rows: [
    { key: 'char.eyes', values: EYE_SHAPES, get: (s) => s.face.eyes, set: (s, v) => (s.face.eyes = v as never) },
    { key: 'char.brows', values: BROWS, get: (s) => s.face.brows, set: (s, v) => (s.face.brows = v as never) },
    { key: 'char.freckles', values: [false, true], get: (s) => s.face.freckles, set: (s, v) => (s.face.freckles = !!v), none: 0.7 },
    { key: 'char.glasses', values: [false, true], get: (s) => s.face.glasses, set: (s, v) => (s.face.glasses = !!v), none: 0.8 },
  ] },
  { key: 'char.hair', icon: 'hair', rows: [
    { key: 'char.hairStyle', values: [null, ...HAIR_STYLES.map((h) => h.id), ...ids('hair')], get: (s) => s.hair, set: (s, v) => (s.hair = v as string | null), none: 0.1 },
    { key: 'char.color', values: HAIR_COLORS, get: (s) => s.hairColor, set: (s, v) => (s.hairColor = v as never), swatches: true },
    wornRow('char.beard', 'beard', true, 0.6),
  ] },
  { key: 'char.clothes', icon: 'clothes', rows: [
    wornRow('char.top', 'top', false), colorRow('top'),
    wornRow('char.bottom', 'bottom', false), colorRow('bottom'),
    wornRow('char.hat', 'hat', true, 0.3),
  ] },
];

/** A whole new survivor: each row at random, the optional ones (beard, hat, own colours) often left as they come. */
function roll(s: State): void {
  for (const { rows } of TABS) for (const row of rows) {
    const first = row.values[0];
    const pick = (first === null || first === false) && Math.random() < (row.none ?? 0) ? first : row.values[Math.floor(Math.random() * row.values.length)];
    row.set(s, pick);
  }
}

/** A value's name: none, yes or no, its own text (`char.top.<id>`), or else which of how many. */
function named(row: Row, v: Value): string {
  if (v === null) return t(row.unset ?? 'char.none');
  if (typeof v === 'boolean') return t(v ? 'char.yes' : 'char.no');
  const id = `${row.key}.${v}`;
  const name = t(id);
  if (name !== id) return name;
  const some = row.values.filter((x) => x !== null);
  return `${some.indexOf(v) + 1}/${some.length}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });
/** A palette colour's own shade, for a swatch. */
const hex = (k: Value) => PALETTE[k as PaletteKey]?.base ?? C.paper;

/** The editor, starting from `start` (copied). `done` gets the survivor chosen. */
export function characterEditor(start: State, done: (s: State) => void): HTMLElement {
  const s: State = structuredClone(start);
  s.worn.tool = null;
  const box = el('div', 'editor');

  // The survivor large and neat (not yet worn by the island), idling as on the island: blinking, now and then a glance or a smile.
  // Dragged sideways (or the arrows below), they turn round.
  const SIZE = 56;
  // shortcut: fixed so the longest German names still fit beside it on a 1024-wide iPad; size it from the window if wider screens should get more.
  const BIG = 6;
  const { canvas, ctx } = pixelCanvas(SIZE, SIZE, BIG);
  canvas.className = 'preview';
  // Three-quarters from the front, looking right.
  let facing: Facing = 0;
  const IDLE = AUTHORED.idle;
  let frame = 0;
  let fidget: { look: number; face?: string; until: number } | null = null;
  let nextFidget = performance.now() + 2500;
  /** Drawn sprites by facing, face and look; emptied when the survivor changes. */
  const sprites = new Map<string, Sprite>();
  const paint = () => {
    const face = IDLE.faces?.[frame] === 'blink' ? 'blink' : fidget?.face;
    const look = fidget?.look ?? 0;
    const key = `${facing}|${face}|${look}`;
    let sprite = sprites.get(key);
    if (!sprite) sprites.set(key, (sprite = drawCharacter(lookOf({ ...s, wear: 0 }), look ? { ...STAND, look } : IDLE.frames[frame], facing, { face })));
    ctx.clearRect(0, 0, SIZE, SIZE);
    panel(ctx, 0, 0, SIZE, SIZE - 1, C.paper, C.shadow);
    const dx = (SPRITE_W - SIZE) / 2, dy = 2;
    for (let y = 0; y < SIZE - 3; y++) for (let x = 0; x < SIZE; x++) {
      const c = sprite.get(x + dx, y + dy);
      if (!c) continue;
      ctx.fillStyle = c === SHADOW ? C.shadow : c;
      ctx.fillRect(x, y, 1, 1);
    }
  };
  const idling = setInterval(() => {
    if (!box.isConnected) return clearInterval(idling);
    const now = performance.now();
    frame = (frame + 1) % IDLE.frames.length;
    if (fidget && now > fidget.until) {
      fidget = null;
      nextFidget = now + 2500 + Math.random() * 3000;
    }
    if (!fidget && now >= nextFidget) {
      fidget = Math.random() < 0.6 ? { look: Math.random() < 0.5 ? 1 : -1, until: now + 1500 } : { look: 0, face: 'smile', until: now + 1500 };
    }
    paint();
  }, 1000 / IDLE.rate);
  const turn = (by: number) => { facing = turnFacing(facing, by); paint(); };
  /** A step round for every this many screen pixels dragged. */
  const DRAG_STEP = 40;
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); dragX = e.clientX; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    const steps = Math.trunc((e.clientX - dragX) / DRAG_STEP);
    if (!steps) return;
    dragX += steps * DRAG_STEP;
    turn(-steps);
  });
  const lift = () => (dragX = null);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  const turner = el('div', 'turn');
  turner.append(pixelButton(t('char.turnLeft'), { icon: 'left' }, () => turn(-1)), pixelButton(t('char.turnRight'), { icon: 'right' }, () => turn(1)));
  const stage = el('div', 'stage');
  stage.append(canvas, turner);

  // One row: its name on the left; then arrows either side of what is chosen, or a bar of colours.
  const NAME_W = Math.max(...TABS.flatMap((tab) => tab.rows.map((r) => textWidth(caps(t(r.key))))));
  const VALUE_W = 8 + Math.max(...TABS.flatMap((tab) => tab.rows.filter((r) => !r.swatches).flatMap((r) => r.values.map((v) => textWidth(caps(named(r, v)))))));
  /** A choice's box and a colour bar: room for an arrow at each end and the longest name between. */
  const BAR_W = 11 + VALUE_W + 11;
  /** How tall the triangle over the chosen colour is. */
  const TIP = 3;
  const rowEl = (row: Row) => {
    const line = el('div', 'row');
    line.append(label(caps(t(row.key)), C.paper, S));
    const face = el('span', 'value');
    let draw: () => void;
    if (row.swatches) {
      // One bar of all the colours side by side, a little triangle over the chosen one; tapped or slid along.
      const picks = row.values.filter((v) => v !== null);
      const edge = (n: number) => 2 + Math.floor((n * (BAR_W - 4)) / picks.length);
      draw = () => {
        const now = row.get(s) ?? row.own?.(s) ?? null;
        const { canvas: bar, ctx: c } = pixelCanvas(BAR_W, TIP + 14, S);
        panel(c, 0, TIP, BAR_W, 13, C.paper, C.shadow);
        picks.forEach((v, n) => {
          const x = edge(n), w = edge(n + 1) - x;
          c.fillStyle = hex(v);
          c.fillRect(x, TIP + 2, w, 9);
          if (v !== now) return;
          c.fillStyle = C.paper;
          const mid = x + Math.floor(w / 2);
          for (let y = 0; y < TIP; y++) c.fillRect(mid - (TIP - 1 - y), y, 2 * (TIP - 1 - y) + 1, 1);
        });
        face.replaceChildren(bar);
      };
      const pickAt = (e: PointerEvent) => {
        const x = (e.clientX - face.getBoundingClientRect().left) / S;
        const n = Math.max(0, Math.min(picks.length - 1, Math.floor(((x - 2) * picks.length) / (BAR_W - 4))));
        if ((row.get(s) ?? row.own?.(s)) === picks[n]) return;
        row.set(s, picks[n]);
        refresh();
      };
      face.className = 'value bar';
      face.setAttribute('aria-label', t(row.key));
      face.addEventListener('pointerdown', (e) => { face.setPointerCapture(e.pointerId); pickAt(e); });
      face.addEventListener('pointermove', (e) => { if (face.hasPointerCapture(e.pointerId)) pickAt(e); });
      line.append(face);
    } else {
      // One box, as wide as a colour bar: the arrows at its ends, what is chosen between them. Each half steps its way.
      draw = () => {
        const { canvas: c, ctx: x } = pixelCanvas(BAR_W, 14, S);
        panel(x, 0, 0, BAR_W, 13, C.paper, C.shadow);
        drawRows(x, ICONS.left, 2, 2, C.ink);
        drawRows(x, ICONS.right, BAR_W - 11, 2, C.ink);
        const v = row.get(s);
        if (row.icon) drawRows(x, ICONS[row.icon(v)], Math.floor((BAR_W - 9) / 2), 2, C.ink);
        else text(x, caps(named(row, v)), BAR_W / 2, 4, C.ink, 'center');
        face.replaceChildren(c);
      };
      const step = (by: number) => {
        const n = row.values.length;
        row.set(s, row.values[(row.values.indexOf(row.get(s)) + by + n) % n]);
        refresh();
      };
      const half = (name: string, by: number) => {
        const b = el('button', `half ${by < 0 ? 'prev' : 'next'}`);
        b.setAttribute('aria-label', `${t(row.key)}: ${name}`);
        b.addEventListener('click', () => step(by));
        return b;
      };
      const pick = el('div', 'pick');
      pick.append(face, half(t('char.prev'), -1), half(t('char.next'), 1));
      line.append(pick);
    }
    draw();
    return { line, draw };
  };

  const tabsBox = el('div', 'tabs');
  const rowsBox = el('div', 'rows');
  rowsBox.style.setProperty('--name-w', `${NAME_W * S}px`);
  let tab = 0;
  let drawn: { draw: () => void }[] = [];
  const showTab = () => {
    tabsBox.replaceChildren(...TABS.map((tb, n) => {
      const b = pixelButton(t(tb.key), { icon: tb.icon, lit: n === tab }, () => { tab = n; showTab(); });
      b.setAttribute('aria-pressed', String(n === tab));
      return b;
    }));
    const made = TABS[tab].rows.map(rowEl);
    drawn = made;
    rowsBox.replaceChildren(...made.map((m) => m.line));
  };
  // A change can change other rows (a new top drops its colour), so all of the tab are redrawn.
  const refresh = () => {
    for (const d of drawn) d.draw();
    sprites.clear();
    paint();
  };

  const end = el('div', 'end');
  end.append(
    pixelButton(t('char.random'), { icon: 'dice' }, () => {
      roll(s);
      refresh();
      // A little hop, so a new roll shows even where little changed.
      canvas.classList.remove('hop');
      void canvas.offsetWidth;
      canvas.classList.add('hop');
    }),
    pixelButton(t('char.start'), { words: t('char.start') }, () => done(structuredClone(s))),
  );
  const side = el('div', 'side');
  side.append(tabsBox, rowsBox);
  box.append(stage, side, end);
  showTab();
  paint();
  return box;
}
