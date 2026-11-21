# Plan: 2D pixel-art survivors

Date: 14 November 2026. Follows the 3D prototype and the feedback on it.

## Feedback and what it changes

| Feedback | Consequence |
|---|---|
| The bought 3D characters look good but every new item would have to be modelled or bought | Stop treating 3D items as the content format |
| Reference image: small hand-pixelled people, no outlines, flat colours | The target style is true 2D pixel art, not a filtered render |
| A low-resolution 3D render is not convincing pixel art: shapes are accidental, outlines and shading do not fit | Pixels must be placed by rules or by an author, never by a rasteriser |
| Content has to be generated quickly and automatically | The item format must be something a language model can write reliably |

## Target, from the interview

| Topic | Decision |
|---|---|
| Sprite size | About 32 by 48 pixels |
| Facings | Four diagonals: two drawn, two mirrored |
| Animation | Classic: 4 to 6 frame walk, 3 or 4 frames per action |
| Style | Like the reference: no outline, flat colour with one shade, large head, simple face |
| Workflow | Generate, then curate: several candidates per request, a person picks and may fix pixels |
| Generation tools | A language model only. No image-generation services |
| Hand-made art | None from scratch. People review and touch up, including the base body |
| Customizable | Clothing and its condition; hair, beard and skin; tools and carried items. No body builds |
| Game needs | Design your survivor; looks change during play; generated other survivors |
| Curation tool | Candidates shown on the animated character in all four facings; regenerate with a note; pixel touch-up |
| 3D prototype | Kept for comparison and as a helper for producing assets |

## The core problem

An item must look right in every frame of every animation, in every facing. With about 40 frames and two drawn facings, that is about 80 images per item. A language model drawing 80 images per item would be slow and inconsistent, and nobody is available to draw them by hand.

So an item has to be **defined once and multiplied by the system**. The 3D prototype had this property. The plan keeps the property and drops the 3D look.

## Proposed architecture: a pixel puppet

**Poses are data, drawing is rules.**

- A pose is a small set of joint positions (head, shoulders, elbows, hands, hips, knees, feet) in the character's own 3D space, in pixel units.
- A renderer projects the joints for the wanted facing and draws the body with fixed pixel-art rules: limbs as clean pixel columns, the torso as a simple block, far-side limbs in the shade tone, no outline.
- Because poses are 3D, all four facings come from one pose. Eight would also work later.

**The head is a rigid stamp.** It only moves by whole pixels, so everything on it is a small fixed pixel image per drawn facing: face, hair, beard, hat. This is where deliberate pixel placement matters most, and where it is cheapest: two small images per item.

**Clothing is paint on the standing pose.** A top or bottom is defined by how it colours the body in the standing pose, front and back. The renderer knows which body part and which position along it every pixel belongs to, in every frame, so it carries the paint to all frames.

**Tools and carried items are rigid stamps** attached to a hand or the back.

**One master palette.** Every colour is a palette entry with a paired shade. This is the strongest tool for making generated items look like one set, and it gives recolouring and fading for free.

What this gives each game need:

| Need | How |
|---|---|
| Design your survivor | Same slot-and-colour editor as the 3D prototype, drawing the puppet instead |
| Looks change during play | Wear is a parameter: ragged hems, holes and fading are applied by rule to any garment. Beard growth is a generated series of stamps. Crafted gear is ordinary items |
| Generated other survivors | Random valid combinations, as in the prototype |

## Generation pipeline

1. **Request.** A short description, for example "torn striped shirt".
2. **Generate.** The language model returns several candidates as text in the item format.
3. **Check automatically.** Format valid, palette entries only, paint stays on allowed body parts, stamp within size limits. Invalid candidates are dropped or sent back with the error.
4. **Preview.** Each candidate is drawn on the animated character in four facings.
5. **Curate.** A person picks one, optionally asks for a change in words, optionally fixes pixels.
6. **Catalogue.** The accepted item is stored as data. No image files are needed.

## What the 3D prototype is still for

