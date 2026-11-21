# Pixel-art style research

Date: 15 November 2026. Done to rebuild the base body after the first puppet was judged plain and generic.

## How reliable this is

Almost every tutorial, wiki and developer site was blocked from the research environment. Only GitHub could be read directly. In the lists below, **read** means the page itself was read, and **summary** means the claim comes from a search-result summary and was not checked against the page. Points marked *practice* are standard pixel-art practice that no source confirmed in this session.

## What makes small characters appealing

Ordered by expected effect on a plain sprite.

| # | Principle | Applied to the puppet |
|---|---|---|
| 1 | The silhouette should be recognisable when filled solid. Add one feature that breaks the outline | Hair tuft; hat brims and held tools already do this |
| 2 | Face clearly lighter or darker than hair | Yes, by palette |
| 3 | Shift hue along every colour ramp: shadows cooler, highlights warmer. Never darken by brightness alone | One rule derives every shade (towards plum) and highlight (towards cream) |
| 4 | One light, above and slightly in front. No shade ring around a shape | Far-side limbs and torso edge in shade, shadow under the chin |
| 5 | Separate overlapping parts of the same colour with a shade step, not a line | Shaded inner edge on the near arm |
| 6 | Eyes 2 to 3 pixels tall with one shine pixel in the same corner of both | Yes |
| 7 | Hair as a few large clumps with a highlight band, never strands | Yes |
| 8 | Chunky limbs, feet wider than legs, hands as visible blocks (*practice*) | Yes |
| 9 | Walk bob of 1 to 2 pixels, arms against legs; a breathing idle with a blink; hair or hat one frame late | Yes |
| 10 | A soft ground shadow about the width of the feet (*practice*) | Yes |

Other points worth keeping:

- Head size of a third to half of the sprite is normal for small characters. Ours is about 40%.
- A whole sprite should stay under about 16 colours.
- Skip dithering and anti-aliasing at this size. Remove single stray pixels unless they are an eye, shine or button.
- An outline-free sprite depends on contrast with the ground, so judge it on the real floor tiles.
- Clothing reads through a hem, collar or belt line and a contrasting trim, not through folds.
- A common walk is 4 key poses mirrored to 8 frames, or 6 frames, at about 8 frames per second.
- No source was found on how to draw a hand gripping a tool. The puppet draws the item first and the fist over it, which is *practice*.

## How shipped games build layered characters

**Stardew Valley** (read: decompiled `FarmerRenderer.cs`)

- Hair, hats, shirts and accessories are small static sprites with one row per facing. They are not redrawn per animation frame; two offset tables move them with the body.
- Left-facing sprites are the right-facing ones flipped.
- Draw order is body, pants, eyes, shirt, accessory, hair, hat, with the arm drawn again on top.
- A hat can switch the hair to a "covered" variant.
- Skin, eyes, shoes and sleeves are recoloured by swapping fixed palette pixels.

This is the puppet's approach: an item is drawn once per drawn facing and carried by the body.

**Habbo** (read: Avatara and shroom repositories)

- An avatar is a list of typed parts with colours. Head and body direction are separate inputs.
- Draw order is looked up per direction and action, and changes when an item is held.
- A separate hair part is used under hats (summary).

**Liberated Pixel Cup character generator** (read: repository)

- Every item is a full sprite sheet for every animation, and the project notes that many items are missing for newer animations. This is the cost the puppet avoids.
- Useful conventions: a numeric layer order (shadow, back hair, body, legs, torso clothing, head, front hair, hats, tools) and long items split into a behind layer and a front layer.
- Licences are mixed per asset and several forbid protected distribution, which rules its art out for a store build.

**Others** (summary only)

- Ragnarok Online attaches head, headgear and weapon to the body through per-frame anchor points.
- Witchbrook builds more than 60 clothing items on five base masks. Our clothing recipes work the same way.
- Soulbound locked skeleton, frame count and proportions early, and made new actions by reordering existing base frames.
- A lookup-texture technique stores, in each animation frame, where every pixel comes from in a source image painted once. It is flexible but each frame's mapping is authored by hand.
- No technical evidence was found for Kairosoft's games, the closest visual match to the reference photo.

## Quality pass, November 2026

