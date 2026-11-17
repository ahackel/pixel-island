# Pixel Island — design

A shipwreck survivor stranded on a tiny sand island with a few palms. Each day something new washes up. Over about 15 in-game days (around 4 hours of play) the survivor builds a hut, learns to make fire and to fish, gathers resources, cuts down trees, and finally builds a small boat to reach the next island. Reaching that island ends v1.

## Platform

- Runs in the browser, on desktop and iPad. Tap or click to walk there. Pinch or the wheel zooms, with a limited zoom-out. Two fingers pan.
- Rotation (the scene editor's quarter turns) may come later; it is not in v1.
- Sound and music: waves, ambience, simple effects.
- Text in English and German, following the tools' `i18n.ts` convention.

## Repos and the split

- `pixel-island` (this repo) imports the engine through the Vite alias `@pixel`, pointing at `../pixel-art/pixel-art`, the same way animal-hospital does.
- The rule: anything any game could use goes to `pixel-art`. Anything that is this game's rules or content stays here.

| pixel-art (engine and tools) | pixel-island (game) |
|---|---|
| Time-of-day tint: day, sunset, night palettes | Day length, night timer, tiredness |
| Light sources (fire, torch) lighting a radius at night | Survival needs, fainting, speed penalties |
| Weather: rain, wind (flora sway already exists), lightning flash | Weather schedule and what weather does to the game |
| Touch camera: pinch zoom, two-finger pan, tap to walk | HUD, inventory UI, menus |
| Interactable objects and a "use item on target" hook | Which item on which target does what |
| Item format and icon rendering, generic inventory model | Items, recipes, day script (content JSON) |
| Structures built in stages (hut, fire pit, boat) | Which structures exist and what they need |
| Fade-to-black and screen transitions | Morning wash-up, events, progression, save |
| **Tools:** item & recipe editor, lighting/time-of-day preview, structure editor | **Tool:** day and event timeline editor |

Decided per tool: the generic editors live in pixel-art and load and save JSON. The story-like timeline lives here.

## Day cycle

- The day lasts 10 minutes of play time and ends in a sunset transition, then night begins.
- Night never ends on its own. After 5 minutes of night the survivor gets tired and moves slowly.
- The player tells the survivor to sleep. The screen fades to black, a new morning starts, and the survivor is rested.
- The clock only runs while playing. It stops when the app is hidden, and there is a pause button.
- Night is darker, so seeing needs light (fire or torch). Some things happen only at night: crabs, turtles laying eggs, better fishing, stars.
- Weather is a system: random rain, wind and storm days. Storms can cause events, for example lightning setting a tree on fire, which is the first fire.

## Survival (light)

- **Hunger:** palms drop coconuts every day; fish come later.
- **Energy:** drains with time and work, and sleep refills it.
- Low needs make the survivor slower. At zero they faint and wake the next morning, losing the rest of the day.
- At first, anywhere on the island that is not water is a safe place to sleep. The hut gives a better rest later.
- Saving is automatic when the survivor sleeps. Reloading resumes that morning.

## Interaction

- Tap the ground and the survivor walks there.
- Tap an object to use it with the empty hand or the current item.
- To use a tool: **select an item in the inventory, then tap the target** (axe + palm = chop).
- Carrying: one item in the hand (drawn on the character, as with the wardrobe's held item) and a bag of a few slots. A crate gives more storage later.
- The survivor's thoughts appear as short speech bubbles and emotes and serve as hints ("I could split this with a sharp stone…").

## Progression

- **Mornings:** key items wash up on fixed days, which guarantees a path to the boat. Random driftwood and junk come on top.
- **Learning** happens three ways:
  - finding an item that unlocks something (flint → fire, hook → fishing);
  - combining items (stick + stone → axe);
  - events (lightning → burning tree → fire).
- **Building:** structures come first (hut, fire pit, rack, boat). Growing the island itself may come later.
- **Rough arc:**
  1. Coconuts and driftwood.
  2. Stone tools.
  3. Shelter.
  4. Fire, from the storm.
  5. Fishing.
  6. Felling palms.
  7. The boat (hull, sail).
  8. Departure.

## Survivor

- For now, one fixed character made once in the wardrobe.
- Later, players dress their own survivor in a simplified wardrobe.
- Clothes can wear out over the days through the engine's `wear.ts`.

## Milestone 1: one day loop

1. A small sand island with a few palms, made in the scene editor.
2. The fixed survivor walks where the player taps. Touch zoom and pan work.
3. Palms drop coconuts each morning. Tap a coconut to pick it up and eat it. Hunger and energy bars.
4. Day (10 minutes) → sunset → night, with tint. After 5 minutes of night, tired and slow.
5. Sleep command → fade to black → save → next morning, with one scripted wash-up item.
6. A debug time-scale switch, so a day doesn't have to take 10 real minutes while developing.

Engine work this needs: the time-of-day tint, the touch camera and the fade. Everything else is game code.

## Open questions

- Sunset: for now the last minute of the 10-minute day, then 30 s of dusk (`src/clock.ts`).
- How fast hunger and energy drain, and how many coconuts a day.
- The exact size of the bag.
- Which item is the day-1 wash-up, and the full 15-day key-item schedule.
- What the night creatures do for the game (food? materials?).