- **Comparison.** The same character at the same size, rendered from 3D without outlines, shown next to the puppet.
- **Motion source.** Its 31 animation clips can be sampled at key moments and turned into puppet poses, instead of authoring every pose by hand. Whether that looks right at this size is one of the experiments.

## Experiments

Three small tests on the same handful of items, so the choice rests on results. Items: torn striped shirt, ragged shorts, straw hat, castaway beard, fishing spear.

| Test | Question | Compared |
|---|---|---|
| 1. Foundation | Does a rule-drawn puppet read as real pixel art where the 3D render did not? | Puppet against the 3D render at the same size, both without outlines, walking in four facings |
| 2. Motion source | Can the 3D clips feed the puppet? | Walk cycle authored as key poses against a walk cycle sampled from the 3D clip |
| 3. Item generation | Which item format does a language model write well? | Whole-sprite pixel grids against structured recipes with small stamps. Three candidates per item per format, from fresh model calls, shown unedited |

For test 3 the model calls are made from this session as stand-ins for an automated pipeline. Each call gets only the format description and the request, as an automated call would.

Results are in the last section of this document and on the comparison page built from `lab/`.

## Decisions still open

1. **Where the model runs in production.** A curation tool that regenerates on request needs live model access: an API key and a small server, or a hosted alternative. Not needed for the experiments.
2. **Palette.** Size and colours of the master palette. I will start with about 32 colours suited to an island: sand, sea, foliage, wood, cloth, skin tones.
3. **Engine.** Still open. The puppet is plain 2D drawing and ports to any engine; the catalogue is data.
4. **Sprite cache.** At runtime the puppet can draw each frame on demand or bake a sprite sheet per character when its look changes. Baking is the likely answer for mobile.

## After the experiments

1. You pick the item format and the motion source from the results.
2. Build the curation tool around that format: candidates on the character, regenerate with a note, pixel touch-up.
3. Generate a first real catalogue of about 30 castaway items and judge consistency.
4. Rebuild the wardrobe and the island scene on the puppet.

## Experiment results

Run on 14 November 2026. Code and all generated data are in `lab/`. To view the comparison page, run `npm run dev` and open `/lab/`.

The observations below are mine, from looking at rendered frames. The page shows everything unedited so you can form your own view.

### 1. Foundation

A 32 by 48 puppet drawn by rules walks in four facings and wears generated items. Next to it, the 3D prototype rendered at the same size without outlines.

- The puppet has straight limb edges, even patterns and a face made of chosen pixels. The 3D render has uneven edges and stray pixels, and its silhouette shifts between frames.
- The puppet is stiffer: a rigid torso block and limbs without volume.
- The base body, face and short hair were written by the model and corrected by looking at renders. The first version was judged too plain; see the next section.

### Base body, second version

Feedback on the first body: too plain and generic, one arm looked off, and the spear was not held. It was rebuilt on 15 November 2026 after researching the style ([pixel-style-research.md](pixel-style-research.md)).

- **Arm.** True isometry put one shoulder two pixels above the other, so the far arm hung from the neck. Sideways offsets inside the body are now flattened, as hand-drawn sprites do.
- **Grip.** A pole stands on the ground beside the body, the arm reaches out to it, and the fist is drawn over the shaft, front and back.
- **Face and hair.** Taller eyes with a shine, blush, an open smile, a blink and a laughing face. Hair in clumps with a tuft and a lit band.
- **Body.** Hands and feet as visible blocks, legs with a gap, a shaded edge where the arm crosses the body, shadows under the chin and on the ground.
- **Colour.** One rule derives every shadow (towards plum) and highlight (towards cream).
- **Motion.** A breathing idle, a lean in the walk, and the hat arriving one frame late.
- **Facings.** The two left facings are now exact mirror images of the right ones, as in Stardew Valley.

Still plain: the torso is a block, the back view has little to look at, and there is one body and one hairstyle. The generated items were drawn against the first body and are shown on the second unchanged.

### 2. Motion source

