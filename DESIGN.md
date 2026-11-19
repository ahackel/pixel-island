# Pixel Island — design

A shipwreck survivor stranded on a tiny sand island with a few palms. Quest by quest, the sea brings something new. The survivor learns to eat and fish, builds a hut, gets fire from a storm, makes an axe, cuts down palms, and finally builds a raft and sails away. Setting sail ends the demo (see **First week**).

## Platform

- Runs in the browser, on desktop and iPad. Tap or click to walk there. Pinch or the wheel zooms, with a limited zoom-out. Two fingers pan.
- Rotation (the scene editor's quarter turns) may come later; it is not in v1.
- Sound and music, later: waves, ambience, simple effects.
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

- **Mornings:** key items wash up with the quest that needs them, which guarantees a path to the boat. Random driftwood comes on top.
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

## First week

The demo is a chain of quests (`src/content/quests.json`), one at a time, each teaching one thing; the survivor's thought says what to do, and a picture by the bars keeps it in mind (no on-screen tutorial). A quest counts only what happens while it is the current one and brings what its task needs, so nothing can be done ahead of it. A finished quest gives way to the next the following morning (the storm comes in the night already).

| # | Quest | Weather | What it brings | Done when |
|---|-------|---------|----------------|-----------|
| 1 | Eat something | sunny | 2 coconuts, driftwood | something is eaten |
| 2 | Sleep on the blanket (starts at once) | sunny | — | a night slept, not fainted |
| 3 | Make a spear, catch a fish | fair | 3 stones (the first) | a fish is speared |
| 4 | Catch a crab | windy (crabs all day) | — | a crab is speared or grabbed |
| 5 | Open the crate | fair | the crate | it is smashed with a stone or the hammer: rope and two pieces of driftwood |
| 6 | Build the hut | rain | the hammer | the hut's roof is on |
| 7 | Sit out the storm (wakes the survivor the night the hut is done) | storm | — | a storm night slept, in the hut |
| 8 | Light a campfire | fair | lightning burns a palm | driftwood is lit with a torch from it |
| 9 | Make an axe, cut 4 logs | fair | the vine | four logs are cut |
| 10 | Build the raft, sail away | fair | the cloth for the sail | the raft sets sail: the end |

Rules this sets:

- Crabs come out only on windy days, from the morning on.
- Every morning starts with a sunrise.
- The survivor says how to tie things (drag one onto the other in the bag) the first time two things in the bag go together, and how to drop things (drag them out onto the sand) the first time the bag is full.
- Each morning the sea leaves sticks and a piece of driftwood (the engine's driftwood flora). Sticks are for tools, the torch and the mast; driftwood builds the hut's walls and is what a campfire is lit on.
- Whatever is taken out of the bag shows in the survivor's hand. Fires light the dark around them.
- Standing behind the hut, its walls come down to knee height and its roof off, so the survivor is seen.
- Rain and storms come only with their quests; other days are fair.
- In the rain the survivor sleeps only under the hut's roof. A storm night out of the hut wakes them with thunder.
- A palm tapped gives a leaf; with the axe in hand it is cut down for two logs (the sapling is too small). A stone or the hammer smashes the crate, the axe prises it open.
- Things are tied by dragging one onto another in the bag (`src/crafts.ts`). The hut and raft are built in stages with a button that shows when the bag holds the next stage and the survivor stands in the right place (hut round the blanket, raft on the beach).

Open:

- How many logs the raft needs, and how many palms the island can lose (fewer palms, fewer coconuts).
- Whether the hut also shelters the campfire from rain.
- Setting sail only fades to the end card; the raft does not drift off yet.
- What the night crabs give besides food.

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
- What the night creatures do for the game (food? materials?).
