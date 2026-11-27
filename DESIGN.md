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

- `pixel-island` (this repo) imports the engine through the Vite alias `@pixel`, pointing at `engine/`, a git subtree of pixel-engine pinned by `.engine-version`.
- The rule: anything any game could use goes to `pixel-engine`. Anything that is this game's rules or content stays here.

| pixel-engine (engine and tools) | pixel-island (game) |
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

Decided per tool: the generic editors live in pixel-engine and load and save JSON. The story-like timeline lives here.

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
- **Talking to people** is a classic adventure dialogue: tap a character, and they talk in bubbles. The player taps one of 2–3 replies, and some replies are just for fun.
- **Building on the grid** has its own build mode. A build button switches to a top-down grid overlay. The player picks a piece (wall, door, floor or roof) and taps to place it, and its cost comes out of the bag.

## Progression

- **Mornings:** key items wash up with the quest that needs them, which guarantees a path to the boat. Random driftwood comes on top.
- **Learning** happens three ways:
  - finding an item that unlocks something (flint → fire, hook → fishing);
  - combining items (stick + stone → axe);
  - events (lightning → burning tree → fire).
- **Building:** structures come first (hut, fire pit, rack, boat). Growing the island itself may come later.
- **Arc of the demo:** food → sleep → fishing with a spear → crabs → the crate → shelter → the storm → fire → the axe and logs → the raft and departure (see **First week**).

## First week

The demo is a chain of quests (`src/content/islands/first/quests.json`), one at a time, each teaching one thing; the survivor's thought says what to do, and a picture by the bars keeps it in mind (no on-screen tutorial). A quest counts only what happens while it is the current one and brings what its task needs, so nothing can be done ahead of it. A finished quest gives way to the next the following morning (the storm comes in the night already).

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

The raft from the first island lands here and breaks apart on the rocks, so the survivor is stranded again. The goal is a **map of the area** showing more islands, so the survivor knows where to go next. The survivor leaves on the **smuggler's boat**: he has one but is too scared to sail it alone, so with the map they sail on together, and he stays in the story.

**The island:**
- About 5 times the size of the first island, in distinct zones.
- **Shape:** a crescent bay. The raft breaks up in the sandy bay, between two rocky arms.
- **Heights:** 2–3 levels: the beach, a plateau, and the cliff top, joined by paths and ramps. Caves open in the cliff faces.
- **Zones:**
  - **Beach:** the landing bay.
  - **Forest:** in a sheltered valley behind the beach, with coconuts for the crab stew.
  - **Cliffs:** they ring the outside of the island.
  - **Caves:** small caves under the cliffs, near the surface (the spiders, the dog, mushrooms), plus one deep system that holds the stash.
  - **Cove:** the smuggler's camp and boat, on the opposite side of the island. Reaching it is a small journey.
  - **Lookout:** the cliff top, the highest point. Once the map is in hand, the next island can be seen far off from here.
- **Zones open by story,** in this order: beach → forest → cove → small caves → deep cave → cliff top. The smuggler tells of each place as the favours go on, and it opens when a quest leads there.
- **The smuggler's entrance:** he saw the raft crash and came over to scout. He hides and watches, and the smell of the first meal finally brings him out.
- **Animals:** bats live in the caves. Seabirds nest on the plateau's rocky ledges, below the cliff top: they give eggs and steal food left lying out. Spiders:
  - Their webs block cave passages and are burned away with a torch or the lantern.
  - Their silk makes a net trap. Placed in shallow water or on the beach, it holds a fish or a crab the next morning.
  - A big cave spider is a mild threat: it scares the survivor off, so they drop what they hold or run back. It is never deadly.
  - The smuggler is terrified of them.
