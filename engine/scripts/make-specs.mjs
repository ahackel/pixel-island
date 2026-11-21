// Writes the two format descriptions given to the language model, with reference grids taken
// from the real renderer so the text can never drift from the code.
import fs from 'node:fs';
import { hexOf, PAINT_KEYS, PALETTE } from '../engine/core/palette.ts';
import { drawCharacter, layoutOf, HEAD_STAMP as HEAD_FRAME, TOOL_STAMP as TOOL_FRAME, PAINT_W as SPRITE_W, PAINT_H as SPRITE_H, BODY_WINDOW } from '../engine/core/puppet.ts';
import { STAND } from '../engine/core/poses.ts';
import { baseLook } from '../engine/character/base.ts';
import { compileRecipe } from '../engine/character/items.ts';

const look = baseLook('skinB', 'hairBrown');
// Every tone the body is drawn in, the warmed ears and nose included, so the reference reads as a
// solid figure. A colour left out here would show as a hole and the model would paint into it.
const tones = (key, flush) => [{ key }, { key, shade: true }, { key, light: true }].map((c) => hexOf({ ...c, flush }));
const skin = (hex, i) => [hex, i === 1 ? '%' : '#'];
const symbol = new Map([
  ...tones('skinB', false).map(skin), ...tones('skinB', true).map(skin),
  ...tones('hairBrown', false).map((hex) => [hex, '*']),
  [PALETTE.white.base, '='], [PALETTE.white.shade, '='], [PALETTE.white.light, '='],
  [PALETTE.ink.base, 'o'], [PALETTE.mouth.base, '~'], [PALETTE.tooth.base, 'w'], [PALETTE.blush.base, '#'],
]);
const asText = (sprite) => Array.from({ length: SPRITE_H }, (_, y) =>
  Array.from({ length: SPRITE_W }, (_, x) => symbol.get(sprite.get(x + BODY_WINDOW.x, y + BODY_WINDOW.y)) ?? '.').join(''));
const numbered = (rows) => rows.map((r, i) => `${String(i).padStart(2, '0')} ${r}`).join('\n');
const ruler = (w) => '   ' + Array.from({ length: w }, (_, i) => i % 10).join('');

const front = asText(drawCharacter(look, STAND, 0));
const back = asText(drawCharacter(look, STAND, 3));
const lf = layoutOf(STAND, 0);
const lb = layoutOf(STAND, 3);

const palette = PAINT_KEYS.join(', ');

const common = `
## Style

- Pixel art for a small game character, about 40 pixels tall. No outlines.
- Flat colour. Each colour has one darker shade, used sparingly: the far side, the underside, folds.
- Every pixel is deliberate. Prefer simple, readable shapes over detail.
- The character is drawn facing right, turned three-quarters towards the viewer ("front") and
  three-quarters away ("back"). Left-facing versions are mirrored by the game.

## Colours

Only these palette names may be used:

${palette}

In a grid, each colour gets one letter in a \`legend\`. An UPPER-case letter is the normal colour
and the same letter in lower case is its darker shade. A dot is transparent.

## Output

Return a JSON array with exactly 3 candidates that differ from each other in a way a person would
notice (cut, length, pattern, wear, colour choice). Nothing else: no comments, no explanation.
`;

const refs = `
## The character you are dressing

Standing pose, 32 wide by 48 tall. Row and column numbers are shown for reference only.
Symbols: # skin, % shaded skin, * hair, = undershorts, o eye, ~ mouth, w the white of an eye or a tooth, . empty.

Front (facing right, towards the viewer):

\`\`\`
${ruler(32)}
${numbered(front)}
\`\`\`

Back (facing right, away from the viewer):

\`\`\`
${ruler(32)}
${numbered(back)}
\`\`\`

Body parts in the front view:
- Head: rows ${lf.neck.y - 15} to ${lf.neck.y - 2}, columns ${lf.neck.x - 7} to ${lf.neck.x + 7}. Short hair on top.
- Torso: rows ${lf.torso.top} to ${lf.torso.bottom}, columns ${lf.torso.x - 4} to ${lf.torso.x + 4}.
- Arms: 3 wide, hanging straight down. Nearer arm centred on column ${lf.arms[0].x}, rows ${lf.arms[0].y0} to ${lf.arms[0].y1}. Farther arm centred on column ${lf.arms[1].x}, rows ${lf.arms[1].y0} to ${lf.arms[1].y1}.
- Legs: 4 wide. Nearer leg around column ${lf.legs[0].x}, rows ${lf.legs[0].y0} to ${lf.legs[0].y1}. Farther leg around column ${lf.legs[1].x}.
- Right hand (carries tools): column ${lf.handR.x}, row ${lf.handR.y}. In the back view: column ${lb.handR.x}, row ${lb.handR.y}.
- Ground: row 45.
`;

