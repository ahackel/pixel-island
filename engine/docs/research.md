# Character customization: approach comparison

Research date: 14 November 2026.

## Recommendation

Build **real-time 3D characters assembled from modular parts on one shared skeleton**, rendered with a toon-style shader. Face features are texture layers on the head, not geometry.

2D is not competitive for this brief. The fixed 3/4 camera with 4 or 8 facing directions multiplies every 2D item by the number of drawn directions, and no generative tool was found that produces aligned, swappable 2D parts across angles.

The largest open risk is not the runtime. It is whether generated 3D items hold one consistent style across hundreds of pieces. No source settles that, so it needs a hands-on test with about ten items (see [Risks](#risks-and-open-questions)).

## The brief

| Topic | Decision |
|---|---|
| 2D or 3D | Open, to be compared |
| Engine | Engine-agnostic; prototype on the web |
| Platform | Mobile |
| Customization | Outfits, accessories, face features. No body-shape changes |
| View | Full body, mid distance, fixed 3/4 or isometric camera |
| Style | Chunky cartoon |
| Animation | Body locomotion and actions |
| Content source | Mix of generated, procedural and hand-made, to be researched |
| Scale | Hundreds of items; 2 to 10 characters on screen |
| Top criterion | Visual and animation quality |

Two of these answers shape the result more than the others:

- **No body-shape customization.** Every item is made for exactly one body. That removes the hardest problem in the field (fitting clothes to arbitrary bodies, which Roblox solves with cage deformation) and makes a simple slot system sufficient.
- **Fixed 3/4 camera with several facing directions.** This is the worst case for 2D and costs 3D nothing.

## Options compared

Ratings are my judgement against the brief: ++ strong, + good, o acceptable, - weak, -- very weak.

| Option | Look and animation quality | Every item works with every animation | Cost of item no. 300 | Fit for generated content | Mobile cost at 2 to 10 characters |
|---|---|---|---|---|---|
| **A. 3D modular parts, shared skeleton** | ++ | ++ | + | o | + |
| B. 3D single body, texture-only outfits | o | ++ | ++ | ++ | ++ |
| C. 2D skeletal (Spine, Rive), one rig per direction | + | + | -- | - | ++ |
| D. 2D frame-based layered sprites | o | -- | -- | -- | ++ |
| E. 3D authored, pre-rendered to sprite layers | + | o | - | o | + |
| F. Fully procedural characters built in code | o | ++ | ++ | n/a | ++ |

### A. 3D modular parts on a shared skeleton (recommended)

Each item is a mesh bound to the same skeleton as the body, or a rigid mesh attached to one bone. One animation set drives every combination.

- An item is made once and works from every direction and in every animation.
- Silhouette changes are possible (hats, hair, coats, backpacks), which matters most for a chunky style read at mid distance.
- This is what comparable shipped games do: Zepeto (clothing meshes on a base body with masks that hide the body underneath), Fall Guys (face plate plus upper and lower costume), Destiny (gear slots with reusable pieces).
- Cost: skinned garments need skin weights and must not clip the body. Both are solvable with automation because the body never changes.

### B. 3D single body with texture-only outfits

Outfits are painted onto the body texture, as with classic Roblox clothing or Mii shirts.

- Cheapest per item and the most reliable use of image generation: a 2D image on a fixed UV layout.
- No silhouette change, so characters look alike at mid distance. Too limited as the whole system.
- **Kept as a layer inside option A** for face features, fabric prints, tattoos and make-up.

### C. 2D skeletal with one rig per direction

- Common practice for 8 directions is to draw 5 and mirror 3; for 4 directions, draw 2 and mirror 2 (Spine forum threads, read as search summaries).
- A jacket is roughly 5 attachments (torso plus four arm pieces) in each of 5 directions: about 25 aligned images with mesh weights, against one mesh in 3D. This figure is an estimate, not a published number.
- Turning between directions mid-animation is awkward with separate rigs, and mirroring swaps left and right details.
- Spine's runtime licence requires every user of the runtimes to hold an editor licence, with an enterprise tier above $500k revenue (licence text read directly; prices from search summaries). Rive's runtime is MIT.
- Animation can look very good in 2D, but only at a hand-made art cost that the brief rules out.

### D. 2D frame-based layered sprites

The Habbo model: every part drawn for every direction and every frame.

- Cost is items times directions times frames. Unworkable at hundreds of items with smooth animation.
- Generated frame-by-frame sprites still drift and flicker according to every source found, and the tools that do 8 directions well (PixelLab) are pixel-art only.

### E. 3D authored, pre-rendered to sprite layers

Used by Dead Cells and the original Clash of Clans so that changes do not require redrawing.

- With mix-and-match customization, each layer must be rendered per direction and per frame, and layers cannot sort correctly against each other when limbs cross.
- It needs the complete 3D pipeline of option A and then adds download size and sorting problems. It only pays off for crowds far larger than 10.

### F. Fully procedural characters

Bodies and items built from parameters in code (capsules, lathes, signed-distance shapes).

- Unlimited variation at almost no per-item cost and a distinctive look.
- A ceiling on appeal: items look like variations of the same primitives. Weak against the top criterion.
- **Kept as a technique inside option A** for colour variants, patterns, face composition and secondary motion.

## Recommended architecture

### Runtime

- **One skeleton, one base body.** Fixed proportions. Around 25 to 40 bones.
- **Slots.** Hair, headwear, face accessory, top, bottom, shoes, back, left hand, right hand. Each slot holds one item or nothing.
- **Two kinds of item:**
  - *Rigid* items attach to a single bone: hats, most chunky hair, glasses, backpacks, hand-held props. They need no skinning.
  - *Skinned* items deform with the skeleton: tops, bottoms, shoes, long hair, capes.
- **Body-region masks.** Each garment lists the body regions it covers, and those regions are hidden. This removes clipping without any cloth simulation.
- **Face features as texture layers.** Eyes, brows, mouth and make-up are composed into the head texture (or drawn as decals). Expressions swap the eye and mouth layers. Faces generated as deforming geometry are a known weak point, so geometry is avoided here.
- **Colour.** Items take their colours from a small shared palette or gradient texture plus per-item tint slots. Colour variants are then free, and a shared palette forces visual consistency across items from different sources.
- **Merge after equip.** When an outfit changes, combine the visible meshes and textures into one or two draw calls per character. Epic's Mutable does the same in Unreal.
- **Look.** Toon ramp shading, an outline, and a soft blob shadow.

### Animation

- **Core set from a hand-authored library**, retargeted once, offline, to the shared skeleton. Candidates, all CC0: KayKit Character Animations (made for chunky rigs, the closest style match found), Quaternius Universal Animation Library 1 and 2 (about 250 clips including 8-direction locomotion).
- **Text-to-motion only for gaps** such as emotes and dances. Every generator found outputs realistic, motion-capture-like movement, and none produces seamless loops reliably (the HY-Motion readme states this limit directly).
- **Cartoon feel added in code**, because no tool was found that converts realistic motion into snappy cartoon motion automatically:
  - squash and stretch from bone scaling driven by vertical velocity,
  - spring bones for hair, capes and accessories,
  - a timing pass offline: held poses, overshoot, fewer in-betweens.
- **Retargeting to chunky proportions** copies rotations and then needs corrections: scale root motion by leg length, pin feet with inverse kinematics, offset arms so hands clear the large head. Done once per clip, offline, in Blender.

### What to generate, what to compute, what to make by hand

| Content | Source | Reason |
|---|---|---|
| Base body, skeleton, core animation set | Hand-made or bought, once | Small fixed cost. Every item and clip depends on its quality |
| Concept image per item | Image model, style-locked to reference sheets | Fast, and the main lever for style consistency |
| Rigid items (hats, hair, props, accessories) | Image-to-3D, then automatic clean-up | No skinning needed, so generation risk is lowest |
| Skinned garments | Image-to-3D as a first draft, then automatic fit and weight transfer from the body | Feasible, but the step most likely to need manual fixes |
| Face features, prints, patterns | Image model onto a fixed UV layout | The most reliable use of generation |
| Colour variants, masks, merging, secondary motion | Procedural code | Deterministic and free per item |
| Emotes and dances | Text-to-motion, then the stylization pass | Fills gaps the libraries do not cover |
| Player-generated items | Not at first | Needs a server, moderation and cost control. Texture-only prints would be the first safe step |

### Item pipeline (offline)

1. Generate a concept image in the house style.
2. Image-to-3D. Reported current options: Meshy 7.1, Tripo P2.0 (native quads), Rodin Gen-2.5; self-hosted TRELLIS.2 (MIT).
3. Reduce to the triangle budget and discard the generated texture in favour of the shared palette where the style allows.
4. Place the item in its slot against the base body. Scale and position are fixed per slot.
5. For skinned items, transfer skin weights from the body. Open methods: Robust Skin Weights Transfer (MIT code, GPL Blender add-on), SkinTokens and UniRig (MIT, accept a caller-supplied skeleton).
6. Validate automatically: render the item through a set of test poses and flag clipping, then export glTF.

No tool was found that takes a base body and returns a fitted, skinned garment in one step. Steps 3 to 6 have to be built.

### Mobile budget (proposal)

| Per character, fully dressed | Target |
|---|---|
| Triangles | 8,000 to 12,000 |
| Bones | 40 or fewer |
| Draw calls after merge | 1 to 3 |
| Texture | One 1024 atlas, or a shared palette texture |

Ten characters come to about 120,000 triangles and 30 draw calls. Published guidance sits in the same range: VRChat's mobile tiers run from 7,500 to 20,000 triangles per avatar, and third-party guides cite 5,000 to 10,000 triangles and 1 to 3 draw calls.

## Risks and open questions

1. **Style consistency of generated items.** No independent test on chunky-cartoon characters was found, only vendor benchmarks. Mitigations: style-locked concept images, a shared palette in place of generated textures, strict slot dimensions. *Needs a hands-on test with about ten items.*
2. **Generated garments on joints.** Automatic retopology is reported to miss edge loops at joints, so elbows and knees may deform badly. The chunky style helps: short limbs, thick shapes, few bends.
3. **Layering.** Coat over shirt over body needs rules. Start with one garment per slot and body masks; add layers only if the design requires them.
4. **Licences.** Hunyuan open weights exclude the EU, UK and South Korea. Free tiers of several tools are non-commercial or CC BY. Check before adopting any tool.
5. **Tool facts are unverified.** See the next section.

## Evidence and confidence

Most vendor, paper and press sites were blocked from the research environment. Only GitHub pages and a few others were read directly. Everything else comes from search-result summaries. Version numbers, dates and prices of commercial tools in this document should be treated as reported, not confirmed.

The recommendation does not depend on those details. It rests on structural points: one item per 3D mesh against one per direction in 2D, the fixed body, and what shipped games do.

Read directly:

- Spine runtimes licence: https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.3/LICENSE
- Rive runtime licence (MIT): https://raw.githubusercontent.com/rive-app/rive-runtime/main/LICENSE
- Android geometry guidance: https://developer.android.com/games/optimize/geometry
- three.js retargeting source (rotation copy only, no foot handling): https://github.com/mrdoob/three.js/blob/dev/examples/jsm/utils/SkeletonUtils.js
- HY-Motion 1.0 readme (no seamless loops): https://github.com/Tencent-Hunyuan/HY-Motion-1.0
- NVIDIA Kimodo: https://github.com/nv-tlabs/kimodo
- Mesh2Motion (MIT code, CC0 animations): https://github.com/Mesh2Motion/mesh2motion-app
- TRELLIS.2 (MIT): https://github.com/microsoft/TRELLIS.2
- Hunyuan3D 2.1 licence: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE
- SkinTokens: https://github.com/VAST-AI-Research/SkinTokens
- UniRig: https://github.com/VAST-AI-Research/UniRig
- Robust Skin Weights Transfer: https://github.com/rin-23/RobustSkinWeightsTransferCode and https://github.com/sentfromspacevr/robust-weight-transfer
- rig-parts (image layers to Spine, front view only, no outfit swapping): https://github.com/firejune/rig-parts
- KayKit Adventurers licence (CC0): https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

From search summaries:

- Zepeto masking: https://naverz-group.readme.io/studio-item/docs/masking
- Roblox caging: https://create.roblox.com/docs/art/accessories/caging-best-practices
- Epic Mutable: https://dev.epicgames.com/documentation/unreal-engine/mutable-overview-in-unreal-engine
- Destiny customizable characters, GDC 2014: https://gdcvault.com/play/1020412/Building-Customizable-Characters-for-Bungie
- Fall Guys interview: https://wccftech.com/fall-guys-interview-with-joe-walsh-bloodless-battle-royale-incoming/
- Habbo avatar rendering: https://dev.to/trickstival/habbo-avatar-rendering-basics-4cg6
- Dead Cells pipeline: https://80.lv/articles/case-study-dead-cells-character-art-pipeline
- Spine 8-direction practice: https://esotericsoftware.com/forum/d/26565-which-is-better-component-for-8-direction-animation
- Quaternius Universal Animation Library 2: https://quaternius.itch.io/universal-animation-library-2
- KayKit Character Animations: https://kaylousberg.itch.io/kaykit-character-animations
- Meshy API: https://docs.meshy.ai/api/rigging and https://docs.meshy.ai/api/retexture
- Tripo rigging: https://developers.tripo3d.com/en/docs/animations-rig
- Uthana text-to-motion: https://uthana.com/pricing
- Cascadeur 2026.2: https://www.cgchannel.com/2026/08/nekki-releases-cascadeur-2026-2-with-animation-layers/
- VRChat performance ranks: https://wiki.vrchat.com/wiki/Avatar_Performance_Ranking
- See-through layer decomposition: https://arxiv.org/abs/2602.03749
- PixelLab 8-direction sprites: https://www.pixellab.ai/docs/tools/create-8-rotations-pro

## Addendum: pixel art in isometric view

After the first prototype the target changed to **pixel art, isometric view, a shipwreck survivor on an island**. This section re-examines the recommendation for that target. It uses the earlier research; no new sources were consulted, and items marked "from memory" were not checked.

### Options

| Option | One item works in all directions and animations | Looks hand-pixelled | Fit for generated content |
|---|---|---|---|
| **A. 3D characters rendered as pixel art at runtime** | Yes | Close, not identical | Same as the 3D pipeline, and more forgiving |
| B. 3D characters pre-rendered to sprite layers | Only by rendering every layer, direction and frame | Close, not identical | Same as A |
| C. Drawn or generated 2D pixel sprites, layered | No | Yes | Single characters yes, layered parts no |

**Option A is the recommendation and what the prototype now does.**

- Pixel art is the one style where 2D generation tools exist: PixelLab was reported to produce 8-direction rotations and skeleton-posed animation. That makes option C stronger here than in the original comparison.
- Customization still breaks it. Every item has to line up with the body on every frame of every direction. With 5 drawn directions, about 30 clips and about 10 frames each, that is in the order of 1,500 aligned frames per item (my estimate). No tool was found that produces layered, aligned parts.
- Option B needs the whole 3D pipeline and then adds download size and layer-sorting problems, as before.
- Precedent: Dead Cells built its pixel-art characters from 3D models rendered to sprites (source in the list above). From memory: A Short Hike renders 3D at low resolution, and the developer t3ssel8r has published a 3D pixel-art technique with camera snapping and depth-based outlines similar to the one used here.

### What changes in the architecture

- **Rendering.** Low-resolution render enlarged by a whole number, one-pixel outlines from depth, camera and characters snapped to the pixel grid, eight facings, held poses. Details are in the README.
- **Colour.** Each colour channel is drawn flat with a three-step light ramp. Textures are no longer needed on items at all: an item is geometry plus named colour channels.
- **Faces.** Small hand-placed pixel patterns replace scaled drawings, because a feature is two or three pixels at this size.
- **Unchanged.** Slots, the shared skeleton, merging, cover masking, slot rules, the animation set and the item pipeline.

### Effect on the open risks

- **Generated items become easier, in my assessment.** At about 50 pixels per character, topology flaws, texture seams and small style differences between generated meshes are mostly below what can be seen, and flat channel colours replace generated textures. This is an inference and still needs the ten-item test.
- **Thin shapes are the new weak point.** Anything narrower than about two pixels (blades, straps, fingers) can break up or flicker. Items should be modelled chunky.
- **A fixed colour palette** (for example 32 colours) would tie everything together further but would limit player colour choices to palette entries. Not implemented; worth a decision once real items exist.
- **Animation.** Holding poses at 12 per second hides small flaws in generated motion. Squash and stretch reads less at this size than in the smooth look.

## Prototype

A web prototype is in this repository, using the CC0 KayKit Adventurers pack as stand-in content. It renders in the pixel look on a castaway island by default and can switch to the smooth look. See the [README](../README.md) for what it demonstrates and what it leaves open.

It confirmed the runtime side of the recommendation: mixing parts from different source characters on one skeleton, automatic recolouring and cover masking, texture-layer faces, and one animation set for every combination all work with little code. It did not test generated content, which remains the main risk.