- **Time** keeps running in the caves, so coming out late means coming out into the dark.
- **Survival:** the same rules as the first island, but cooked food fills a lot, so hunger matters less and exploring matters more.
- **Skull and skeleton:**
  - A skull is a loose prop. It can be picked up, for a joke: shown to the smuggler, it makes him panic.
  - The skeleton is a full character rig preset in the engine, with every animation a person has. It is mostly placed as decoration: a placed skeleton holds one frozen frame of any animation (a sit, a lie, a stumble), such as slumped against a wall, lying in a trap or sitting by the chest.
  - Look: bone-white and chunky, but readable. Thin limbs with gaps at the joints and ribs, so it does not read as a solid body. The skull is a part that can come off, and is also the loose skull prop.
  - The wardrobe works on it (a hat, rags, a held item), so a skeleton can tell a story.
  - It never moves or reacts when placed. The survivor can be swapped to it in the editor to test the animations; that is not a game feature.
  - They belong in the caves and by the smuggler's traps, as a warning and for a bit of spooky fun. The smuggler has a nervous story about each one.

**The smuggler:**
- A cowardly braggart who is scared of the dark, the caves and spiders, so he needs the survivor. He is the comic relief.
- There is a hint that he knows more about the wreck than he says. This is the first hook into the mystery.
- **Cooking brings him out:** he can't cook, and the smell of the survivor's first meal draws him from his cove.
- He trades in **favours**, not goods: the survivor does tasks, and he pays with the **lantern** (for the first dish), the **shovel** (for a cave fetch), **recipe hints** (dishes "his mum" made) and **wreck gossip** (a line of story each time, building the mystery hook). Which favour pays what:
  - fish soup → the lantern;
  - clearing the spiders from his camp → gossip;
  - a cave fetch → the shovel;
  - crab stew and the omelette → recipe hints and gossip;
  - mushroom stew, the last dish → he tells where the hidden door to his stash is.

  The favours are:
  - **Cook for him:** he's hungry and fussy, and wants particular dishes, which teaches the recipes:
    - **fish soup** (the first, easy one);
    - **crab stew** (crab and coconut from the forest strip);
    - **bird egg omelette** (eggs from the nests on the plateau);
    - **mushroom stew** (cave mushrooms, so only after the caves).
  - **Fetch from the caves:** things he's too scared to get himself, which leads the survivor deeper step by step.
  - **Scare off pests:** something keeps getting into his supplies, such as spiders in his camp. The survivor solves it without hurting anything.
- The map is in his **hidden stash, a treasure chest in the deepest cave**, guarded by his own old traps. They are:
  - a **hidden door**, found only after he says where it is;
  - **locked gates**: the key lies beyond a gap too small for the survivor, and the dog fetches it with **Go**;
  - a corridor behind **thick spider webs**.

**The dog:**
- A stray from the wreck, trapped in a cave. Free it and feed it, and it follows the survivor from then on.
- It trots after the survivor, and lies down when they rest or sleep.
- It chases off seabirds stealing food, but is scared of the big spider.
- It squeezes through gaps the survivor can't.
- **Commands:** tapping the dog shows a small menu:
  - **Go / fetch:** then tap a gap, a lever or an item. The dog goes there and fetches the item or pulls the lever.
  - **Stay / follow:** the dog waits where it is (on a pressure plate, say) or follows again.
  - **Sniff:** it searches around, circles and barks, and marks any buried spot nearby with a dig mark.
  - **Pet:** no use. It wags its tail and a little heart shows.

**New mechanics:**
- **Lantern:** a safe light that never goes out, and works in wind, rain and the caves. Unlike the torch, the caves need it.
- **Digging:** the smuggler pays a favour with his old shovel. Told to sniff, the dog marks where treasure is buried. Digging without the dog is blind and turns up mostly junk.
- **Treasure:** buried finds and hidden caches, with the map chest as the big one.
- **Cooking:** a pot washes up from the wreck. A campfire plus the pot makes a cooking setup, and combining ingredients makes better meals, found by experimenting the same way as tying things in the bag.
- **Grid building:** the first free building is a **camp with a kitchen**, a shelter with a cooking corner.
- **Favours:** the smuggler's tasks, as the island's way of trading.
- **Cave puzzles:**
  - **Blocked passages:** rockfalls and spider webs.
  - **Dog puzzles:** the dog squeezes through a gap to fetch a key or pull a lever.
  - **The smuggler's traps:** the hidden door, locked gates and the web corridor in front of the stash (see **The smuggler**).

