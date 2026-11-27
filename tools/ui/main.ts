// The component overview: every pixel component of engine/ui once, on the page's plain ground, under its name. A component
// is defined in ui/components.ts and nowhere else; a new one shows up here or it does not exist yet.
import { drawRows, label, speechBubble } from '../../shared/pixel-ui.ts';
import { sidebarButton, bar, box, choice, filterToggles, colorField, colorPicker, confirmDialog, library, swatchGrid, formDialog, previewFrame, tileGrid, toast, toggle, dialog, field, fields, header, hud, numberField, iconPicture, menu, searchField, sidePanel, turnView, viewTools, workspace, panelPicture, pixelButton, rangeSlider, section, slider, slot, swatch, textField, type Option } from '../../ui/components.ts';
import { iconRows } from '../../ui/icons.ts';
import { TOOLS, toolHref } from '../../shared/tools.ts';
import { uiPage } from '../../ui/page.ts';
import { C, PAINT, S } from '../../ui/theme.ts';

const main = uiPage('ui');
const noop = () => {};
const div = (css: string) => Object.assign(document.createElement('div'), { style: css });

// Demo state.
let value = 0.4;
let range: [number, number] = [2, 6];
const picked: Record<string, string> = { arrows: 'a', icons: 'sun', buttons: 'moon', colors: 'o', list: 'b', many: 'c5', shelf: 'sun' };
let anyColor = '#3a2f5c';
const pickOf = (look: string) => [() => picked[look], (id: string) => { picked[look] = id; }] as const;