Weak points found by rendering every facing and the walk (`node scripts/review.mjs sheet.png`) and by the parts check (`node scripts/parts-check.mjs`, below), what shipped games do about each, and what was changed. The game references are *practice* as described in the sections above, not newly read sources.

| Problem | How games handle it | Change |
|---|---|---|
| Hats and model-drawn hair were drawn only in 3/4, so face on and from behind a cap's peak still pointed sideways and a fringe sat off the face | Stardew Valley and Habbo draw a hat and a hairstyle once per facing and keep front and back symmetric | `faceOn` in `engine/core/puppet.ts` works out the front and back view from the 3/4 stamp: the face side (or the back) is stretched to the full width and mirrored, so a peak becomes a visor band, a fringe opening centres over the face and a ponytail hangs down the middle. Hats keep each half's own colours so a badge is not doubled |
| A recoloured beard turned brown side on, a recoloured shoe kept its old sole | — | `mapCells` in `engine/character/catalog.ts` now recolours the view stamps and the sole too |
| Walk legs kicked far back and read as broken | Small sprites keep strides short: legs stay near upright, the passing foot lifts a pixel or two, it is not flung behind | Smaller leg swings and knee bends in the walk; the run's rear kick reduced |
| Side on, a carried spear ran through the face | Side-on sprites carry poles sloped forward | A long tool leans forward 45 degrees in the side view |
| Outline-free sprites, white shirts and straw brims faded into sand | Selective outline ("sel-out"): the silhouette edge in a darker tone of its own colour, darker on the side away from the light | `rimmed` in `engine/core/puppet.ts`: outline pixels with empty space right or below go one tone down their own ramp (`darker` in `engine/core/palette.ts`). No new colours |
| One-pixel seams between ground tiles let the open sea show through | — | `renderTerrain` fills a pixel left unpainted between two painted ones with the ground above it |
| A bandana's knot tails showed beside the face face on; a braid became two; a mohawk was doubled from behind | Things that hang behind the head are hidden from the front; a braid over one shoulder stays on that shoulder | Face on, a hat's rows with nothing on the face side are left out; hanging hair that stays narrow all the way down (a braid, a ponytail) stays one strand on the same side, a broad mass falls on both sides; from behind each half keeps its own colours |
| Hair drawn for 3/4 covered the face side on, and mirrored rows covered a cheek face on | Hair frames the face from every side | Hair is never drawn over the face's features or between them, in any view (`offFace` in `drawFigure`) |
| Turning to the left swapped the tool to the left hand (the left views are mirror images), and a wave could be done with the hand holding the spear | Characters stay right-handed; a mirrored view mirrors the pose too | The left views draw the pose done the other way round and then flip the picture, so the right hand always holds and works, behind the body where it is the far hand |
| A waving arm came loose: raised at a slant, its elbow was behind the head, and side on it did not show at all | A wave is drawn with the elbow out at shoulder height and the forearm up, clear of the head | A new wave pose; a raised near arm is drawn over the head; side on the near arm waves, raised forward in front of the face |
| An arm held out sideways started a pixel or two away from the shoulder | — | `drawLimb` draws a joint block at the shoulder and hip too |
| The waist was drawn in side on, and two pixels deep face on it looked like a wasp waist | — | One pixel in over three rows (one row on the slimmest build), and no hourglass side on |
| A woman's figure had no bust from the side; a sturdy build was a plain block side on | Profiles show the bust and the belly | Side on and in front 3/4 the bust stands out at the front, two pixels deep on a sturdy build; a sturdy build's belly runs from under the chest to the hips, swelling to two pixels and rounding back in; pixels that overhang the row below are in shade |
| Short hair hid the ears face on and in 3/4 but not side on; side on the ear sat a pixel too far back; the side beard was the 3/4 one moved over, behind the ear; the face-on beard had bare cheeks; long hair side on had a ragged edge round the ear; the face-on jaw looked square; a slim body was flat side on | Ears and sideburns agree in every view; hair edges are clean curves | Short hair ends above the ears, with a sideburn in front of them, in every view; the side ear moved forward next to the sideburn; a beard without its own side view is narrowed to run from in front of the ear to the chin, covering the jaw back under the ear; face on, the beard covers as much of the cheeks and sideburns as the near side does in 3/4; long hair side on covers the ear with a curved edge sweeping back; the face-on jaw tapers a row sooner; slim builds have a one-pixel curve from chest to stomach side on |
| Ears showed in some views and were hidden in others for the same hairstyle | A hairstyle covers the ears all round or none | Whether the hair covers the ears is decided once from its 3/4 drawing; every view then hides them (hair fills the ear, or the ear's bump is left out) or keeps hair off them |
| Puffed sleeves fitted to a narrow build or seen side on floated beside the body | — | Above the hips a top only reaches past the body where it carries on from its edge; side on not at all |
| A foot lifted behind the body was a flat block | A pushing-off foot tips toe down | Seen from the side or in 3/4 it narrows to the toes under the shin |
| Coast waves followed the sea floor, which is drawn up to 11 pixels lower than the water surface over it | Waves belong to the surface | The terrain image keeps the depth under each pixel's point of the water surface (`depth`), and waves and wavelets are placed by it |
| Open-sea ripples were long single-pixel lines that read as scan lines | Pixel-art seas use short, sparse wavelets: a pale crest with darker ends | Wavelets of up to 7 pixels with their ends turned down a row in the dark colour |
| Catalog hairstyles only had 3/4 views; side on they reused the 3/4 front, leaving the back of the head bare, and the mohawk's crest sat off the middle from the front and behind | Every view of a style shows the same haircut | Side on, a catalog style is built from both 3/4 views: the back view behind the ear, the front view narrowed in front of it, the crown from the front view alone. The mohawk has hand-drawn front, back, side and 3/4 back views, and holes left inside shaved stubble are filled. The parts check now colours the ears and fails a hairstyle or hat whose ears show in some views but not in others |
| Hair moved rigidly with the head | Secondary motion: loose parts follow through a frame late | Hair hanging below the ears lags the body's rise and fall by a pixel in the walk and run, and trails a pixel behind at a run. The scalp stays put, so short hair and hats never move |

### The parts check

`scripts/parts-check.mjs` draws characters with the `parts` option, every part flat in a colour of its own (`PART_COLORS`: legs, torso, clothes, the working and the free arm, tool, head, face features, hair, hat, beard, hair behind), for every hairstyle, hat and tool and all builds, from all eight sides through their clips, and every top and bottom, and reports an arm piece not joined to the body, a tool out of the hand, clothes floating off the body, hair or a hat over the face, hair floating off the head, a head off the body, and hair or a hat that mostly vanishes in one view. With a file name it draws the failing frames there, normal and in parts colours. It found the shoulder gap and the thin build's wave; it reports nothing now.

## Not yet applied

- A covered-hair variant under hats. Today a hat simply draws over the hair.
- Draw order that changes with the held item and the action.
- Behind and front layers for long hair, capes and backpacks.
- Rotated versions of tools for swinging actions.
- Judging the sprite on the game's real ground tiles.
- Own front, back and side stamps for model-drawn hats and hair; the derived ones are a fallback.
- A mohawk drawn off the middle in 3/4 stays a little off the middle from behind.
- From behind, a tool in the far hand is mostly hidden during the use action.

## Sources

Read:

- https://raw.githubusercontent.com/veywrn/StardewValley/master/StardewValley/FarmerRenderer.cs
- https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
- https://github.com/Quackster/Avatara
- https://raw.githubusercontent.com/jankuss/shroom/master/src/objects/avatar/structure/AvatarDrawDefinition.ts
- https://github.com/RagnarokResearchLab/ragnarokresearchlab.github.io/blob/main/docs/file-formats/ACT.md

Search summary only:

- https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
- https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites
- https://www.slynyrd.com/blog/2023/11/26/pixelblog-47-tiny-pixels
- https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation
- https://www.derekyu.com/makegames/pixelart.html
- https://lospec.com/articles/pixel-art-outlines-part-2-using-color
- https://the-pixel.art/articles/pixel-walk-cycle/
- https://wiki.stardewvalley.net/Modding:Farmer_sprite
- https://dev.to/trickstival/habbo-avatar-rendering-basics-4cg6
- https://soulbound.game/news/how-we-built-a-pixel-art-character-and-cosmetic-system/
- https://www.witchbrook.com/dev-blog-express-yourself/
- https://auroratide.github.io/tarm/resources/pixel-art-animation-reinvented
