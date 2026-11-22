// The object editor's panels for a built thing (its size, parts and points), shared by the object
// editor and the Shape tab of the props tool. They change the build they are given in place and say so
// through the context.
import { choice as pixelChoice, pixelButton, textField } from '../../ui/components.ts';
import { AXES, COLOR_KEYS, KINDS, LOOPS, MAX_HEIGHT, MAX_PARTS, MAX_TILES, newPart, PAINTS, SHAPES, UNIT, type Build, type Part } from '../../engine/objects/object.ts';
import { PALETTE, type PaletteKey } from '../../engine/core/palette.ts';
import { h, row, section, segmented, rangeInput } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';

export type BuildTab = 'size' | 'parts' | 'points';
export interface BuildContext {
  prop: Build;
  /** The part picked, its outline shown in the picture. */
  selected: number;
  select(i: number): void;
  /** A slider is being dragged: redraw the picture only. */
  live(): void;
  /** A change is done: commit, save, rebuild. */
  changed(): void;
  /** Rebuild the panel without a change. */
  render(): void;
}

const LABEL: Record<string, [string, string]> = {
  furniture: ['Furniture', 'Möbel'], device: ['Device', 'Gerät'], garden: ['Garden', 'Garten'], car: ['Car', 'Auto'],
  box: ['Box', 'Quader'], cylinder: ['Cylinder', 'Zylinder'], ball: ['Ball', 'Kugel'],
  y: ['Standing', 'Stehend'], x: ['Lying across', 'Quer liegend'], z: ['Lying along', 'Längs liegend'],
  solid: ['Solid', 'Fest'], glow: ['Glows', 'Leuchtet'], water: ['Water', 'Wasser'], dark: ['Dark', 'Dunkel'],
  none: ['Still', 'Ruhig'], blink: ['Blinks', 'Blinkt'], flow: ['Flows', 'Fließt'], bob: ['Bobs', 'Hüpft'],
  px: ['Across (x)', 'Quer (x)'], py: ['Height above floor', 'Höhe über Boden'], pz: ['Along (z)', 'Längs (z)'],
  w: ['Width', 'Breite'], h: ['Height', 'Höhe'], d: ['Depth', 'Tiefe'],
  tw: ['Footprint width', 'Grundfläche Breite'], td: ['Footprint depth', 'Grundfläche Tiefe'],
};
const de = () => currentLang() === 'de';
const L = (en: string, german: string) => (de() ? german : en);
export const label = (key: string) => (LABEL[key] ? LABEL[key][de() ? 1 : 0] : key);


/** A slider. The preview follows while dragging; the panel is rebuilt only on release, so the drag is not interrupted. */
function slider(ctx: BuildContext, title: string, value: number, min: number, max: number, set: (v: number) => void): HTMLElement {
  const input = rangeInput({ min: String(min), max: String(max), step: '1', 'aria-label': title });
  input.value = String(value);
  const out = h('b', {}, String(value));
  input.addEventListener('input', () => {
    set(Number(input.value));
    out.textContent = input.value;
    // Only the preview follows a drag; the crop and the panel wait for the release.
    ctx.live();
  });
  input.addEventListener('change', () => ctx.changed());
  return row(title, input, out);
}

function choice<T extends string>(ctx: BuildContext, title: string, values: readonly T[], value: T, set: (v: T) => void): HTMLElement {
  return row(title, segmented(title, values.map((v) => ({ id: v, label: label(v) })), value, (v) => {
    set(v);
    ctx.changed();
  }));
}

function swatches(ctx: BuildContext, title: string, value: PaletteKey, set: (key: PaletteKey) => void): HTMLElement {
  return row(title, pixelChoice(title, COLOR_KEYS.map((key) => ({ id: key, color: PALETTE[key].base })), () => value, (key) => { set(key as PaletteKey); ctx.changed(); }, 'colors', 60));
}

const ICONS_FOR: Record<string, string> = { Duplicate: 'copy', Verdoppeln: 'copy', Delete: 'trash', Löschen: 'trash' };
const press = (text: string, onClick: () => void, pressed?: boolean, disabled = false) => {
  const icon = ICONS_FOR[text];
  return Object.assign(pixelButton(text, { icon, words: icon ? undefined : text, pressed }, onClick), { disabled });
};
const partName = (p: Part, i: number) => `${i + 1} ${label(p.shape)}`;

