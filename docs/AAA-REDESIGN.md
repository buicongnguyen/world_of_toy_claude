# The Lantern Picnic 1.0: the AAA-grade redesign

This document explains what changed from the 0.3 prototype (see [LANTERN-REDESIGN.md](LANTERN-REDESIGN.md)) and why, how each system works, and what still stands between this build and a shipped premium game.

## Diagnosis of 0.3

The rules were sound and well tested, but the game did not *feel* like a place:

- **Presentation.** An orthographic, top-down board with flat-colored primitives, one light, no post-processing and a static backdrop. It had no sense of scale, depth or time.
- **Life.** The friends were statues. Fruit snapped between positions. Rewards were numbers.
- **Structure.** There was no title, no intro, no ending and no reason to replay. Three short invitations ended abruptly.
- **Audio.** A single sine melody.

## Pillars

1. **A living miniature world.** It should look like a handmade diorama photographed at golden hour. Everything breathes: grass, trees, fireflies, friends.
2. **Tactile handling.** Every pick-up, drop, merge and delivery has anticipation, motion and impact.
3. **One evening, told well.** Time of day is the narrative clock. Each lantern lit makes the clearing warmer as the sky darkens.
4. **Kind mastery.** There is still no fail state and no timer. Stars and par reward planning for players who want it.

## Story and content

| # | Guest | Time | Plate wish | Skewer | Keepsake | Par |
| --- | --- | --- | --- | --- | --- | --- |
| I | Pip the bear | Afternoon | 2 strawberries | cherries | the first lantern | 8 |
| II | Momo the bunny | Golden hour | 2 oranges, 1 pear (unspoken at first) | apples | moonflower tea set | 9 |
| III | Nori the fox | Sunset | 1 watermelon | peaches | paper bunting | 9 |
| IV | **Juniper the owl** (new) | Dusk | 2 lemons, 1 plum (as riddles) | pears | storybook and star jar | 10 |
| V | **Bramble the hedgehog** (new) | Night | 1 dragon fruit (whispered later), 1 pineapple | plums | a festival of sky lanterns | 11 |

The story that ties these together is in [STORY.md](STORY.md).

**Par** (retuned in 1.1) is the best result of several hundred randomized rollouts on the hardest real board shape, plus one. The shapes checked are desktop 14×9.8, landscape 14×6.4 and phone 7.4 × 8.8, 10.2 and 11.8. Asking the basket for fruit costs an action; the automatic delivery every three actions is free. Greedy play earns two stars on every shape (a unit test enforces this), and three stars take planning. Stars are awarded as follows:

- **3 stars** at or under par.
- **2 stars** at or under 1.5× par.
- **1 star** otherwise.

Records keep the best stars, fewest actions and highest joys per invitation.

**Save migration.** Saves from the three-invitation release load as version 2. A finished v1 story resumes at Nori's celebration and continues to Juniper.

**Revisits.** After the finale, any invitation can be revisited from the Journey screen. Finishing a revisit returns you to the festival.

## Presentation

### Camera and framing

- **Gameplay view.** A perspective camera (28° FOV desktop, 34° phone, 46–56° pitch) fits the cloth, a margin of lawn and the lantern string into the part of the screen the HUD leaves free. It uses a lens shift (view offset), so the board is never hidden under UI on any aspect ratio.
- **Refits.** The camera reframes only on resize, screen change or chapter start, and blends smoothly. The board never moves under a finger mid-drag.
- **Cinematics.** A low establishing shot on the title screen, a fly-in for each chapter, a push-in on the lantern being lit, and a slow orbit for the ending. Undo and "Stay a little longer" cancel any push-in.
- **Idle motion.** A gentle drift and pointer parallax, and trauma-based shake for big chains. All of it is disabled by *Quieter motion*.

### Time of day

`src/engine/sky.js` holds five presets. Each defines:

- the sun direction, color and intensity;
- hemisphere sky and ground colors;
- sky gradient colors, cloud sea colors and the deep sky below;
- stars and moon;
- fog and environment intensity;
- exposure, bloom and color grade;
- fireflies, lantern baseline, local lights and dust.

Chapter changes crossfade every value over five seconds. The reflection environment is rebuilt with PMREM from the sky dome during transitions.