// A worked example, produced by the rule engine so it is guaranteed to be valid.
const exampleRecipe = { name: 'Plain blue T-shirt', slot: 'top', color: 'blue', pattern: null, neck: 'round', length: 0, sleeves: 3, ragged: 0, holes: 0 };
const example = compileRecipe(exampleRecipe).item;
const exampleSprite = (facing) => {
  const sprite = drawCharacter({ ...look, items: [example] }, STAND, facing);
  const bare = drawCharacter({ ...look, items: [] }, STAND, facing);
  return Array.from({ length: SPRITE_H }, (_, y) => Array.from({ length: SPRITE_W }, (_, x) => {
    const c = sprite.get(x + BODY_WINDOW.x, y + BODY_WINDOW.y);
    if (!c || c === bare.get(x + BODY_WINDOW.x, y + BODY_WINDOW.y)) return '.';
    return c === PALETTE.blue.shade ? 'b' : c === PALETTE.blue.base || c === PALETTE.blue.light ? 'B' : '.';
  }).join(''));
};

fs.writeFileSync('docs/specs/spec-sprite.md', `# Item format: whole-sprite paint

You paint an item directly over the standing character, once for the front view and once for the
back view. The game works out which body part each pixel belongs to and moves it with that part in
every animation frame.
${common}${refs}
## What to return for each candidate

\`\`\`json
{
  "name": "short name",
  "slot": "top | bottom | shoes | hair | beard | hat | tool",
  "legend": { "B": "blue" },
  "front": ["32 characters", "... 48 rows in total"],
  "back": ["32 characters", "... 48 rows in total"]
}
\`\`\`

- Both grids are exactly 48 rows of exactly 32 characters, aligned with the reference above.
- Paint only the item. Leave every other pixel as a dot, including skin that stays visible.
- A top is the shirt body plus sleeves on both arms. A bottom is the waist plus both legs.
- Hair, beards and hats sit on the head and may extend a few pixels beyond it.
- A tool is held in the right hand and may extend above the head and down to the ground.

## Example: a plain blue T-shirt

\`\`\`json
${JSON.stringify({ name: 'Plain blue T-shirt', slot: 'top', legend: { B: 'blue' }, front: exampleSprite(0), back: exampleSprite(3) }, null, 1)}
\`\`\`
`);

const headRows = (facing) => {
  const sprite = asText(drawCharacter(look, STAND, facing));
  const l = layoutOf(STAND, facing);
  return Array.from({ length: HEAD_FRAME.h }, (_, r) => {
    const y = l.neck.y - HEAD_FRAME.ay + r;
    return Array.from({ length: HEAD_FRAME.w }, (_, c) => sprite[y]?.[l.neck.x - HEAD_FRAME.ax + c] ?? '.').join('');
  });
};
const toolRows = (facing) => {
  const sprite = asText(drawCharacter(look, STAND, facing));
  const l = layoutOf(STAND, facing);
  return Array.from({ length: TOOL_FRAME.h }, (_, r) => {
    const y = l.handR.y - TOOL_FRAME.ay + r;
    return Array.from({ length: TOOL_FRAME.w }, (_, c) => sprite[y]?.[l.handR.x - TOOL_FRAME.ax + c] ?? '.').join('');
  });
};

