# Item format: plants, rocks and driftwood

Plants, rocks and driftwood for a small island survival game, seen from above at an angle (2:1 isometric), in the same
pixel-art style as the characters. You do not draw pixels. You describe a plant as a few parts —
stems, leaves, rounded masses and tiny stamps — and the game grows them by fixed rules, shades them,
makes them sway in the wind and varies them. Choose parts and numbers so the plant reads clearly at
a small size.

## Style

- Pixel art, no outlines, flat colour. The game adds one darker shade for undersides and the far
  side, and one lighter tone where light catches.
- Simple, readable silhouettes. A few large, well-chosen parts beat many small ones.
- Scale: a person is 40 pixels tall. A ground tile is 32 pixels wide and 16 tall (one metre).
- Nothing smaller than half a person: plants at least 20 pixels tall, rocks and driftwood at
  least 20 pixels across. Smaller detail (pebbles, clover, single blades) belongs to the ground,
  not here; the game enlarges anything smaller.
  Typical heights: grass tufts 20 to 35, bushes 20 to 35, small cacti 20 to 30, a saguaro 40 to 60,
  a palm tree 60 to 95. Rocks 20 to 60 across; driftwood 25 to 70 long. Nothing taller than 110
  or wider than 120.

## Colours

Only these palette names may be used:

white, cream, red, orange, yellow, leaf, green, teal, blue, purple, pink, brown, tan, straw, wood,
grey, jungle, lime, moss, sage, bark, stone, basalt, sandstone, driftwood

Greens for plants: lime (yellow-green), leaf (fresh green), green (blue-green), jungle (deep green),
moss (olive), sage (grey-green, cacti). Wood: tan, wood, bark, brown, driftwood (sun-bleached
grey-tan). Stone: stone (warm grey), basalt (dark), sandstone (orange-tan), grey.
Bright colours are for flowers and fruit only.

## Directions

- Up is up. The ground is at the bottom of the plant.
- `turn` is a direction across the ground, in degrees: 0 points to the right of the screen,
  90 towards the viewer, 180 to the left, 270 away from the viewer.

## Output

```json
{ "name": "short name", "category": "palm | grass | cactus | jungle | rock | driftwood", "parts": [ ... ] }
```

Return a JSON array with exactly the number of plants the request asks for. Nothing else: no
comments, no explanation.

## Parts

Every part has a `type` and these optional settings:

- `color`: palette name (not used by stamps). `accent`: a second palette name, used as described per type.
- `count`: 1 to 40 copies of the part (default 1).
- `around`: degrees the copies are spread over. 360 (the default when `count` is more than 1) spreads
  them all round, evenly. Less than 360 makes a fan centred on `turn`.
  Two arms to the left and the right: `"count": 2, "around": 360, "turn": 0`.
- `turn`: see Directions (default 0).
- `at`: where on the parent the part grows, 0 the bottom to 1 the top (default 1). A pair such as
  `[0.3, 0.9]` spreads the copies between the two. Top-level parts grow from the ground.
- `out`: pixels away from the parent's centre line, in the part's direction (default 0). Use it to
  spread blades over a clump or to set fruit beside a trunk.
- `jitter`: 0 to 1, how much copies and variants differ in size and angle (default 0.3).
- `sway`: 0 to 2, how much the wind moves it (defaults: stem 0.3, leaf 1, blob 0.2, stamp 0.6).
  Everything attached to a part bends with it. Cacti, rocks, driftwood, and any part with ribs or
  spines together with what grows on it, never move in the wind.
- The green parts of cacti get spikes by rule; you do not need to add them.
- `children`: a list of parts that grow from this one. Only stems, blobs and rocks have children.
  At most 4 levels deep, at most 600 parts once copies are counted.

### stem

A trunk, stalk, cactus column or branch.

- `length`: 2 to 95 pixels.
- `width`: 1 to 12 pixels, or `[base, tip]` to taper.
- `lean`: degrees from vertical towards `turn` (0 to 110). 90 is horizontal.
- `curve`: degrees added to the lean along the length (−150 to 150). Positive bends further over,
  negative bends back up. A cactus arm that starts sideways and turns upwards:
  `"lean": 90, "curve": -95`.