**Night readability.** A warm light pools over the cloth as lanterns are lit, so fruit colors stay readable after dark.

### Rendering

- **Tone mapping and passes.** Khronos PBR Neutral tone mapping, which preserves authored base colors. Passes run in this order: MSAA → optional GTAO (Ultra) → Unreal bloom → output → a finishing pass.
- **Finishing pass.** Tilt-shift focus band, grade (saturation, contrast, warmth, tint), vignette and film grain.
- **Materials.** glTF `KHR_materials_sheen` for felt, cloth and peach fuzz. `KHR_materials_clearcoat` for glossy fruit, ceramic and lacquered wood. Emissive paper lanterns. Tileable WebP normal and albedo detail maps.
- **Quality tiers.** Low disables post-processing and swaps physical materials for standard ones. Medium, High and Ultra progressively add MSAA, larger shadow maps, denser grass and GTAO.
- **Tier selection.** Automatic by device class, or manual in Settings. Adaptive resolution drops to 60% if frame time stays above 25 ms.
- **Measured.** 59–61 FPS on every tier in Chrome on the development PC (RTX 4080 SUPER, vsync-capped). High draws ~160 calls and ~630k triangles; Ultra draws ~310 calls and ~1.3M with GTAO.

### Feel

- **Fruit.** Each fruit is a spring system:
  - squash on pick-up and landing;
  - growth pop on spawn and a breathing idle;
  - a pendulum lean in the drag direction;
  - a soft cast shadow on the cloth while lifted;
  - an excited hop for fruit that will join the merge;
  - a hover lift on desktop.
- **Choreography.** Rules actions drive animation. Merged fruit fly into the merge point and the result pops out. Served fruit arcs to the plate and the guest eats. Threaded fruit arcs to its skewer slot. Deliveries arc out of the bouncing basket and land with a sparkle ring.
- **Big moments.** Chains and 3–4-fruit merges add a hit-stop, stronger shake and a chorus of hops from the friends.
- **Guidance.** After 14 idle seconds, a gentle hint pulses a useful move. Hints can be turned off.

### Characters

- **Build.** Rigid-part felt toys with an 11-bone skeleton. Every bone points +Z, so all local axes match and animations are authored as simple math in `characters.py`.
- **Clips.** Seven procedurally keyed clips: idle, walk, wave, eat, cheer, hop and talk.
- **At runtime** (`src/engine/characters.js`):
  - crossfades between clips;
  - blinking by scaling the eye bone;
  - head tracking of the held fruit (or of the guest);
  - walking along stepping-stone paths, snapped to the terrain height field.
- **Voices.** Dialogue appears as typewriter bubbles with per-character babble voices.

## 1.1: art redraw, story and logic review

### What was wrong in 1.0

| Asset | Problem |
| --- | --- |
| Tree canopies, bushes, island rim | Displaced blobs under a Worley "canopy" normal map with dark cell outlines. They read as cauliflower or reptile scales, not leaves. |
| Rocks | The stone texture's cellular cracks made them look like turtle shells. |
| Picnic cloth | A near-blank beige plane that filled half the screen. Its 100-threads-per-unit weave shimmered into noise. |
| Skewer | A flat board with three brass rings. Threaded fruit sat *in* the board, so the skewer never read as a skewer. |
| Plate | Its floor was one triangle fan, so the scalloped rim paint smeared into radial rays. |
| Campfire | A dark hole with a few rocks in daylight. |
| Festival and night | Emissive sky lanterns, glow sprites, a 30-intensity cloth light and strong bloom blew the finale out to white. |

### Blender redraw

These changes are in `art/blender/lantern`, iterated live through MCP for Blender and rebuilt headless.

- **Stylized foliage ("Ghibli tree" technique).**
  - Each canopy is a few soft lobes whose shading normals are bent away from the canopy centre. `Asset.add(..., normals=(centre, blend))` writes them as custom split normals, which glTF exports.
  - The lobes are fringed with alpha-cut leaf-sprig cards: `core.card` for the quads, `textures.leafcard` for the RGBA sprig, and a `leaves` material exported as `alphaMode: MASK`, double-sided.
  - Paint runs from cool and dark underneath to warm and sunlit on top.
  - Foliage specular is lowered (`KHR_materials_specular`) so grazing sky reflections no longer streak the leaves.
  - At runtime the leaf-card shader shades both faces from the bent normal, and so does a Backfacing node in Blender. Otherwise back faces go dark.
