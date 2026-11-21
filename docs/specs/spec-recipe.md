# Item format: recipes and small stamps

Clothing is described by a few settings and drawn by the game's own rules. Items whose shape is
the whole point (hair, beards, hats, tools) are small pixel stamps.

## Style

- Pixel art for a small game character, about 40 pixels tall. No outlines.
- Flat colour. Each colour has one darker shade, used sparingly: the far side, the underside, folds.
- Every pixel is deliberate. Prefer simple, readable shapes over detail.
- The character is drawn facing right, turned three-quarters towards the viewer ("front") and
  three-quarters away ("back"). Left-facing versions are mirrored by the game.

## Colours

Only these palette names may be used:

skinA, skinB, skinC, skinD, skinE, hairBlack, hairBrown, hairBlond, hairRed, hairGrey, white, cream, red, orange, yellow, leaf, green, teal, blue, navy, purple, pink, brown, tan, straw, wood, grey, steel, black, jungle, lime, moss, sage, bark, stone, basalt, sandstone, driftwood, piglet, flame, flare, blaze

In a grid, each colour gets one letter in a `legend`. An UPPER-case letter is the normal colour
and the same letter in lower case is its darker shade. A dot is transparent.

## Output

Return a JSON array with exactly 3 candidates that differ from each other in a way a person would
notice (cut, length, pattern, wear, colour choice). Nothing else: no comments, no explanation.

## Clothing: tops

```json
{ "name": "short name", "slot": "top", "color": "blue",
  "pattern": null,
  "neck": "round", "length": 0, "sleeves": 3, "ragged": 0, "holes": 0 }
```

- `color`: main palette colour.
- `pattern`: null, or { "kind": "hstripes" | "vstripes" | "checks", "color": palette name, "every": 2 to 6 }.
- `neck`: "round", "v", or "open" (worn open down the front, skin showing).
- `length`: pixels the hem hangs below the waist. 0 ends at the waist, 5 is a long tunic, negative is cropped (down to -6).
- `sleeves`: 0 (sleeveless) to 10 (to the wrist). 3 is a T-shirt.
- `ragged`: 0 to 3. How uneven the hem and sleeve ends are.
- `holes`: 0 to 4. Small tears that show skin.

## Clothing: bottoms

```json
{ "name": "short name", "slot": "bottom", "color": "navy",
  "pattern": null, "length": 4, "ragged": 0, "holes": 0, "belt": null, "skirt": false }
```

- `length`: for trousers, 1 (briefs) to 10 (to the ankle); 4 is shorts above the knee. For a skirt, 1 to 5 pixels below the hips.
- `belt`: null or a palette colour.
- `skirt`: true draws a skirt or wrap instead of trouser legs.

## Shoes

```json
{ "name": "short name", "slot": "shoes", "color": "brown",
  "sole": null, "height": 0, "cuff": null, "open": false }
```

- `color`: the upper.
- `sole`: null, or a palette colour for the bottom row of the foot.
- `height`: 0 (a low shoe) to 5 (a boot to just below the knee): how many pixels of the lower leg the shaft covers.
- `cuff`: null, or a palette colour for the top pixel of the shaft: a turned-down top, fur trim, or a sock showing.
- `open`: true for sandals and flip-flops: the top of the foot stays bare apart from one strap.

## Head items: hair, beard, hat

A stamp 21 wide by 30 tall, for the front view and for the back view.

```json
{ "name": "short name", "slot": "hat", "legend": { "S": "straw" },
  "front": ["21 characters", "... 30 rows in total"],
  "back": ["21 characters", "... 30 rows in total"] }
```

