# Pixel Island — design

A shipwreck survivor stranded on a tiny sand island with a few palms. Quest by quest, the sea brings something new. The survivor learns to eat and fish, builds a hut, gets fire from a storm, makes an axe, cuts down palms, and finally builds a raft and sails away. Setting sail ends the demo (see **First week**).

## Vision

- **Audience:** everyone from 10 years up: casual players, adventure fans, and fans of retro games.
- **What makes it fun (pillars):**
  1. **Story:** the sea brings something new each quest, and later there are other people to meet.
  2. **Cute art:** a small survivor, animals, a living island.
  3. **Retro feel:** like the old point-and-click adventures, with a modern touch.
  4. **Exploration:** islands, caves and a volcano to discover.
- **Crafting** plays a big role: there will be many items and recipes (the full list is still to be written).
- **Animals** are part of the world: fish, crabs and sharks so far, with more to come.
- **Price:** free. No monetisation.

## Art direction

- Retro pixel art inspired by the classic LucasArts adventures, with a modern touch.
- Low resolution on purpose, but the colours are rich and not held to a strict palette.
- Smooth gradients where they help, such as lighting and water. No dithering, and hard pixel edges everywhere else.
- Isometric view. Characters face 8 directions.
- Real-time shadows from the sun and the moon.

## Story and world

- **Structure:** a chain of islands. Each island ends with a way to reach the next one, as the raft does in the demo.
- **Goal:** a mystery. The wreck was no accident: someone caused it. Clues on the islands, in the caves and from the people met point to who did it and why.
- **Each island is different:** its own layout and features, its own biome (plants and animals), and its own person to meet.
- **Carry-over:** only what fits in the bag and on the boat travels on. Each island starts mostly fresh, and islands left behind are not visited again.
- **People:** fellow castaways from the same wreck, scattered over the islands; a hermit who teaches skills; and traders or pirates passing by ship, who trade or cause trouble.
- **Length:** 5–10 hours for the whole game.
- **Guidance:** strict, one quest at a time on the first island, so it teaches. Later islands open up, with several goals at once.
- **Failure is gentle:** the survivor never dies. Fainting costs the rest of the day, as it does now.

## Crafting and animals

- Recipes are found by experimenting: drag one thing onto another in the bag, as now. The survivor's thoughts hint at what might fit. There is no recipe book.
- Animals give materials (shells, feathers, hides) as well as food.
- **Pets:** different islands offer different pets, each with its own ability. A pet follows the survivor and finds things, digging up or pointing to hidden items and clues. It also reaches places the survivor can't: a parrot flies, a monkey climbs.
- Some animals are threats, like sharks, boars or snakes. Because failure is gentle, a threat costs time or items, never the survivor's life.

## Sound

Ambient and sparse: mostly waves, wind and birds, with a gentle melody now and then and simple effects.

## Scope

- **Demo:** one small island, the first week (done; see **First week**).
- **Next:** more and bigger islands, and new features (to be decided). Ideas so far:
  - **Caves:**
    - They are pitch dark, so a torch or lamp is needed; this builds on the fire and light systems.
    - They hold resources not found above ground (ore, crystals, clay) for new crafting.
    - They hold story clues: paintings, relics, hidden rooms.
    - They have adventure-style puzzles: levers, tides, blocked passages.
  - **An island with a volcano.**
  - **Bigger buildings, with walls placed freely:** walls, doors, roofs and floors snap to the iso grid, and each piece costs materials. This replaces the fixed hut plan.
  - **Other people** to meet (see **Story and world**).

## Platform