fs.writeFileSync('docs/specs/spec-recipe.md', `# Item format: recipes and small stamps

Clothing is described by a few settings and drawn by the game's own rules. Items whose shape is
the whole point (hair, beards, hats, tools) are small pixel stamps.
${common}
## Clothing: tops

\`\`\`json
{ "name": "short name", "slot": "top", "color": "blue",
  "pattern": null,
  "neck": "round", "length": 0, "sleeves": 3, "ragged": 0, "holes": 0 }
\`\`\`

- \`color\`: main palette colour.
- \`pattern\`: null, or { "kind": "hstripes" | "vstripes" | "checks", "color": palette name, "every": 2 to 6 }.
- \`neck\`: "round", "v", or "open" (worn open down the front, skin showing).
- \`length\`: pixels the hem hangs below the waist. 0 ends at the waist, 5 is a long tunic, negative is cropped (down to -6).
- \`sleeves\`: 0 (sleeveless) to 10 (to the wrist). 3 is a T-shirt.
- \`ragged\`: 0 to 3. How uneven the hem and sleeve ends are.
- \`holes\`: 0 to 4. Small tears that show skin.

## Clothing: bottoms

\`\`\`json
{ "name": "short name", "slot": "bottom", "color": "navy",
  "pattern": null, "length": 4, "ragged": 0, "holes": 0, "belt": null, "skirt": false }
\`\`\`

- \`length\`: for trousers, 1 (briefs) to 10 (to the ankle); 4 is shorts above the knee. For a skirt, 1 to 5 pixels below the hips.
- \`belt\`: null or a palette colour.
- \`skirt\`: true draws a skirt or wrap instead of trouser legs.

## Shoes

\`\`\`json
{ "name": "short name", "slot": "shoes", "color": "brown",
  "sole": null, "height": 0, "cuff": null, "open": false }
\`\`\`

- \`color\`: the upper.
- \`sole\`: null, or a palette colour for the bottom row of the foot.
- \`height\`: 0 (a low shoe) to 5 (a boot to just below the knee): how many pixels of the lower leg the shaft covers.
- \`cuff\`: null, or a palette colour for the top pixel of the shaft: a turned-down top, fur trim, or a sock showing.
- \`open\`: true for sandals and flip-flops: the top of the foot stays bare apart from one strap.

## Head items: hair, beard, hat

A stamp 21 wide by 30 tall, for the front view and for the back view.

\`\`\`json
{ "name": "short name", "slot": "hat", "legend": { "S": "straw" },
  "front": ["21 characters", "... 30 rows in total"],
  "back": ["21 characters", "... 30 rows in total"] }
\`\`\`

The head inside that frame, for reference (# skin, % shaded skin, * the default short hair, o eye, ~ mouth, w the white of an eye or a tooth, = body below).
Your stamp is drawn on top of this. Paint only your item and leave the rest as dots.

Front:

\`\`\`
${ruler(21)}
${numbered(headRows(0))}
\`\`\`

Back:

\`\`\`
${ruler(21)}
${numbered(headRows(3))}
\`\`\`

- The skull is rows 6 to 19, columns 3 to 17. The face looks right. The neck is rows 20 and 21. Shoulders begin at row 22.
- A hat usually covers the default hair (rows 4 to 9) and may rise to row 0 and spread to columns 0 and 20.
- A beard covers the jaw around and below the mouth and may hang to row 25.
- Long hair may fall to row 28 behind the shoulders.
- Both stamps show the same item turned half way round, and the game works out the face-on, side
  and straight-behind views from them. So they must agree: the same top row, the lower edge at the
  same height on the sides, the same colours. Only something on the front (a badge, a fringe) may
  be missing behind. Do not copy the front's design onto the back.
- For hair, prefer the shape format below: it gives every view from one description.
- Hair only, optional: \`"behind"\`, a third stamp of the same size for the front view, drawn behind
  the head and the body. Use it for hair that hangs down the back (a ponytail, a braid, long loose
  hair), so that it shows beside the neck and below the head and not on top of the shoulders. In
  the front view the back of the head is on the left.

## Tools

One stamp 15 wide by 44 tall, used from every side. The right hand grips the stamp at column 7, row 30. The ground is at row 43.

\`\`\`json
{ "name": "short name", "slot": "tool", "legend": { "W": "wood" },
  "front": ["15 characters", "... 44 rows in total"] }
\`\`\`

The body inside that frame in the front view, for reference (the arm is drawn over the tool):

\`\`\`
${ruler(15)}
${numbered(toolRows(0))}
\`\`\`

## Hair as a shape

Instead of stamps, a hairstyle may be given as one shape round the head. The game draws every view
from it, so it looks the same from all sides, and an uneven style keeps its side when the character
turns. Angles go round the head: 0 is the face, 90 the character's right, 180 the back, 270 the left.

\`\`\`json
{ "name": "High ponytail", "slot": "hair", "color": "hairBrown",
  "hem": [2, 5, 8, 11, 12, 11, 8, 5],
  "volume": 1, "crown": 0, "strip": null, "parting": null, "curl": false,
  "parts": [{ "kind": "tail", "at": 180, "row": 1, "size": 3, "length": 14 }] }
\`\`\`

- \`hem\`: eight numbers, where the hair ends at 0, 45, 90 ... 315 degrees, in rows below the top of
  the skull. The skull is 14 rows: brows at 4, eyes 5 to 8, ears 6 and 7, nape 11 or 12, chin 13,
  shoulders about 18. A fringe is 2 to 5 at 0; short hair reaches 11 or 12 at 180; hair to the
  shoulders is about 19 at 90, 135, 180, 225 and 270. Different values at 45 and 315 make it uneven.
- \`volume\`: 0 (cropped close, a buzz cut) to 3 (an afro): how many pixels it stands off the skull.
- \`crown\`: 0 to 4 extra rows of height on top.
- \`strip\`: null, or 0.5 to 6: only a crest this many pixels either side of the middle (a mohawk).
- \`parting\`: null, or the angle of a parting line on the crown (0 a centre parting, 60 to one side).
- \`curl\`: true breaks the outline into curls.
- \`parts\`: buns and tails. \`at\` the angle, \`row\` the height (negative is above the skull),
  \`size\` a bun's radius or a tail's width (1 to 6), \`length\` how many rows a tail hangs.
  A ponytail is one tail at 180, pigtails are two at about 110 and 250, a top bun is a bun at row -3.
`);
console.log(fs.readFileSync('docs/specs/spec-sprite.md', 'utf8').split('\n').slice(34, 100).join('\n'));