- Sampling the 3D clips works. Only bone directions are taken, so the source character's proportions do not matter. All 31 clips are available this way; idle, walk, run, wave and chop were tried.
- Sampled motion carries the source's posture (arms held away from the body, bent knees). It suits actions; the hand-written walk is tidier.
- A pole stays planted beside the body in every action. Tools that swing still need rotated variants.

### 3. Item generation

Ten fresh model calls, three candidates each, given only the format description and the request.

| Format | Valid as returned | Rejected | Time per call |
|---|---|---|---|
| Whole-sprite paint | 15 of 15 | 0 | 82 to 116 s |
| Recipes and stamps | 15 of 15 | 0 | 5 to 6 s for clothing, 116 to 195 s for stamps |

Times include the overhead of running each call as a helper inside the working session, so they are relative, not absolute.

- Clothing recipes are fastest and cannot come out misshapen, but express only what their settings allow.
- Whole-sprite paint is freer. It produced a patch and a contrasting frayed hem the recipes had no setting for.
- For tools, whole-sprite paint was clearly better: straight shafts with readable tips. Stamp versions leaned and broke into jagged lines.
- Both formats drew beards wrongly in back views, as a tuft at the neck.
- Recipe shorts came out very short because of the length scale in my format description.
- Two frame-size limits in my own code clipped whole-sprite hats and spears on the first pass. I fixed the code; nothing was regenerated.

### Third pass and the wardrobe prototype

Requested on 15 November 2026: push the body further, add a second hairstyle and a second build, keep the hat attached to the head, and provide a prototype for testing customization.

- **Hat.** The one-frame delay on hats is removed. A hat is rigid on the head.
- **Second build.** A sturdy build with an 11-pixel torso and wider legs. Clothing drawn for the slim build is fitted by repeating one column on each side of the middle, so no item needs a second drawing.
- **Second hairstyle.** Long hair with a lock in front of the ear, a mass behind the neck in front views and a fall over the upper back from behind.
- **Body.** A shadow under the fringe or hat brim, a lit shoulder corner, a hint of the spine on the bare back.
- **More items.** Nine further model calls produced 33 candidates (tops, bottoms, shoes, bandanas, caps, vests, leaf skirts, axes, fishing rods). All 33 were valid as returned. Tops, bottoms, bandanas, caps and vests look good to me; the axes are small and unclear and the fishing rods are thin and lean.
- **Wardrobe.** `wardrobe/` is a page for dressing the survivor: skin, build, hairstyle and colour, beard, hat, top, bottom, shoes and tool, with colour swaps per item, five actions, four facings and four ground colours. It holds 57 items: everything generated so far except the two sets excluded for known faults (the leaning small-stamp spears and the first, too-short recipe shorts).

Two rules are applied on top of the generated data: beards are hidden from behind, and a beard takes the hair colour.

### Fourth pass

Requested on 15 November 2026.

- **Tools in the hand.** A tool's grip is pinned to the hand in every frame; nothing stands on the ground any more. A long tool is carried with the arm held out so the shaft clears the head.
- **Rotating tools.** In swinging actions the tool turns with the forearm in steps of 45 degrees, as if held like a hammer. Long tools only tilt by one step so they stay on the canvas. Rotation is computed from the one drawing of the tool.
- **Tucked hair.** Under a hat that covers the crown, hair above the hat's lower edge is removed by rule, so nothing pokes through or bulges beside it. A band such as a headband leaves the hair alone.
- **Canvas.** Sprites are now drawn on a 64 by 64 canvas with the 32 by 48 body in the middle, which gives swung tools and wide hats room. The whole-sprite format still paints on 32 by 48.
- **Third build.** Very slim: a 7-pixel torso, 2-pixel arms and 3-pixel legs. Clothing is fitted by dropping one column on each side.
- **Gender.** A feminine body shape narrows the waist on the far side and adds a chest shadow; clothing follows both by rule. It also turns on eyelashes by default.
- **Faces.** Composed from options: four eye shapes, seven eye colours, three mouths, three brow weights, and blush, freckles, lashes and glasses.
- **Everyday clothes.** Eight further model calls produced 30 items for passengers and crew before the wreck: suit, officer's and cook's jackets, sailor shirt, hoodie, blouse, three dresses, jeans, suit trousers, pleated skirt, polo, jumper, shoes, sailor cap, cook's hat, sun hat, suitcase, umbrella, lantern, and three hairstyles (bun, afro, bob). 29 were valid as returned and one was auto-repaired (a hood reached past the torso area).
- **Wardrobe.** Option cards now show only the item, cut out of the sprite. There is a Face tab, a gender switch, three builds, generated hairstyles, and a filter between castaway items and items from before the wreck. It holds 87 items.