- **Rocks.** Chunky toy boulders trimmed by random planes into broad facets (`world.faceted_stone`), with a sun-bleached crown and moss. The stone texture now uses soft pits and faint strata.
- **Picnic blanket.**
  - A cornflower-and-cream gingham: an RGB albedo generated in numpy on a woven-cotton normal map, with one tile per two 1.4-unit checks. It is cool enough that every warm fruit pops against it.
  - A quilted terracotta border with cream piping, a rolled hem, running stitches, settling wrinkles and corner tassels.
- **Skewer.** A bamboo skewer resting in forked stands above the board, with painted slot wreaths. The runtime centres each threaded fruit on the stick (`SKEWER_STICK`), so it reads as pierced.
- **Plate, campfire, wood.**
  - The plate has dense rings under a scalloped cornflower rim band.
  - The campfire is a stone ring around a log tipi with charred tips, an ash bed and embers.
  - The wood grain is calmer, and no longer looks like contour lines.
- **Night and festival.**
  - Night and dusk bloom is gentler, and the cloth light is capped.
  - Sky lanterns glow softer and drift out over the cloud sea.
  - A wide festival camera pose puts the answering far islands on the horizon.

Cost on the development PC: High draws 177 calls and 661k triangles, against about 160 and 630k before. Ultra draws 341 calls and 1.39M. Every tier still holds the 60 fps vsync cap.

### Story systems

The story systems are summarised here and described in full in [STORY.md](STORY.md).

- **Hazel's letters.** Grandma Hazel's letter opens the story, and her reply, carried home by a sky lantern, closes it.
- **Scenes and barks.** Every invitation has a framed arrival scene and an outro, plus in-play barks from the friends.
- **Wish mechanics.** Secret, riddle and whispered wishes are presentation over unchanged rules.
- **Chapter I coaching.** The first invitation coaches the player right away.
- **Journal.** The Journey keeps a memory for every lit lantern. Three stars on an invitation reveals one of Hazel's recipe cards.
- **Finale events.** Bramble's lantern leads the festival; the far islands answer with lights across the cloud sea, and one sky lantern crosses the sky to land beside the plate.

### Logic and code review fixes

A separate review pass wrote proof scripts for each finding. Fixed:

- **Stale cinematic beats.** Every scheduled beat carries a token; undo, advance, revisit, restart and the ending bump it.
  - This fixes continuing during the lantern beat, which used to raise the previous chapter's celebration over the next picnic and freeze its button.
  - It fixes the festival timer throwing a revisit onto the ending screen, and a stale intro ending the next walk-in.
  - Continue appears only after the celebration card has been seen.
- **v1 saves.** The pace counter restarts instead of inheriting whole-story actions, which had given 1★ and career-total scores. Lit chapters without a record show "Lit".
- **Skewer saves.** A malformed skewer save (`[x,x,x]` with `skewers: 0`) repairs itself instead of making the chapter impossible.
- **Chains protect wished fruit.** A chain no longer eats a fruit the guest is still waiting for, or the open skewer's fruit.
- **Revisits.** A revisit can be left from the Journey. Revisits and restarts reset the camera.
- **Finished story.** It leaves a tidy cloth and gives the right hint.
- **Restart.** The confirmation disarms when Settings closes.
- **Unreadable saves** are copied to a backup key before a fresh story overwrites them.
- **Undo** also cancels pending stingers and resumes idle hints.
- **Tap-to-place.** Tapping the basket or a friend while holding a fruit acts on them instead of moving the fruit there.
- **Merges without room.** A merge that has nowhere to put its result says so instead of silently becoming a move.
- **Copy.** Plural fruit names in the copy ("thread 3 apples", "Those cherries…").

Considered and kept as it is: rules still run in each device's own board frame. Retuning par across every real frame, and making basket taps count, addresses the fairness problem without changing how merges feel on a phone.

## Art pipeline

Blender is the only authoring tool. Nothing is downloaded or hand-sculpted:

