# Animal Editor: Spec (from interview, 2026-11-15)

## Goal
An editor for animals in the puppet engine's look, next to the wardrobe, made for Animal Hospital
(`../animal-hospital/PIXEL-ART-SPEC.md`). The 21 Lop Hop animals ship as presets. An animal is a
small JSON description; rules draw it in every facing and animation.

## Decisions
| Area | Decision |
|---|---|
| Body plans | **3**: four-legged (`quad`, 18 animals), two-legged (`biped`: ostrich, dino), upright ape (`ape`: gorilla stands and walks on two legs like a person). No snake |
| Drawing | Parts are rounded 3D masses (ellipsoids, chains of spheres for legs, tails, trunks, horns) posed in 3D, ray-cast in the 2:1 view and lit with the flora light (upper left, a little from the front, tones base / shade / light of the master palette): mostly base, a small highlight, shade underneath, as on the plants' rounded masses. The normal is blended over the parts of one mass, so a body built from several blobs is lit as one smooth shape. No outlines. A part in front of another of the same colour is separated by a shade line on the farther one. No ground shadow in the picture: it is cast from the sun where the animal stands |
| Facings | 4 diagonal facings; 0 (front right) and 3 (back right) are drawn, 1 and 2 are their mirror images, as on the puppet |
| Sizes | 4 squeezed classes, worked out from the drawn height: **small** up to 15 px tall, 1 tile (rabbit, guinea pig, hedgehog, squirrel, skunk, otter); **medium** 16–23 px, 1 tile (cat, dog, fox, wolf, pig, cheetah, boar); **large** 24–36 px, 2×2 tiles (bear, gorilla, yak, ostrich, dromedary, rhino); **huge** over 36 px, 3×3 tiles (elephant, dino). People are 48 px; tiles 32×16 |
| Animations | idle (blink, tail, ears, trunk), walk, run (a hop for hoppers: rabbit, guinea pig, squirrel), sit, eat (head down, chewing; the gorilla raises its hand to its mouth), lie (on its belly with the legs tucked, for the bed). Not "carried" |
| Symptoms | Every frame reports **anchor points** in sprite pixels with a visibility flag: `eye`, `nose`, `mouth`, `top`, `head`, `body`, `back`, `foot` (the names `animal-hospital/src/symptoms.js` uses). The game draws symptoms there. The editor has a symptom picker that draws them the same way to test the points |
| Look | As cute as the Lop Hop animals: their proportions (`lop-hop/assets/*.js`): a head about as big as the body is deep, a short snout, short legs with little showing under the body. Eyes as Lop Hop draws them: a dark mark 2 px tall (1 px on a tiny head, 2×2 on the huge ones), no white, a line when blinking, always inside the face, never on the outline. Both eyes show when the animal faces the viewer |
| Painting | Clean-up passes after the render, as a pixel artist would: single pixels poking out of a body cut and one-pixel notches filled; doubles (the corner pixel of an L) dropped on one-pixel lines; lone tone specks merged; sel-out: the edge away from the light (right, below) in the shade of its own colour, never black. Light only on the big masses. Hue shift comes from the palette ramps (plum shade, cream light). No outer anti-aliasing: the sprite goes on any ground. Patterns are implied: stripes are straight one-pixel lines on the upper half, spots single pixels, spines broken strokes |
| Fur | `fur` (0 smooth skin to 1 shaggy) borrows the people's hair: a tuft breaking the top outline here and there, clumps hanging in shade under belly and tail, tone edges broken into diagonal strands. Placed by the spot on the body, so it moves with it |
| Secondary motion | The tail wag travels from root to tip, and ears and tail trail the body's bounce by a frame (`drag`): ears flop back as the body rises, lop ears lift and flare as it drops. Walks dip on each footfall so there is a bounce to follow |
| Reading | Learnt from a reference set of pixel-art animals: a lit rim along the top edge of every big part (the counterpart of the sel-out); three planes (lit top, base flank, the lower third in shade); feet in the shade tone; a stroke of the nose colour down the middle of pointed, tall and round ears; on large heads (5.4 px and up, after the `eye` size: pigs and boars have small eyes) a 2×2 eye with one light glint towards the light. Four-legged animals' hind legs bend backwards at the hock (thigh forward, shin back, long foot down) |
| Colours | Master palette only. Roles: fur, second (belly, chest, muzzle, face...), third (saddle, spots, socks...), nose, horn (horns, tusks, beak, hooves). One base added for animals: `piglet` (light pink); it is not offered for clothes |
| Saving | Like the wardrobe: a named list on the device (save, save as, delete), export and import as JSON (`type: "pixel-animal"`) |
| For the game | Compose at load time: import `engine/animals/animal.ts` through the Vite alias and call `drawAnimal(animal, clip, frame, facing)`, which returns the sprite and the anchors. Or bake: `npm run bake` also writes every preset × clip × facing into the atlas, with the anchors per frame in `atlas.json` |
| Publish | Linked from the start page, part of `build:site` |

## The description
```jsonc
{
  "plan": "quad",            // quad | biped | ape
  "scale": 1,                // everything at once
  "length": 8, "girth": 4, "width": 0.9,   // body: spine length, vertical radius, side radius as a share of it
  "tilt": 0,                 // spine angle in degrees (biped and ape lean)
  "legs": 5, "legWidth": 1.2, "arms": 0,   // arms: ape arms, or the biped's small arms
  "neck": 2, "neckAngle": 40,
  "head": 3.5, "muzzle": 2, "muzzleWidth": 1.6, "snoutDown": 10,
  "ears": "pointed", "earSize": 2, "earColor": "fur",
  "tail": "bushy", "tailLength": 8, "tailUp": 20, "tailCurl": 0,
  "hump": 0, "humpAt": 0.5, "horns": "none", "hornSize": 0,
  "trunk": 0, "features": ["blush"],      // blush, teeth, spines, wings, beak
  "marks": ["belly", "muzzle"],           // belly chest muzzle face blaze hood saddle stripe bands spots patches socks tailTip
  "colors": { "fur": "orange", "second": "white", "third": "brown", "nose": "black", "horn": "cream" },
  "hops": false
}
```
Unknown or missing fields fall back to the default when a file is read, as with characters.

## Settled while building
- Ears: none, tiny, round, pointed, tall, lop, flap. Tails: none, stub, thin, tuft, bushy, thick, plume. Horns: none, horns (two, curved: yak), nose (rhino), tusks.
- The editor's labels are English only for now; the start page card has German text too.