A fault found and fixed on the way: mirrored facings were one pixel off-centre.

### Fifth pass

- **Waist.** The feminine shape is now an hourglass: the waist is drawn in on both sides (two pixels each on the slim and sturdy builds, one on the very slim build), with a one-pixel step above and below, so a gap shows between waist and arm. Clothing is cut to the same line.
- **Skirts.** Anything a top or bottom paints below the hips is treated as a skirt. Each of its rows is stretched towards whichever knee has swung out, more so towards the hem, so a dress follows the stride instead of hanging as a fixed block. Painted bottoms that flare past the legs (the pleated skirt, the leaf skirts) are now kept whole for this; trousers and shorts still become a waist plus a strip per leg.
- **Headbands.** Whether a hat covers the crown is now measured where the top of the hair sits. A headband paints nothing there, so the hair above it stays; caps, straw hats and head-wraps still tuck the hair.

`scripts/pass5.mjs` renders the check sheet for these three.

### Sixth pass

- **Condition is a value of the character.** Items are drawn once, neat. A level from 0 to 3 (neat, worn, ragged, tattered) ages them by rule (`engine/character/wear.ts`): hems fray, stains appear in small blocks, holes open, a patch appears from "ragged" on, sleeves and trouser legs shorten from the free end, a skirt frays at the hem, boots slump and lose their cuff, shoes scuff and finally open at the toe, and hat brims fray. Damage is decided per pixel from the item's name, and each level keeps the damage of the one before, so a character can move up the levels during play without the damage jumping around. Tools do not age.
- **Hair follows the condition.** Stray pixels break the outline, the gloss goes, the ends grow down in clumps and the fringe creeps over the forehead, never past the brows. Beards grow longer.
- **A smaller list.** The 15 candidates that were drawn ragged (torn shirts, cut-offs, patched trousers, the cropped rag, the ragged vest) are left out of the wardrobe, along with two duplicates and the two colour-only shoes that the new footwear replaces. Jeans at "tattered" are cut-offs; nobody has to draw them.
- **Hair.** Three further model calls produced nine hairstyles: high ponytail, pigtails, long braid, mohawk, side parting, buzz cut, long wavy, tight curls, shoulder-length with a centre parting. All nine were valid as returned. The format gained an optional third stamp for hair that hangs behind the head and body in the front view; five of the nine used it.
- **Footwear.** The shoe recipe gained a sole colour, a shaft height, a cuff and an open form for sandals. One model call produced eight: tall boots, ankle boots, rubber boots, hiking boots with socks, trainers, sandals, flip-flops, fur-trimmed winter boots. All eight were valid as returned. A boot's shaft is paint on the lower leg, so it bends with the knee like trousers do.
- **Belly.** The sturdy build carries a belly: the lower torso stands out up to three pixels on the side the character faces, lit on top and shaded underneath. Clothing that reaches the edge of the body is carried out over it.
- **Beards from behind.** The back view of a beard is now worked out from its front view: whatever stands out past the jaw on the side the face points to, above the shoulders. Big beards show; small ones do not.
- **Glasses** take one of nine frame colours.
- **Languages.** The wardrobe's text lives in `tools/wardrobe/i18n.ts`, English and German, with a switch in the header. The compiler checks that a language has every key. Item names come from the model in English; other languages carry a name per catalogue id and fall back to English, and the development build reports ids without one.