The head inside that frame, for reference (# skin, % shaded skin, * the default short hair, o eye, ~ mouth, w the white of an eye or a tooth, = body below).
Your stamp is drawn on top of this. Paint only your item and leave the rest as dots.

Front:

```
   012345678901234567890
00 .....................
01 .....................
02 .....................
03 ........**...*.......
04 ......*********......
05 ....*************....
06 ..*****************..
07 ..*****************..
08 ..*****************..
09 ..*****************..
10 ..*****************..
11 ..****##***##*****...
12 ..***#############*..
13 ..##*####wo###wo##...
14 ..#%*####oo###oo##...
15 ..#%#####oo###oo##...
16 ..%##########%####...
17 ...#######~wwww~##...
18 ....#######~~~~###...
19 .....###########%....
20 .......%%%%%%%%......
21 .....#...%%%%..%.....
22 ....##%#%%%%%#%%%....
23 ....##%#######%%%....
24 ....##%#######%%%....
25 ....##%#######%%%....
26 ....##%#######%%%....
27 ....##%#######%%%....
28 ....##%#######%%%....
29 ....##%#######%%%....
```

Back:

```
   012345678901234567890
00 .....................
01 .....................
02 .....................
03 .......*...**........
04 ......*********......
05 ....*************....
06 ..*****************..
07 ..*****************..
08 ..*****************..
09 ..*****************..
10 ..*****************..
11 ..*****************..
12 ..****************...
13 ..****************#..
14 ...**************%#..
15 ...#************#%#..
16 ...###**#**##*####%..
17 ...###############...
18 ....#############....
19 .....###########.....
20 .......%%%%%%%.......
21 .....%...%%%%..#.....
22 ....%%%#%%%%%#%##....
23 ....%%%#######%##....
24 ....%%%###%###%##....
25 ....%%%###%###%##....
26 ....%%%###%###%##....
27 ....%%%###%###%##....
28 ....%%%#######%##....
29 ....%%%#######%##....
```

- The skull is rows 6 to 19, columns 3 to 17. The face looks right. The neck is rows 20 and 21. Shoulders begin at row 22.
- A hat usually covers the default hair (rows 4 to 9) and may rise to row 0 and spread to columns 0 and 20.
- A beard covers the jaw around and below the mouth and may hang to row 25.
- Long hair may fall to row 28 behind the shoulders.
- Both stamps show the same item turned half way round, and the game works out the face-on, side
  and straight-behind views from them. So they must agree: the same top row, the lower edge at the
  same height on the sides, the same colours. Only something on the front (a badge, a fringe) may
  be missing behind. Do not copy the front's design onto the back.
- For hair, prefer the shape format below: it gives every view from one description.
- Hair only, optional: `"behind"`, a third stamp of the same size for the front view, drawn behind
  the head and the body. Use it for hair that hangs down the back (a ponytail, a braid, long loose
  hair), so that it shows beside the neck and below the head and not on top of the shoulders. In
  the front view the back of the head is on the left.

## Tools

One stamp 15 wide by 44 tall, used from every side. The right hand grips the stamp at column 7, row 30. The ground is at row 43.

```json
{ "name": "short name", "slot": "tool", "legend": { "W": "wood" },
  "front": ["15 characters", "... 44 rows in total"] }
```

The body inside that frame in the front view, for reference (the arm is drawn over the tool):

```
   012345678901234
00 ...............
01 ..........**...
02 ........*******
03 ......*********
04 ....***********
05 ....***********
06 ....***********
07 ....***********
08 ....***********
09 ....****##***##
10 ....***########
11 ....##*####wo##
12 ....#%*####oo##
13 ....#%#####oo##
14 ....%##########
15 .....#######~ww
16 ......#######~~
17 .......########
18 .........%%%%%%
19 .......#...%%%%
20 ......##%#%%%%%
21 ......##%######
22 ......##%######
23 ......##%######
24 ......##%######
25 ......##%######
26 ......##%######
27 ......##%######
28 ......##%####%#
29 ......###======
30 ......###======
31 ......%#%======
32 ........====.==
33 ........====.%%
34 ........###%.%%
35 ........###%.%%
36 ........###%.%%
37 ........###%.%%
38 ........###%.%%
39 ........###%.%%
40 ........###%.%%
41 ........#####%%
42 ........%####..
43 ...............
```

## Hair as a shape

Instead of stamps, a hairstyle may be given as one shape round the head. The game draws every view
from it, so it looks the same from all sides, and an uneven style keeps its side when the character
turns. Angles go round the head: 0 is the face, 90 the character's right, 180 the back, 270 the left.

```json
{ "name": "High ponytail", "slot": "hair", "color": "hairBrown",
  "hem": [2, 5, 8, 11, 12, 11, 8, 5],
  "volume": 1, "crown": 0, "strip": null, "parting": null, "curl": false,
  "parts": [{ "kind": "tail", "at": 180, "row": 1, "size": 3, "length": 14 }] }
```

- `hem`: eight numbers, where the hair ends at 0, 45, 90 ... 315 degrees, in rows below the top of
  the skull. The skull is 14 rows: brows at 4, eyes 5 to 8, ears 6 and 7, nape 11 or 12, chin 13,
  shoulders about 18. A fringe is 2 to 5 at 0; short hair reaches 11 or 12 at 180; hair to the
  shoulders is about 19 at 90, 135, 180, 225 and 270. Different values at 45 and 315 make it uneven.
- `volume`: 0 (cropped close, a buzz cut) to 3 (an afro): how many pixels it stands off the skull.
- `crown`: 0 to 4 extra rows of height on top.
- `strip`: null, or 0.5 to 6: only a crest this many pixels either side of the middle (a mohawk).
- `parting`: null, or the angle of a parting line on the crown (0 a centre parting, 60 to one side).
- `curl`: true breaks the outline into curls.
- `parts`: buns and tails. `at` the angle, `row` the height (negative is above the skull),
  `size` a bun's radius or a tail's width (1 to 6), `length` how many rows a tail hangs.
  A ponytail is one tail at 180, pigtails are two at about 110 and 250, a top bun is a bun at row -3.