**Draft quest chain** (one way it could go; open to change):

| # | Quest | Teaches |
|---|-------|---------|
| 1 | The raft breaks on the rocks; a pot washes up | the new island |
| 2 | Light a fire and cook a first meal | cooking |
| 3 | The smell draws the smuggler out: meet him | a person to talk to |
| 4 | Cook the dish he wants (first favour), and he pays with the lantern | favours, recipes |
| 5 | Build a camp with a kitchen on the grid | grid building |
| 6 | Clear the spiders from his camp | spiders, webs and fire |
| 7 | Fetch something from the first cave, and find the trapped dog | caves, dark |
| 8 | Free the dog and feed it a cooked meal | the pet |
| 9 | Fetch something from a cave for the smuggler's shovel, then dig where the dog marks | digging, treasure |
| 10 | Get through the smuggler's traps to the deepest cave and open the chest | cave puzzles |
| 11 | Take the map up to the lookout and see the next island on the horizon, then sail off on his boat and fade to the end card | the next island |

Open for this island: nothing right now.

### Island 2: what it needs

Based on what pixel-engine and this repo have today. Engine work is anything another game could use; the rest stays here.

**Already there to build on:**
- **Heights and cliffs:** the terrain height map, with slopes, cliffs and walking blocked across cliffs (`engine/world/terrain.ts`, `path.ts`).
- **Pieces on the grid:** buildings made of wall pieces on cell edges and roof pieces on cells (`engine/world/building/`, with the `walls-proto` tool). The hut already uses this.
- **Lights:** the day tint, and fires lighting a patch around them (`engine/world/daylight.ts`). The torch and campfire already use this.
- **Animals:** a dog preset (`engine/animals/animal-presets.ts`), and herds with poses and carrying (`herd.ts`).
- **People:** the character rig and the shared character editor, so the smuggler can be made in it.

**Engine work (pixel-engine):**