`scripts/pass6.mjs` renders the check sheets (wear, belly, shoes, hair).

### Seventh pass

- **Belly, smaller.** It now stands out one pixel, two at its fullest, low on the torso.
- **Mood is a value of the character**, like its condition: neutral, smiling, happy, laughing, sad, angry, surprised. It decides the mouth, the brows and how open the eyes are. Anger lowers a heavy brow onto the inner corner of the eye, sadness lets the outer corner droop; the lid is drawn in skin so the eye itself changes shape. The mouth is no longer a face option. A cheerful action such as waving shows a laugh unless the mood is a dark one.
- **Condition is continuous.** It runs from 0 to 3 in quarter steps on a slider; the limits of every wear rule are interpolated, and each step still keeps the damage of the one before.
- **Motion, all written by hand as key poses now.** Idle stands still and blinks every three seconds. Wave moves only the arm, held far enough out to show from behind. Run is rewritten: a small lean, elbows at a right angle swinging against the legs, the free knee carried high. Chop is replaced by a generic "use": one foot forward, the right arm works out to the side where it reads from the front and from behind. A short tool turns with the forearm; a long one stays tilted forward and is thrust.
- The poses sampled from the 3D clips remain in the lab page as the comparison they were, but the wardrobe no longer uses them.

`scripts/pass7.mjs` renders the check sheets (moods, motion, belly).

### Foliage

The same approach, extended to plants (`engine/flora/flora.ts`, page `flora/`).

- **Format.** The model never paints a plant. It writes a small tree of parts: `stem` (trunks, stalks, cactus columns and arms: length, taper, lean, curve, texture, cap), `leaf` (frond, blade, broad or needle: length, width, rise, droop, texture), `blob` (bushes, barrel cacti, pads, fruit: size and texture), and `stamp`, a tiny text grid for details such as flowers. Copies are spread round the stem or over a fan, at a range of heights. The description is `docs/specs/spec-plant.md`.
- **Rules.** Parts grow in 3D and are projected in the same 2:1 view as the characters, sorted by depth, and shaded with the shared palette: stems lit on the left, leaf undersides and fronds that point away in shade, bushes built from shaded clumps, one ground shadow under the canopy and one under each stem. Five plant colours were added to the palette (jungle, lime, moss, sage, bark); they are kept out of the clothing colours.
- **Variants, wind, season.** A seed varies sizes and angles within each part's jitter, and odd seeds are mirrored. Wind is eight frames: the whole plant bends with height by the amount of the part that grows from the ground, so a crown stays on its trunk; leaves, fruit and flowers also flutter towards their tips; a storm adds a steady lean. Hard plants do not move at all: cacti, and any ribbed or spiny part with everything that grows on it, whatever their description says. Dryness from 0 to 1 is the plants' version of the clothing condition: leaves droop, turn olive then straw or brown in patches, tear and drop, and flowers and small fruit go first.
- **Size.** A grow option from 0.5 to 2, set where the plant is placed rather than in its recipe. It scales lengths, widths, spacing and masses before drawing, so pixels stay one pixel and rings, ribs and spines keep their spacing; hand-drawn stamps keep their size. The same seed has the same shape at every size. Plants larger than 1 get a larger canvas (`canvasFor`).
- **Generation.** Four model calls, one per group, produced 19 plants: three palms, six grasses and ground covers, four cacti, six jungle plants. All 19 were valid as returned, none needed clamping, and none ran off the canvas. Palms, the saguaro, the prickly pear, the hibiscus bush and the bamboo read well to me; the monstera reads as a dark lettuce, and the grasses are correct but small, as they should be at this scale.
- **Page.** A preview with four variants, size, wind, season and ground, the person for scale, colour swaps, and the model's recipe in an editor that regrows the plant as you type and keeps edits in the browser. An island scene scatters the current group round a survivor, each plant within 80 to 120% of the chosen size. English and German.

`scripts/flora-sheet.mjs` renders plants to sheets (variants, wind frames, drying stages, sizes).

#### Rocks, driftwood, terrain (second foliage pass)