const words: Option[] = ['a', 'b', 'c'].map((id) => ({ id, words: `No ${id}` }));
const icons: Option[] = ['sun', 'moon', 'storm'].map((id) => ({ id, icon: id }));
const colors: Option[] = ['o', 'r', 'y', 'g', 'b', 'm'].map((id) => ({ id, color: PAINT[id] }));
/** More colours than a bar holds: a colour field. */
const many: Option[] = Array.from({ length: 30 }, (_, n) => ({ id: `c${n}`, color: `hsl(${n * 12} 60% ${n % 2 ? 45 : 65}%)` }));
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
    () => pixelButton('Flat', { icon: 'sun', flat: true }, noop),
    () => pixelButton('Flat on', { icon: 'lock', flat: true, pressed: true }, noop),
    () => Object.assign(pixelButton('Off', { icon: 'sun' }, noop), { disabled: true }),
  ]],
  ['choice', [
    () => choice('Arrows', words, ...pickOf('arrows'), 'arrows'),
    () => choice('Icons', icons, ...pickOf('icons'), 'arrows'),
    () => choice('Buttons', icons, ...pickOf('buttons'), 'buttons'),
    () => choice('Colors', colors, ...pickOf('colors'), 'colors'),
    () => choice('Colors and icons', [{ id: '', icon: 'reset' }, ...colors, { id: 'rub', icon: 'eraser' }], ...pickOf('colors'), 'colors', 80),
    () => choice('List', icons, ...pickOf('list'), 'list'),
  ]],
  ['toggle', [() => toggle('Toggle', { icon: 'lock' }, true, noop), () => toggle('Words', { words: 'Wind' }, false, noop)]],
  ['filter toggles', [() => { let on = 'sun'; const row = (): HTMLElement => filterToggles([{ id: 'sun', icon: 'sun' }, { id: 'moon', icon: 'moon' }, { id: 'storm', icon: 'storm' }], () => on, (id) => { on = id; row0.replaceWith(row0 = row()); }); let row0 = row(); return row0; }]],
  ['tile grid', [() => tileGrid([{ id: 'a', icon: 'sun' }, { id: 'b', icon: 'moon', mark: 'lock' }, { id: 'c', picture: iconPicture('storm') }], 'b', noop)]],
  ['turn view', [() => { const view = div('position:relative;width:260px;height:110px;background:#e9d9a0'); view.append(...turnView(view, noop)); return view; }]],
  ['view tools', [() => { const view = div('position:relative;width:260px;height:150px;background:#e9d9a0'); view.append(viewTools(pixelButton('Picture', { icon: 'camera' }, noop), toggle('Wind', { icon: 'storm' }, true, noop), choice('Ground', colors, ...pickOf('colors'), 'list'))); return view; }]],
  ['preview frame', [() => previewFrame(Object.assign(div('width:160px;height:90px;background:#e9d9a0'), {}), { tag: label('TAG', C.ink, 2), tools: [pixelButton('Picture', { icon: 'camera' }, noop)] })]],
  ['confirm', [() => pixelButton('Ask', { icon: 'trash' }, () => void confirmDialog('Delete this?'))]],
  ['form', [() => pixelButton('Form', { icon: 'pencil' }, () => formDialog('New', [textField('Name', 'Mara', noop), numberField({ words: 'W' }, 24, noop, { min: 0, max: 99, width: 50 })], noop))]],
  ['toast', [() => pixelButton('Say', { icon: 'info' }, () => toast('Saved to the project.'))]],
  ['swatch', [() => swatch('Swatch', PAINT.o, true, noop), () => swatch('Empty', null, false, noop)]],
  ['colour field', [() => colorField('Many colours', many, ...pickOf('many')), () => choice('Past 16 a colours choice is a field', [...many, { id: '', icon: 'reset' }], ...pickOf('many'), 'colors')]],
  ['swatch grid', [() => swatchGrid('Swatches', many, ...pickOf('many'), 10)]],
  ['colour picker', [() => colorPicker('Any colour', () => anyColor, (hex) => { anyColor = hex; }, { presets: ['#3a2f5c', '#1d2a3a', '#2f1d1d'] })]],
  ['slider', [() => slider('Slider', value, (v) => { value = v; }, 60, (v) => `${Math.round(v * 100)}`)]],
  ['range slider', [() => rangeSlider('Range', { min: 0, max: 8, get: () => range, change: (lo, hi) => { range = [lo, hi]; } }), () => rangeSlider('Short', { min: 1, max: 4, get: () => [2, 2], change: noop, format: (v) => (v === 4 ? 'All' : String(v)) })]],
  ['number field', [() => numberField({ words: 'W' }, 24, noop, { min: 0, max: 99, width: 50 }), () => numberField({ icon: 'sun' }, 7, noop, { width: 40 })]],
  ['bar', [() => bar(0.6, C.hunger), () => bar(0.15, C.hunger, 32, true)]],
  ['fields', [() => fields(
    field({ icon: 'hair' }, choice('Hair', words, ...pickOf('arrows'), 'arrows')),
    field({ icon: 'eye' }, choice('Eyes', icons, ...pickOf('buttons'), 'buttons')),
    field({ icon: 'body' }, numberField({ words: 'W' }, 12, noop, { width: 50 })),
  )]],
  ['section', [() => section({ icon: 'clothes' }, [pixelButton('One', { icon: 'sun' }, noop)])]],
  ['text field', [() => textField('Name', 'Mara', noop, { dice: () => 'Kai' })]],
  ['search field', [() => Object.assign(searchField('Search', noop), { style: 'width: 200px; display: block' })]],
  ['library', [() => { const { panel, body } = sidePanel('left', 'pixel-ui-library', 220); panel.style.height = '240px'; const shelf = library({ key: 'pixel-ui-library', items: () => icons.map((o) => ({ id: o.id, icon: o.icon, words: o.id })), selected: () => picked.shelf, pick: (id) => { picked.shelf = id; shelf.redraw(); } }); body.append(shelf); return panel; }]],
  ['side panel button', [() => sidebarButton('Side panel'), () => sidebarButton('Inspector', 'right')]],
  ['side panel', [() => { const { panel, body } = sidePanel('left', 'pixel-ui-demo', 150); panel.style.height = '120px'; body.append(searchField('Search', noop)); return panel; }]],
  ['workspace', [() => Object.assign(workspace({ key: 'pixel-ui-workspace', left: [searchField('Search', noop)], centre: [panelPicture(30, 20)], right: [pixelButton('Button', { icon: 'sun' }, noop)], leftWidth: 120, rightWidth: 90 }), { style: 'height: 140px; width: 420px' })]],
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
