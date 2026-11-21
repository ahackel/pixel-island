// The component overview: every pixel component of engine/ui once, on the page's plain ground, under its name. A component
// is defined in ui/components.ts and nowhere else; a new one shows up here or it does not exist yet.
import { drawRows, label, speechBubble } from '../../shared/pixel-ui.ts';
import { bar, box, choice, dialog, field, fields, header, hud, numberField, iconPicture, menu, panelPicture, pixelButton, section, slider, slot, swatch, textField, type Option } from '../../ui/components.ts';
import { iconRows } from '../../ui/icons.ts';
import { TOOLS, toolHref } from '../../shared/tools.ts';
import { uiPage } from '../../ui/page.ts';
import { C, PAINT, S } from '../../ui/theme.ts';

const main = uiPage('ui');
const noop = () => {};
const div = (css: string) => Object.assign(document.createElement('div'), { style: css });

// Demo state.
let value = 0.4;
const picked: Record<string, string> = { arrows: 'a', icons: 'sun', buttons: 'moon', colors: 'o', list: 'b' };
const pickOf = (look: string) => [() => picked[look], (id: string) => { picked[look] = id; }] as const;

const words: Option[] = ['a', 'b', 'c'].map((id) => ({ id, words: `No ${id}` }));
const icons: Option[] = ['sun', 'moon', 'storm'].map((id) => ({ id, icon: id }));
const colors: Option[] = ['o', 'r', 'y', 'g', 'b', 'm'].map((id) => ({ id, color: PAINT[id] }));
const status = hud({ hunger: 'Food', energy: 'Rest' });
status.draw('Day 1', 'sun', 0.7, 0.15, 0.25);
const portrait = (ctx: CanvasRenderingContext2D, x: number, y: number) => drawRows(ctx, iconRows('face'), x + 6, y + 6, PAINT);

/** The components, one row each: its name, then the control and its variations side by side. */
const COMPONENTS: [string, (() => HTMLElement)[]][] = [
  ['icon', [() => iconPicture('sun')]],
  ['button', [
    () => pixelButton('Button', { icon: 'sun' }, noop),
    () => pixelButton('Words', { icon: 'sun', words: 'Both' }, noop),
    () => pixelButton('Lit', { icon: 'sun', lit: true }, noop),
    () => pixelButton('Dark', { icon: 'moon', dark: true }, noop),
    () => pixelButton('On', { icon: 'lock', pressed: true }, noop),
    () => Object.assign(pixelButton('Off', { icon: 'sun' }, noop), { disabled: true }),
  ]],
  ['choice', [
    () => choice('Arrows', words, ...pickOf('arrows'), 'arrows'),
    () => choice('Icons', icons, ...pickOf('icons'), 'arrows'),
    () => choice('Buttons', icons, ...pickOf('buttons'), 'buttons'),
    () => choice('Colors', colors, ...pickOf('colors'), 'colors'),
    () => choice('List', icons, ...pickOf('list'), 'list'),
  ]],
  ['swatch', [() => swatch('Swatch', PAINT.o, true, noop), () => swatch('Empty', null, false, noop)]],
  ['slider', [() => slider('Slider', value, (v) => { value = v; }, 60, (v) => `${Math.round(v * 100)}`)]],
  ['number field', [() => numberField({ words: 'W' }, 24, noop, { min: 0, max: 99, width: 50 }), () => numberField({ icon: 'sun' }, 7, noop, { width: 40 })]],
  ['bar', [() => bar(0.6, C.hunger), () => bar(0.15, C.hunger, 32, true)]],
  ['fields', [() => fields(
    field({ icon: 'hair' }, choice('Hair', words, ...pickOf('arrows'), 'arrows')),
    field({ icon: 'eye' }, choice('Eyes', icons, ...pickOf('buttons'), 'buttons')),
    field({ icon: 'body' }, numberField({ words: 'W' }, 12, noop, { width: 50 })),
  )]],
  ['section', [() => section({ icon: 'clothes' }, [pixelButton('One', { icon: 'sun' }, noop)])]],
  ['text field', [() => textField('Name', 'Mara', noop, { dice: () => 'Kai' })]],
  ['menu', [() => menu('Menu', [{ icon: 'download', label: 'Save', on: noop }, { icon: 'upload', label: 'Open', on: noop }, { icon: 'trash', label: 'Delete', on: noop }])]],
  ['panel', [() => panelPicture(30, 20), () => box(div('width:80px;height:40px'))]],
  ['slot', [() => slot({ rows: iconRows('tool'), colors: PAINT }), () => slot(null)]],
  ['status', [() => status.canvas]],
  ['label', [() => label('LABEL', C.paper, S * 2)]],
  ['speech bubble', [() => speechBubble('Hello', { ink: C.ink, paper: C.paper, shadow: C.shadow }, S)]],
  ['header', [() => header({ tools: TOOLS.map((x) => ({ ...x, href: toolHref(x.id) })), tool: 'ui', about: ['What this page is.'], more: [{ icon: 'download', label: 'Save', on: noop }, { icon: 'trash', label: 'Delete', on: noop, danger: true }], undo: noop, redo: noop, languages: { current: 'en', ids: ['en', 'de'], pick: noop } }).bar]],
  ['dialog', [() => dialog('Hello there, this is a dialog.', portrait, 90)]],
];

for (const [name, variants] of COMPONENTS) {
  const line = document.createElement('div');
  line.className = 'ucomp';
  line.title = name;
  const head = document.createElement('div');
  head.className = 'ucomp__name';
  head.append(label(name.toUpperCase(), C.paper, 2));
  const body = document.createElement('div');
  body.className = 'urow';
  body.append(...variants.map((make) => make()));
  line.append(head, body);
  main.append(line);
}