| Feature | What it means |
|---|---|
| Cave interiors | A second map per cave mouth, with a transition in and out. It is pitch dark there apart from carried and placed lights. |
| Cave editor | Caves made by hand in the scene editor rather than by code. See below. |
| Lantern light | A carried light that wind and rain don't put out. Probably a type of the existing lamp. |
| Bigger maps | An island 5 times the size: camera limits, and drawing only what's on screen if that becomes slow. |
| Skeleton | A bone-white rig preset with all the character animations and the wardrobe, placeable as a frozen frame; the skull detaches as a loose prop. |
| Dialogue UI | Speech bubbles for other characters, and 2–3 tappable replies (pixel-ui). |
| Build mode UI | A top-down grid overlay, a palette of pieces showing their costs, and tap to place. |
| More pieces | Floors and a kitchen corner (fire pit and pot), alongside the plank wall and thatch roof. Doors are in (scene doors on cell edges). |
| Companion | An animal that follows a character, lies down with it, and takes go, stay and fetch orders; built on the herd and path code. |
| Context menu | Tapping a creature shows a small menu of commands (the dog's). |
| Ground marks | Dig marks, and dug holes that stay in the ground. |
| New flora and animals | Rocky-island plants, bats, seabirds and spiders; webs as a prop that burns away. |

**Cave editor (spec).** A cave scene kind in the existing scene editor (`tools/scene`):
- **New → Cave** starts a map that is all solid rock. The map is made of 1×1 m cells, as for islands.
- **Carve and Fill tools:**
  - Carve drags open floor with the brush size, where size 1 is one cell. Fill drags rock back.
  - Rock walls appear by themselves on the edges the camera looks at, with their black caps. The front of a room has no walls and just ends at black.
  - Undo covers carve and fill.
- **Heights:** floors at any level, and rock is high ground (see **Heights, walls and ways**). The Raise, Lower, Shape and Material tools work in a cave as on an island.
- **Auto-dress:** rubble appears along the wall foot as you carve. Stalagmites, boulders, crystals and mushrooms are placed by hand.
  - Placing uses the existing Plant and Decor tools.
  - Crystals and mushrooms move from the game into engine decor: they glow, and they light the cells around them.
- **Wall torch:** a placeable torch on a wall that lights the cave.
- **Exit marker:** set on the cave's open edge. It lets daylight in and leads out. The island scene names which cave its mouth opens into.
- **Edit view:** lit as in the game, with a Bright toggle that lights everything evenly while carving. Play walks it with the lantern.
- **Settings:** size, darkness and tint (how dark and what colour the unlit cave is), and rubble amount.
- **The game loads its cave from an exported cave scene,** instead of generating it in `caveScene()`.

**Heights, walls and ways (built).** One model for islands and caves:
- **Height:** every cell has a whole level. Rock is ground at the rock level, so a cave is rock with floor carved out of it. Each scene has its own water line (none in a dry cave).
- **Shape:** each cell is smooth (it shares its corners with its smooth neighbours, so hills stay soft), cut (flat, with hard steps to what is beside it), a ramp (rising evenly over its run of ramp cells from one floor to the next) or a hole. A walker steps across an edge whose ends are within a level, onto ground that is not too steep.
- **Material:** sand, grass, stone, cave stone, dirt, brick or mine shoring. It gives a cell its top and its step faces, and on a cave's rock, its walls.
- **Rock in front of the survivor:** rock with only rock between it and the camera is never drawn. Rock that stands in front of the survivor and hides floor near them dissolves down to a stub, a whole joined mass of one material at a time.
- **Thin walls** stand on cell edges: plank, brick, stone or a fence. A wall counts its height from the higher side of a step. Walls the survivor stands behind dissolve, a straight run at a time; fences never do.
- **Ways:**
  - A **ladder** goes up a step of two levels or more; the survivor climbs it on the way.
  - A **hole** is a hole in the ground with a ladder down its back face, leading to another scene or another place in the same one.
  - A **door** stands on an edge, in a wall's place if there is one. It is closed (opened on the way), open, locked (it needs a key, used up) or hidden (it looks like the wall or the rock beside it; for now the hammer breaks through where the wall sounds hollow). The game saves each door's state.
- **The smuggler cave** shows all of it: the main room with a ledge reached by a ramp and a ladder, a fence along the ledge, a hole as a shaft down to a lower side room (the chest with the key, and the ladder up to the island), and a brick store behind a locked door.

**Objects and the treasure chest (spec).** For the scene editor's Object tool and the game:
- **What can be placed:** every object preset (log, trough, hay, cabinet, cars and the rest) and the objects made in the object editor, in one picker, as the Animal tool offers saved animals and presets.
- **Rotating:** with the Move tool, select a placed object and turn it a quarter with a button or the R key. New objects face the way the last one was turned.
- **In the game, objects only stand in the way.** The crate keeps its pick-up and smash, and the chest opens. Nothing else is carried.
- **The chest looks like a classic pixel chest:** a box of dark planks, a domed lid of planks, grey iron bands round the box and lid, and an iron hasp at the front. It is built from object parts, so it turns all four ways and has an open state.
- **Opening:**
  - Its contents are chosen in the editor, from the island game's bag items, kept in a small shared list the editor reads.
  - A tap walks the survivor to it. The lid swings open over a few frames and then stays open, showing a dark inside.
  - What was in it goes into the bag. An opened chest stays open in the save.

**Game work (this repo):**
- Islands as content: a second island's map, quests and texts, with the first island's ending leading on to it.
- The smuggler: his dialogues, favours and reactions (to the skull, to spiders).
- Cooking: the pot and recipes, as a cooking table beside `crafts.ts`.
- The net trap's overnight catch, digging finds, the treasure chest and the map.
- Zones that open by story, the hidden door, the locked gates and their key.
- The dog's rules: when it barks, what it chases off and what it is scared of.
- Seabirds stealing food left out.
- Splitting `src/main.ts` (about 1,600 lines) so that each island's rules don't pile up in one file.

**Suggested order:**
1. Cave interiors and the lantern.
2. The smuggler and dialogue.
3. The dog as a companion with commands.
4. Build mode.
5. Cooking.
6. Digging and treasure.
7. Content and polish.

### Island 2 as data (a spike)

The first three quests of the draft chain, written as the content they should be in `src/content/drafts/island2/` (quests, interaction rules, one dialogue, texts in English and German), and checked with the game's own checks by `src/island2-draft.test.ts`. The test lists exactly what the game cannot do yet; when the vocabulary grows to cover a line, the test fails until the line is removed, and when the list is empty the draft moves out of `drafts/` into the game.

What the draft showed is missing, most useful first:

| Gap | What the draft needed | The way to close it |
|---|---|---|
| **Items are code** | a pot, flint, fish soup | **Done.** `content/items.json` (loose, fish group, food values) and `content/recipes.json`, checked by the tests; `BagItem` is the file's keys, so a missing picture is a type error. The pot, flint and fish soup exist (pictures in `things.ts`, texts in `loca.json`, the cheats' GIVE row). A quest's corner picture is any item's picture or one of three extras, so the closed icon list is gone |
| **Events keyed by item** | a quest "get the pot", "cook fish soup" | **Done.** The game reports `got:<item>` (into the bag), `ate:<item>` and `made:<item>` (a recipe); a rule may `reach` `made:` of anything, as cooking does. The checks know these goals |
| **Things to act on** | a lit campfire (cooking), a person | **Campfire done:** the `campfire` target, which a tap walks up to only if a rule fits what is in hand (so a campfire is still just a walk for any other hand). `person` with a `who` is still to do, with the smuggler scene |
| **Conditions with a value** | "the bag holds a fish" | **Done:** `has:<item or group>` (`has:fish` is any fish) beside `tall`, `byHut`, `wantsFire` |
| **Effects** | using up what is in the hand, a person turning up, talking | `take` is **done** (an item or a group out of the bag). `show` (a person placed hidden in the scene appears) and `talk` (starts a dialogue) wait for the smuggler scene |
| **Dialogue** | the smuggler's first words | a graph of nodes in `dialogues.json`: each says one text, then offers 2–3 replies, goes on, or ends, and a node's `do` is the same effects. `src/island2-draft.test.ts` already checks one (texts exist, every reply goes somewhere, every node is reachable). The UI is `talk.ts`'s story box with reply buttons. Ink only if the branching outgrows this |
| **Island scoping** | Island 2's own quest chain and rules | **Done.** Each island is a bundle (`src/islands.ts`, content in `content/islands/<island>/`): its quests, its own rules (before the shared ones, so it can override) and its texts. A game says which story it is on (`Game.story`, kept in the save, `first` for older saves), and the quests, weather, camp and stone rules all read the bundle. `?island=2` plays the rocky island's chain. `byHut` and `HUT_AT` are still the first island's, and become scene markers |

Suggested order: items as data and the item events, `campfire`, `has:` and `take` (all done: the pot cooks fish soup at a lit campfire in the real game, rules in `interactions.json`), island bundles (done: the rocky island's first two quests are in the game), and the dialogue UI last, once the smuggler scene is there to try it in.

## Survivor

- For now, one fixed character made once in the wardrobe.
- Later, players dress their own survivor in a simplified wardrobe.
- Clothes can wear out over the days through the engine's `wear.ts`.

## Numbers (now)

From `src/clock.ts`, `src/save.ts` and `src/content/items.json` (what each food fills); tune them there.

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