- Runs in the browser, on desktop and iPad. Tap or click to walk there. Pinch or the wheel zooms, with a limited zoom-out. Two fingers pan.
- Rotation (the scene editor's quarter turns) may come later; it is not in v1.
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
- Weather is a system, and it lasts: a quest sets the weather when it starts (its own, or a fair one), and every day after that is the same until the next quest begins, so a day never dawns different for no reason. Storms can cause events, for example lightning setting a tree on fire, which is the first fire.

## Survival (light)

- **Hunger:** a palm drops a coconut in the night, but only once the last one on the island has been eaten; fish come later.
- **Energy:** drains with time and work, and sleep refills it.
- Low needs make the survivor slower. At zero they faint and wake the next morning, losing the rest of the day.
- At first, anywhere on the island that is not water is a safe place to sleep. The hut gives a better rest later.
- Saving is automatic when the survivor sleeps. Reloading resumes that morning. There is one save, with no slots and no cloud.

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
- **Arc of the demo:** food → sleep → fishing with a spear → crabs → the crate → shelter → the storm → fire → the axe and logs → the raft and departure (see **First week**).

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
| 8 | Light a campfire | fair | lightning burns a palm as the survivor steps out of the hut | driftwood is lit by the hut with a torch from it |
| 9 | Make an axe, cut 4 logs | fair | the vine | four logs are cut |
| 10 | Build the raft, sail away | fair | the cloth for the sail | the raft sets sail: the end |

Rules this sets:

- Crabs come out only on windy days, from the morning on.
- Sharks cruise the deep water; only the fin shows. They are why there is no swimming away.
- No animal stays by a fire: crabs run off sideways and fish turn and swim away from a campfire or the burning palm, and from a torch in hand, though a carried flame frightens them only half as far. The sharks, out in the deep, are not troubled by it.
- The island sits in the middle of a larger map, and the sea bed round it is laid by the distance to the nearest land: it falls away gently and has reached the deep before the map ends. The water's colours follow the depth, so a bed still shelving at the map's edge would show a seam against the open sea beyond it; and the shallows are where the crabs walk, so the wider they are, the further out a crab can wade, sinking and washing out with the water as it goes.
- At night the moon throws shadows as hard as the sun's: cloud softens them by day but not after dark. Fog is the exception, and at night it lies as a dark blue bank rather than a pale grey one.
- The survivor says how to tie things (drag one onto the other in the bag) the first time two things in the bag go together, and how to drop things (drag them out onto the sand) the first time the bag is full.
- Each morning the sea leaves sticks and a piece of driftwood (the engine's driftwood flora). Sticks are for tools, the torch and the mast; driftwood builds the hut's walls and is what a campfire is lit on.
- Whatever is taken out of the bag shows in the survivor's hand. Fires light the dark around them.
- Standing behind the hut, its walls come down to knee height and its roof off, so the survivor is seen.
- The hut's roof goes on a palm leaf at a time, one over each of its four cells: two make a ridge over the back, the third a small roof of its own, the fourth the whole roof.
- Rain and storms come only with their quests; other days are fair, and the weather holds from day to day until a quest changes it.
- Once the sea has brought stones, there are always two to be found: fewer than two on the island (lying about or in the bag) and the next morning brings them back up to two.
- After the storm night the survivor lies awake until a campfire burns by the hut, so the fire quest ends where they sleep.
- In the rain the survivor sleeps only under the hut's roof. A storm night out of the hut wakes them with thunder.
- A palm tapped gives a leaf; with the axe in hand it is cut down for two logs (the sapling is too small). A stone or the hammer smashes the crate, the axe prises it open.
- Things are tied by dragging one onto another in the bag (`src/crafts.ts`). The hut and raft are built in stages with a button that shows when the bag holds the next stage and the survivor stands in the right place (hut round the blanket, raft on the beach).

Open:

- How many palms the island can lose (fewer palms, fewer coconuts). The raft takes 4 logs, which is two palms.
- Whether the hut also shelters the campfire from rain.
- Whether a shark ever does more than show its fin.
- Setting sail only fades to the end card; the raft does not drift off yet.
- What the night crabs give besides food.

## Island 2: the rocky island

The raft from the first island lands here. The goal is a **map of the area** showing more islands, so the survivor knows where to go next. The survivor leaves on the **smuggler's boat**: he has one but is too scared to sail it alone, so with the map they sail on together, and he stays in the story.

**The island:**
- About 5 times the size of the first island, in distinct zones: the beach where the raft lands, cliffs, a strip of forest, and a cave system.
- **Zones open by story:** the smuggler tells of places as the favours go on, and each one opens when a quest leads there.
- Rocky, with several cave mouths. The smuggler's camp sits in a cove.
- **Animals:** bats live in the caves. Spiders:
  - Their webs block cave passages and are burned away with a torch or the lantern.
  - Their silk is a strong thread for crafting.
  - A big cave spider is a mild threat: it scares the survivor off, so they drop what they hold or run back. It is never deadly.
  - The smuggler is terrified of them.
- **Survival:** the same rules as the first island, but cooked food fills a lot, so hunger matters less and exploring matters more.
- **Skull and skeleton:**
  - A skull is a loose prop lying about.
  - The skeleton is built as a character setup, so it can be posed (slumped against a wall, lying in a trap, sitting by the chest). It is mostly placed as decoration.
  - They belong in the caves and by the smuggler's traps, as a warning and for a bit of spooky fun. The smuggler has a nervous story about each one.

**The smuggler:**
- A cowardly braggart who is scared of the dark, the caves and spiders, so he needs the survivor. He is the comic relief.
- There is a hint that he knows more about the wreck than he says. This is the first hook into the mystery.
- **Cooking brings him out:** he can't cook, and the smell of the survivor's first meal draws him from his cove.
- He trades in **favours**, not goods: the survivor does tasks, and he pays in items or information. The favours are:
  - **Cook for him:** he's hungry and fussy, and wants particular dishes, which teaches the recipes.
  - **Fetch from the caves:** things he's too scared to get himself, which leads the survivor deeper step by step.
  - **Scare off pests:** something keeps getting into his supplies, such as spiders in his camp. The survivor solves it without hurting anything.
- The map is in his **hidden stash, a treasure chest in the deepest cave**, guarded by his own old traps.

**The dog:**
- A stray from the wreck, trapped in a cave. Free it and feed it, and it follows the survivor from then on.
- It sniffs out and marks spots to dig, and it squeezes through gaps the survivor can't.

**New mechanics:**
- **Lantern:** a safe light that never goes out, and works in wind, rain and the caves. Unlike the torch, the caves need it.
- **Digging:** craft a shovel. The dog marks where treasure is buried. Digging without the dog is blind and turns up mostly junk.
- **Treasure:** buried finds and hidden caches, with the map chest as the big one.
- **Cooking:** a pot washes up from the wreck. A campfire plus the pot makes a cooking setup, and combining ingredients makes better meals, found by experimenting the same way as tying things in the bag.
- **Grid building:** the first free building is a **camp with a kitchen**, a shelter with a cooking corner.
- **Favours:** the smuggler's tasks, as the island's way of trading.
- **Cave puzzles:**
  - **Blocked passages:** rockfalls and spider webs.
  - **Dog puzzles:** the dog squeezes through a gap to fetch a key or pull a lever.
  - **The smuggler's traps:** guarding the stash, with riddle locks whose clues are spread around the island.

**Draft quest chain** (one way it could go; open to change):

| # | Quest | Teaches |
|---|-------|---------|
| 1 | Land the raft; a pot washes up | the new island |
| 2 | Light a fire and cook a first meal | cooking |
| 3 | The smell draws the smuggler out: meet him | a person to talk to |
| 4 | Cook the dish he wants (first favour), and he pays with the lantern | favours, recipes |
| 5 | Build a camp with a kitchen on the grid | grid building |
| 6 | Clear the spiders from his camp | spiders, webs and fire |
| 7 | Fetch something from the first cave, and find the trapped dog | caves, dark |
| 8 | Free the dog and feed it a cooked meal | the pet |
| 9 | Make a shovel and dig where the dog marks | digging, treasure |
| 10 | Get through the smuggler's traps to the deepest cave and open the chest | cave puzzles |
| 11 | Bring him the map, catch a hint about the wreck, and sail off on his boat | the next island |

Open for this island:
- The exact dishes, and what each favour pays.
- Whether the shovel needs something new (an iron blade from the caves?).
- What silk makes.
- Whether the skull can be picked up or used (a puzzle piece, or a favour?), or is only decoration.
- What the raft becomes once the survivor leaves on the boat.

## Survivor

- For now, one fixed character made once in the wardrobe.
- Later, players dress their own survivor in a simplified wardrobe.
- Clothes can wear out over the days through the engine's `wear.ts`.

## Numbers (now)

From `src/clock.ts` and `src/save.ts`; tune them there.

- Day: 10 minutes, the last minute of it sunset, then 30 s of dusk.
- Hunger empties in 15 minutes, energy in 20. Below 25% the survivor walks at half speed; at 0 they faint.
- A coconut gives 35% hunger, a fish 50%.
- The bag has 6 slots.

## Open questions

- What the night creatures do for the game (food? materials?).
- What exactly a threat costs when it gets the survivor (time, items, an injury that slows them?).
- Who caused the wreck and why, and how the clues are spread over the islands.
- What the volcano does: a threat, a resource, the finale?
- How many islands, and which biome and person each one has.
- Whether the numbers above feel right over a whole week.