- **Geometry.** Built from primitives, lathes, swept tubes and displaced blobs.
- **Paint.** Painted per vertex with gradient and noise functions in each part's local space, then multiplied by ray-traced ambient occlusion (BVH hemisphere sampling that includes a ground plane).
- **Surfaces.** A small shared set of surface materials carries box-projected tileable detail maps generated with numpy (FFT noise, wrap-around Worley, and scattered leaf shapes). Foliage cards use authored UVs and an RGBA sprig; canopies use custom split normals.
- **Export.** Draco-compressed GLBs with WebP textures and COLOR_0.
- **Renders.** The same `.blend` renders the HUD portraits, the key art and the asset gallery in Cycles on the GPU.
- **Speed.** A full rebuild takes about 20 seconds headless; icons take 8 seconds and the key art 9 seconds on the RTX 4080.
- **Live iteration.** The pipeline was iterated through MCP for Blender: code ran in the live Blender session and EEVEE/Cycles look-dev renders were checked after each change.

## Audio

`src/engine/audio.js` is pure Web Audio:

- **Music.** Generative, with a palette per time of day, and layers that enter as lanterns are lit.
- **Ambience.** Birds by day, crickets by night.
- **Effects.** 25 effects. Merge chimes climb a pentatonic scale with tier and chain.
- **Stingers and voices.** Stingers for chapters, lanterns and the finale, plus character babble.
- **Mixing.** A limiter, procedural reverb and ducking under dialogue and celebrations. There are separate volume sliders for music, effects, forest sounds and voices.

## Accessibility and comfort

- **Quieter motion** (defaults to the OS reduced-motion setting). It removes camera drift and shake, walk-ins, confetti, bursts and hit-stops, and it shortens cinematics.
- **Controls.** Full keyboard play, forgiving touch targets and tap-to-place.
- **Readability.** 3D-anchored labels for the basket, skewer and plate. Merge previews show the exact outcome before release.
- **Pacing.** No timers, no fail state, and undo restores whole actions, including completions.

## Verification

- **`npm test`.** 62 checks: rules, the five-invitation solvability on three board shapes, stars, records, migration, revisits and audio safety. It also covers:
  - chain protection and skewer-save repair;
  - leaving a revisit and v1 pace migration;
  - "greedy play earns at least two stars on all five real board shapes".
- **`npm run test:lantern`.** Covers:
  - the title, Hazel's letter, the chapter card, the arrival dialogue and scene skip;
  - Momo's secret wish being revealed only when spoken, and an undo during Nori's confession cancelling every pending beat;
  - the whole story with real mouse drags on desktop and real touch on a phone, including completion-undo replay, reload persistence, the ending and a revisit;
  - touch/undo/settings/layout checks at 320×568, 390×844, 412×915, 844×390, 667×375 and 768×1024;
  - the 4-fruit combo and keyboard threading.
- **`npm run test:pages`.** The minified build served from a project subfolder.
- **Earlier modes.** `npm run test:browser` and `npm run test:attic` still pass.

## Next quality gates

1. **Ear pass.** Listen to the synthesized music, voices and ambience.
2. **Physical phones.** Profile real low-end Android and iOS devices; tune the Low/Medium tiers and grass counts.
3. **Playtests.** Five to ten uncoached new players. Measure time to first merge, whether the skewer is understood, star distribution against par, and voluntary revisits.
4. **Content.** More invitations only after the above.
5. **Localization and captions.** Dialogue is already data-driven.


## Reliability fixes (September 26, 2026)

The finale now saves a checkpoint before its conversation and before Hazel's letter. Returning after a reload resumes the unfinished scene; acknowledging the letter marks it seen. Existing completed saves remain completed, and **See the festival** replays the finale without changing scores or stars.

Quality changes dispose every post-processing pass as well as the composer's buffers. Board rebuilds release generated geometry, materials and instance buffers while retaining the shared Blender assets and textures. Rotating a phone preserves the active sky-lantern animation.

The browser regression suite checks finale interruption during both the conversation and letter, repeated quality changes, and repeated portrait/landscape rotations. It is included in `npm run test:lantern` and can run alone with `npm run test:lantern:regressions`.
