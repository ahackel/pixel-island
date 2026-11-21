# Pixel Art Game Engine: Spec (from interview, 2026-11-15)

## Goal
Turn the 2D pixel-art tools into a small game engine with a scene editor, plus an island test scene: build an island, shape the terrain, place plants, then walk around with a character built in the wardrobe. Everything is saved on the device.

## Decisions
| Area | Decision |
|---|---|
| Character system | The 2D puppet from the wardrobe (`engine/core/puppet.ts`, `engine/core/poses.ts`, `engine/character/wear.ts`). The 3D prototype is removed |
| Engine | A shared runtime (iso world, terrain, sprites, input, camera, collision, saving) and a general scene editor on top of it. The island is one scene built with it |
| Terrain | Built on `engine/world/terrain.ts` height map. Tools: paint tile type, raise and lower height. A tile lowered below sea level becomes seafloor |
| Foliage | Plants from the flora tool (`engine/flora/flora.ts`), including plants saved in the flora tool |
| Scenes | Several named scenes: create, rename, delete, switch. Map size per scene. Spawn point. Export and import as JSON. Saved locally |
| Modes | Toggle between Edit (tools, free camera) and Play (character spawns, camera follows) |
| Controls | Desktop: WASD/arrows to walk, Shift to run, mouse to paint and place. Touch: tap or drag to walk, touch to paint and place, pinch to zoom |
| Collision | Water blocks, cliffs block (steps over two levels, the same rule that draws a cliff instead of a slope), every plant but grass blocks |
| Animations | Idle, walk, run, emotes (wave etc. from existing lab poses) |
| Characters | Wardrobe gets a named list: save as, load, delete, export and import JSON. Play mode lets you pick which saved character to use |
| Placed assets | Plants, decorations and items are placed by id. Animals and characters are placed by a reference (`ref`: a saved animal's id, `preset:` and a preset id, or a wardrobe character's id, `''` for the default one), so editing the original in the animal editor or the wardrobe changes it in every scene (on load, and when the scene page is shown again). The last-seen copy stays in the scene as a stand-in for when the original is deleted or the scene is opened elsewhere |
| Remove | `src/`, `prototype/`, the 3D files in `public/assets`, `tools/fetch-assets.mjs`, `tools/build-assets.mjs`, the `three` and `@gltf-transform/*` dependencies, the 3D sections of the README. Keep `docs/research.md` as history |
| Publish | Link the scene page from the start page and add it to `build:site` like the wardrobe and the flora tool |

## Settled while building
- Paintable ground: sand, grass, rock, or "by height" (the generated rule). Under water it is always sea floor.
- Emotes: wave (E) and use (F), plus buttons in Play.
- The wardrobe's single saved character becomes the first entry of the new list, named "Castaway".
- Plants keep to the ground they grow on in the flora tool (palms not on rock, driftwood only on the beach, and so on).