- **Rocks** are a new part type: a low mesh of three rings and a top, wobbled by the seed, each facet lit once by its direction and painted flat in one of the three tones, nearest facet in front. Textures: cracks, speckles, moss on the upward facets. **Driftwood** needs no new part: a stem on the ground leaning 60° or more lies down and rests on its side, with a `grain` texture and `cut` ends that show pale end grain. Both are rigid. Four colours were added (stone, basalt, sandstone, driftwood). One model call each gave six rocks and four pieces of driftwood, all valid as returned.
- **Smallest size.** Nothing is smaller than half a person (20 pixels): plants by height, rocks and driftwood across. A plant that comes out smaller is grown again, larger, with the same seed and shape; that also sets the floor of the size slider. Small detail belongs to the ground. The grass group was regenerated with the new rule in the format description: six tufts of 22 to 39 pixels instead of the 5 to 14 the old description asked for, all valid.
- **Colour swaps by kind.** A colour can only be swapped within its family: greens (and straw), woods, stones, or bright colours for flowers and fruit.
- **Shadows** are a separate mask on each plant picture, not see-through pixels. Scenes collect all masks and darken the ground once, so overlapping shadows no longer add up.
- **Spikes.** Every green part of a cactus gets spikes by rule: staggered light ticks along the edges of stems and around the outline of rounded parts, and areoles down the ribs.
- **Round shapes** are lit as spheres: a highlight up and to the left, away from the edge, and a shaded crescent on the lower right. Bush clumps are each lit that way, and clumps on the shaded side of the bush stay in shade.
- **Terrain** (`engine/world/terrain.ts`): a height map of whole levels per one-metre tile, level 0 the water line, 8 pixels per level. Surface, cliffs, foam, walking (`canStep`) and placement follow from the heights. The flora page's scene is now a 16 × 16 generated island; each group grows on the surfaces it belongs on, and higher ground in front hides what stands behind it.
- **Slopes.** Each tile's corners take the average of the four tiles round them, kept within one level of the tile; neighbours up to two levels apart share a slope, larger steps stay cliffs. Slopes are lit by their direction, low ground is sand whatever the tile, and the sea floor slopes too: water is laid over everything below level 0 in bands by depth (foam, sand showing through, shallow, deep), so beaches run into the sea in curves.
- **Site.** The start page (`index.html`, `home/`), the wardrobe and the flora tool are published with GitHub Pages at andreashackel.de/pixel-art/ (`npm run build:site`, `.github/workflows/pages.yml`). The 3D prototype moved to `prototype/`; it and the lab stay out of the published site. Island scattering and painting is shared by the flora page and the start page (`engine/world/island.ts`).
- **Export.** `scripts/bake.mjs` bakes the catalogue to atlases (trimmed frames, pivots, animations, shadow masks, duplicates stored once): 1,189 frames, 730 different, two 1024² pages, in about a second. `docs/export.md` covers baking at build or load time, composing characters once per look, palette-indexed recolouring, sorting, wind phases, shadow layers and terrain chunks.

### Recommendation

1. Build on the puppet.
2. Use both formats by item type: recipes for plain clothing and wear states, whole-sprite paint for anything with a distinctive shape. Both compile to the same item data.
3. Write poses by hand. The sampled run and chop carried the 3D character's posture and were replaced by hand-written key poses in the seventh pass; a clip is three to five key poses.
4. Expect curation. By my count about 18 of the first 30 candidates are usable as returned. The recipe shorts and stamp spears need a retry.
5. Ask the model for neat items only. Wear, fit to the build and the back of a beard are rules, and they apply to everything already in the catalogue.

### Not tested

- Consistency across a large catalogue. Fifteen candidates per format is a small sample.
- Regenerating with a note, pixel touch-up.
- Wear and motion were judged from still frames and the wardrobe's loops. Whether wear reads well as gradual change during play is untested.
- Hair falling behind the shoulders, backpacks. Skirt motion is a horizontal stretch only; the hem does not lift or lag.
