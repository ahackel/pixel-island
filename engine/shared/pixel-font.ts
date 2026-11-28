// A pixel font, from Lop Hop: capitals 3 pixels wide (E F L 2, M and W 5) and 5 tall, in a cell of 8 rows: two above (an
// umlaut's dots, a blank row clear of the full-size letter) and one below (tails). Text is written in capitals; ß as SS;
// names keep their small letters (`cased`).
//
// A letter: its rows top to bottom, each a number in base 32 whose bits are its pixels, 3 wide or, where a row needs
// more, 5 wide. Five rows (the letter), seven (with a row above and below) or eight (two above). A letter is as wide as
// the columns it uses, a space 2, with a pixel between letters.
export const GLYPHS: Record<string, string> = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '32323', F: '32322', G: '34553', H: '55755', I: '22222', J: '11152', K: '55655', L: '22223', M: 'hrlhh',
  N: '65555', O: '25552', P: '65644', Q: '0255522', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: 'hhlla', X: '55255', Y: '55222', Z: '71247',
  0: '75557', 1: '26222', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716',
  Ä: '50257550', Ö: '50255520', Ü: '50555570',
  ' ': '00000', '.': '00002', ':': '02020', '!': '22202', '-': '00700', '/': '1122244', '+': '02720', '<': '12421', '>': '42124', '?': '61202',
  '(': '1222221', ')': '4222224', ',': '0000022', "'": '22000', '%': '51245', '×': '05250',
  // Small letters, for text kept as typed (names): 4 rows tall under the capitals' top, ascenders up to it, tails below.
  a: '03553', b: '46556', c: '03443', d: '13553', e: '03743', f: '26444', g: '0035316', h: '46555', i: '2022220', j: '2022224',
  k: '45655', l: '44442', m: '0ulll', n: '06555', o: '02552', p: '0065644', q: '0035311', r: '06444', s: '03416', t: '46442',
  u: '05553', v: '05552', w: '0llla', x: '05225', y: '0055316', z: '07127',
  ä: '05035530', ö: '05025520', ü: '05055530',
};
/** Rows of the cell over a letter's top: an umlaut's dots and a blank row. */
export const ABOVE = 2;
/** Rows of the text cell: the 5 of a letter, two above and one below. */
export const LINE_H = 8;
/** From one line of text to the next: a whole cell, whose two rows above a letter keep the lines apart. */
export const LINE_STEP = LINE_H;

interface Glyph { rows: number[]; full: number; from: number; w: number }
const glyphs = new Map<string, Glyph>();
function glyphOf(written: string): Glyph {
  let g = glyphs.get(written);
  if (g) return g;
  const nums = [...written].map((c) => parseInt(c, 32));
  const rows = nums.length === 5 ? [0, 0, ...nums, 0] : nums.length === 7 ? [0, ...nums] : nums;
  const full = rows.some((r) => r > 7) ? 5 : 3;
  const all = rows.reduce((a, r) => a | r, 0);
  const on = (c: number) => all & (1 << (full - 1 - c));
  let from = 0;
  let to = full - 1;
  while (from < full && !on(from)) from++;
  while (to > from && !on(to)) to--;
  g = { rows, full, from: from < full ? from : 0, w: from < full ? to - from + 1 : 2 };
  glyphs.set(written, g);
  return g;
}

/** Text as the font writes it: capitals (unless `cased`), and what it has no letter for spelled with what it has. */
export const normal = (s: string, cased = false) => {
  s = String(s).replace(/…/g, '...').replace(/[’‘`]/g, "'").replace(/[—–]/g, '-').replace(/[“”„"]/g, "'");
  return cased ? s.replace(/ß/g, 'ss') : s.replace(/ß/g, 'SS').toUpperCase();
};

const glyphFor = (ch: string) => glyphOf(GLYPHS[ch] ?? GLYPHS[' ']);

/** How wide text is, in font pixels. */
export function textWidth(s: string, cased = false): number {
  s = normal(s, cased);
  let w = -1;
  for (const ch of s) w += glyphFor(ch).w + 1;
  return Math.max(0, w);
}

/** Writes text with its letters' tops at y. */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: 'left' | 'center' | 'right' = 'left', cased = false): void {
  s = normal(s, cased);
  if (align === 'center') x -= textWidth(s, true) / 2;
  if (align === 'right') x -= textWidth(s, true);
  x = Math.round(x);
  ctx.fillStyle = color;
  ctx.beginPath();
  let at = 0;
  for (const ch of s) {
    const g = glyphFor(ch);
    for (let r = 0; r < LINE_H; r++) for (let c = 0; c < g.w; c++) if (g.rows[r] & (1 << (g.full - 1 - g.from - c))) ctx.rect(x + at + c, y + r - ABOVE, 1, 1);
    at += g.w + 1;
  }
  ctx.fill();
}

/** Breaks text into lines no wider than `max` font pixels, at spaces. */
export function wrap(s: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