- `texture`: `plain`, `rings` (bands every three pixels in the shade of `accent` or of the colour:
  palm trunks, bamboo), `ribs` (vertical grooves: cacti), `spines` (light pixels sticking out along
  the edges, in `accent`, default cream), `bark` (speckled shade), `grain` (streaks along the
  length: weathered or bleached wood).
- `cap`: how the tip ends: `flat`, `round` (cacti), `point`, `cut` (pale end grain in `accent`:
  sawn or broken wood).
- A stem on the ground with a `lean` of 60 or more lies on the ground: a log, a fallen branch,
  driftwood. A lying stem with `cap: "cut"` shows end grain at both ends. Give a log its
  thickness with `width` (4 to 9) and branches as children with a smaller lean.

### leaf

- `shape`:
  - `frond`: a rib with leaflets on both sides, like a palm or a fern. `width` is the length of the
    leaflets. Palm fronds read best long, narrow and arching: width 3 to 4, droop 100 to 150.
  - `blade`: a strip that tapers to a point: grass, reeds, agave, iris. `width` is its width at the base.
  - `broad`: a wide leaf, pointed at both ends: banana, monstera, taro. `width` is its widest point.
  - `needle`: a thin straight spike.
- `length`: 2 to 45 pixels. `width`: 1 to 10.
- `rise`: degrees above horizontal where the leaf starts (−60 to 90). 90 points straight up.
- `droop`: degrees the leaf bends down by its tip (0 to 200). 0 stays straight; 90 ends pointing
  down past horizontal from a level start; large values make an arch.
- `accent`: colour of the rib or the stripe.
- `texture`: `plain`, `holes` (slits like a monstera), `split` (torn edges like a banana leaf),
  `striped` (a stripe along the rib in `accent`).

### blob

A rounded mass: a bush, a barrel cactus, a prickly-pear pad, a coconut, a fruit, a flower head, a
rock. It sits on its attachment point.

- `size`: `[width, height]` on screen, 2 to 48 pixels each.
- `texture`: `smooth`, `clumps` (built from rounded clumps with shade between them: leafy bushes),
  `ribs` (vertical grooves), `spines` (light pixels around the edge, in `accent`), `dots` (small
  spots inside, in `accent`: berries, seeds, speckles).
- Children of a blob grow from it: `at` 0 is its bottom, 1 its top; `out` moves them outwards.

### rock

A stone or a boulder: a low faceted mass, shaded facet by facet. Rocks never move.

- `size`: `[width, height]` on screen, 3 to 64 pixels each. Most rocks are wider than tall.
- `facets`: 4 to 10 sides round it (default 7). Few makes a blocky, angular boulder; many a
  rounded, water-worn stone.
- `texture`: `smooth`, `cracks` (a few dark cracks), `speckles` (light and dark grains in
  `accent`: granite, sandstone), `moss` (moss on the upward facets, in `accent`, default moss).
- Several stones together: `count` with `out`, as for any part. Children grow from the top:
  a tuft of grass in a crack, a smaller stone on a larger one.

### stamp

A tiny hand-drawn detail: a flower, a fruit cluster, a seed head. At most 16 by 16.

```json
{ "type": "stamp", "legend": { "R": "red", "Y": "yellow" }, "rows": [".R.", "RYR", ".R."] }
```

- `legend`: one letter per palette colour. An upper-case letter is the colour; the same letter in
  lower case is its darker shade. A dot is transparent.
- `anchor`: `[column, row]` of the pixel that sits on the attachment point (default: bottom middle).

## Example

```json
{ "name": "Short grass tuft", "category": "grass",
  "parts": [ { "type": "leaf", "shape": "blade", "color": "leaf", "count": 9, "out": 1,
               "length": 7, "width": 1, "rise": 70, "droop": 30, "jitter": 0.5 } ] }
```
