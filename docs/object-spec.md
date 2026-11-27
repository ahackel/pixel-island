# Object editor: Spec (2026-11-15)

## Goal
The third editor next to the wardrobe and the animal editor, for Animal Hospital
(`../animal-hospital/PIXEL-ART-SPEC.md`, step 2): furniture, devices, the garden fountain and the cars, in the
engine's look and in all four camera turns. An object is a small JSON description; rules draw it.

## Decisions
| Area | Decision |
|---|---|
| Building | An object is a list of **parts**: box, cylinder (standing, or lying along x or z) and ball. Each part fills a box given by its lowest corner and its size. Across the floor the unit is 1/16 of a tile edge (a 2-tile desk is 32 long); up, one unit is one pixel |
| Footprint | 1 to 4 tiles each way. Parts stay within it, except a little overhang |
| Drawing | Ray-cast per pixel in the 2:1 view (32×16 tiles), lit with the flora light like the animals. Flat faces take one tone each: top light, front (towards lower left) base, side (towards lower right) shade. Round parts are banded into the three tones. Master palette only, no outlines |
| Painting | As on the animals: a lit rim along the top edge of round parts; sel-out on the edges away from the light; a shade line where a part covers another of the same colour further back. No ground shadow in the picture: it is cast from the sun where the object stands |
| Paint | `solid`, `glow` (a screen or lamp: the light tone all over, no shading), `water` (base with light ripples; they run when the part flows) |
| Camera turns | 4 quarter turns, all drawn (an object need not be symmetric). The footprint swaps width and depth on turns 1 and 3 |
| Animation | A few "on" loops, 8 frames at 6 fps: `blink` (a part goes dark every other half second), `flow` (water ripples run), `bob` (a part rises a pixel and falls). Objects with no loop have one frame |
| Points | Named points in object space, reported per frame in sprite pixels with a visibility flag, like the animals' anchors: `bed` (where an animal lies or stands, its feet), `screen`, `seat1`, `seat2` and so on |
| Presets | Every object of `animal-hospital/src/data.js` but the flora plants (pine, bush, sunflower): reception, outdoor desk, bench, potted plant, exam table, bandage table, desk, cabinet, nest, stand, log, trough, hay, litter tray, feeder, fountain; and the four cars: car, bubble car (pets), jeep (wild), truck (big) |
| Saving | Like the other editors: a named list on the device, export and import as JSON (`type: "pixel-object"`) |
| For the game | `drawObject(object, turn, frame)` from `engine/objects/object.ts` gives the sprite and the points; the pivot is the middle of the footprint on the floor. `npm run bake` also writes every preset × turn × frame into the atlas, with the points per frame. Car colours: swap the body's palette key before drawing |

## Not in this version
Feeder fill levels (the game shows the bowl's contents itself for now), thought bubbles, droppings, food.