export function buildPanel(id: BuildTab, ctx: BuildContext): HTMLElement[] {
  const prop = ctx.prop;
  let selected = ctx.selected;
  const select = (i: number) => { selected = i; ctx.select(i); };
  const reach = prop.w * UNIT + 8;
  const deep = prop.d * UNIT + 8;
  switch (id) {
    case 'size':
      return [section(L('Size', 'Größe'),
        choice(ctx, L('Kind', 'Art'), KINDS, prop.kind, (v) => { prop.kind = v; }),
        slider(ctx, label('tw'), prop.w, 1, MAX_TILES, (v) => { prop.w = v; }),
        slider(ctx, label('td'), prop.d, 1, MAX_TILES, (v) => { prop.d = v; }),
        h('p', { class: 'note' }, L(
          `Tiles are 32×16 pixels. Across the floor a part is measured in sixteenths of a tile edge (${UNIT} to a tile), up in pixels; people are 48 px tall.`,
          `Felder sind 32×16 Pixel. Über den Boden misst ein Teil in Sechzehnteln einer Feldkante (${UNIT} pro Feld), nach oben in Pixeln; Menschen sind 48 px groß.`)),
      )];
    case 'parts': {
      const part = prop.parts[selected];
      const list = h('div', { class: 'urow' }, ...prop.parts.map((p, i) => press(partName(p, i), () => {
        select(i);
        ctx.render();
      }, i === selected)));
      const add = (shape: Part['shape']) => {
        if (prop.parts.length >= MAX_PARTS) return;
        prop.parts.push(newPart({ shape, x: Math.max(0, prop.w * 8 - 4), z: Math.max(0, prop.d * 8 - 4) }));
        select(prop.parts.length - 1);
        ctx.changed();
      };
      const actions = h('div', { class: 'urow' },
        ...SHAPES.map((s) => press(`+ ${label(s)}`, () => add(s), undefined, prop.parts.length >= MAX_PARTS)),
        press(L('Duplicate', 'Verdoppeln'), () => {
          prop.parts.splice(selected + 1, 0, { ...part, x: part.x + 2 });
          select(selected + 1);
          ctx.changed();
        }, undefined, !part || prop.parts.length >= MAX_PARTS),
        press(L('Delete', 'Löschen'), () => {
          prop.parts.splice(selected, 1);
          ctx.changed();
        }, undefined, prop.parts.length <= 1),
      );
      if (!part) return [section(L('Parts', 'Teile'), list, actions)];
      return [
        section(L('Parts (or tap the picture)', 'Teile (oder ins Bild tippen)'), list, actions),
        section(L('Look', 'Aussehen'),
          swatches(ctx, L('Colour', 'Farbe'), part.color, (k) => { part.color = k; }),
          choice(ctx, L('Shape', 'Form'), SHAPES, part.shape, (v) => { part.shape = v; }),
          part.shape === 'cylinder' ? choice(ctx, L('Lies', 'Lage'), AXES, part.axis, (v) => { part.axis = v; }) : '',
          choice(ctx, L('Paint', 'Anstrich'), PAINTS, part.paint, (v) => { part.paint = v; }),
          choice(ctx, L('Loop', 'Bewegung'), LOOPS, part.loop, (v) => { part.loop = v; }),
        ),
        section(L('Place and size', 'Lage und Größe'),
          slider(ctx, label('px'), part.x, -8, reach, (v) => { part.x = v; }),
          slider(ctx, label('pz'), part.z, -8, deep, (v) => { part.z = v; }),
          slider(ctx, label('py'), part.y, 0, MAX_HEIGHT - 1, (v) => { part.y = v; part.h = Math.min(part.h, MAX_HEIGHT - v); }),
          slider(ctx, label('w'), part.w, 1, reach, (v) => { part.w = v; }),
          slider(ctx, label('d'), part.d, 1, deep, (v) => { part.d = v; }),
          slider(ctx, label('h'), part.h, 1, MAX_HEIGHT - part.y, (v) => { part.h = v; }),
        ),
      ];
    }
    case 'points': {
      const rows = prop.points.map((pt, i) => {
        const name = textField(L('Point name', 'Name des Punkts'), pt.name, () => {}, { width: 50, done: (value) => {
          const v = value.trim().toLowerCase();
          if (/^[a-z][a-z0-9]{0,15}$/.test(v)) pt.name = v;
          ctx.changed();
        } });
        return section(pt.name,
          h('div', { class: 'urow' }, name, press(L('Delete', 'Löschen'), () => {
            prop.points.splice(i, 1);
            ctx.changed();
          })),
          slider(ctx, label('px'), pt.x, -8, reach, (v) => { pt.x = v; }),
          slider(ctx, label('pz'), pt.z, -8, deep, (v) => { pt.z = v; }),
          slider(ctx, label('py'), pt.y, 0, MAX_HEIGHT, (v) => { pt.y = v; }),
        );
      });
      return [
        ...rows,
        h('div', { class: 'urow', style: 'margin-top: 12px' }, press(L('+ Point', '+ Punkt'), () => {
          prop.points.push({ name: `point${prop.points.length + 1}`, x: prop.w * 8, y: 10, z: prop.d * 8 });
          ctx.changed();
        }, undefined, prop.points.length >= 8)),
        h('p', { class: 'note' }, L(
          'Points tell the game where things go: "bed" where an animal lies or stands (its feet), "screen" on a desk, "seat1" and "seat2" on a bench. Shown in pink, faint when hidden behind the object.',
          'Punkte sagen dem Spiel, wo etwas hingehört: „bed“, wo ein Tier liegt oder steht (seine Füße), „screen“ auf einem Schreibtisch, „seat1“ und „seat2“ auf einer Bank. Rosa gezeigt, blass wenn vom Objekt verdeckt.')),
      ];
    }
  }
}

