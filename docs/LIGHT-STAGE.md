# The light stage (1.3, living details 1.4)

The Lantern Picnic 1.2 was a real-time 3D game: Three.js, three Draco-compressed GLB libraries, skinned characters, instanced grass, shadows, bloom and a post-processing chain. It looked right, but players felt it. On a phone, the first screen took seconds to appear, the main thread stalled for seconds while shaders compiled, and a slow CPU halved the frame rate.

1.3 keeps the 3D look but stops paying for 3D where it hurts. The clearing is **pre-rendered** once from the 3D game into 2.5D art, and the game draws that art with the browser's plain 2D canvas. Phones, tablets and modest computers play on this **light stage**. Capable computers keep the full 3D renderer. The 3D code, models and shaders download only on those computers.

## Who gets which

**Automatic** is the default Graphics setting (`src/engine/quality.js`):

| Device | Plays on |
| --- | --- |
| Phones and tablets (touch as the main input, including iPads that report as a Mac), or any screen under 700 px on its short side | Light stage |
| Computers with fewer than 4 cores or under 4 GB of memory, or with data saver on | Light stage |
| Computers without a real GPU (software rendering, no WebGL2) or with an entry-level Intel HD/UHD chip | Light stage |
| Other computers: dedicated GPUs, Apple silicon, Iris Xe and better | 3D, at the tier `autoQuality()` picks |

If 3D cannot start (no WebGL2, a lost GPU), the game opens the light stage instead. It never stops at the error card, because "Try again" would fail the same way. A saved 3D choice then goes back to Automatic, with a short note. The game checks for WebGL2 before downloading any 3D files. If a tab dies while 3D starts (a GPU out of memory takes it down without an error), a marker left in storage makes the next visit play light. If the light stage's art cannot load, the game tries once more, then opens 3D. The probe asks for the GPU the way the renderer does (high-performance, no major-performance-caveat contexts). It also treats phone-class GPUs in computers (Mali, Adreno, PowerVR) and Intel Macs behind Safari's "Apple GPU" name (no ASTC support) like entry-level ones. Settings still offers Light and each 3D tier by hand. Switching between them saves the story and reopens the clearing. Saved settings from 1.2 move to Automatic once. `tests/quality.test.mjs` holds the table, and `tests/lantern-stage2d-browser.mjs` plays it on an emulated phone, a gaming PC, an office laptop and a PC whose 3D fails to load.

## Why pre-rendered 2.5D fits this game

The idea is sound because of how this game is built:

- **The camera barely moves.** Play happens from one fixed angle per screen shape. Everything that looks 3D, including lighting, shadows, ambient occlusion, bloom and the grass, can be baked into a picture from that angle without losing anything the player sees.
- **The world is static.** The island, the props and the blanket never move. Only fruit, friends, lanterns and particles do, and those become sprites.
- **Time of day comes in five steps.** Each invitation has its own hour, so five baked pictures per screen shape cover the whole story, and they dissolve from one to the next.

Classic games did the same with pre-rendered backgrounds (Final Fantasy VII, Resident Evil, Donkey Kong Country), for the same reason: the look of an expensive renderer at the cost of drawing pictures.

What it costs:

- Camera moves are 2D pans and zooms on a fixed angle. There is no orbit around the island.
- Friends animate as flip-book poses (16 per friend), not skinned animation, so their motion reads like stop-motion.
- Light changes per hour rather than continuously.
- Changing the 3D scene means re-baking with `npm run assets:2d` (about 4 minutes on a GPU). For example, 1.3.1 shortened the string lanterns' light so it pools on the grass instead of streaking up the trees behind them, then re-baked every hour.

## How it works

**The bake** (`tools/bake/`, `npm run assets:2d`) runs the game's own `LanternWorld` in headless Chrome, so layout, scatter, lighting and camera are the 3D game's by construction. For each of three screen shapes (`wide` desktop and tablet, `tall` portrait phone, `strip` landscape phone) it writes these files to `assets/lantern-picnic/2d/`:

- `bg-L-T.webp`: the diorama at each of the five hours, with bloom and AO. The blanket field is left mid-grey.
- `cloth-L-B.webp`: each blanket's pattern in perspective, with alpha holding out whatever stands in front of the cloth.
- `fruit-L.webp`, `friend-L-NAME.webp`: sprite atlases lit in neutral afternoon light. They hold 12 fruit and 16 poses per friend.
- Shared lantern sprites (lit and unlit for each paper colour) and the sky lantern.
- `manifest-L.json`: the bake camera's view-projection matrix, anchors (seats, paths, lantern hooks, campfire, plate, skewer slots, the sky band) and sprite pivots and sizes, in both world and image coordinates.

**The stage** (`src/lantern-stage2d.js`) implements `LanternWorld`'s public API, so the story, HUD, save, undo and tests drive either renderer unchanged:

- It maps a world point to the baked pixel through the manifest's matrix, and picks by casting the inverse ray onto the cloth. Browser tests check both against the bake to within a pixel.
- On load, and whenever the hour or the blanket changes, it weaves the chosen blanket into the background once (background × pattern × the hour's gain) into a cached canvas. Each frame then blits that canvas and paints fruit, friends and lanterns back to front. Sprites are multiplied by the hour's light, and glows and particles are additive.
- A 2D camera fits the board into the space the HUD leaves, the same way the 3D camera does. It pans and zooms for arrivals, dialogue, lantern lighting and the festival, and stretches the picture's edges on screens with a different aspect ratio.
- It loads only the current screen shape, hour and blanket, plus the friends already on stage. Some seconds into play, the next hour and the rest of the cast are fetched compressed, and they are decoded only when needed.
- Camera poses are pixels of one baked picture. When a rotation swaps layouts, the camera, particles and image-space effects start afresh on the new picture. The far islands' lights and the reply lantern's path are stored independently of the layout.
- The baked files keep fixed names, and GitHub Pages caches them for about ten minutes. So the build writes each file's content hash into the shipped `manifest.json`, the stage asks for `file.webp?v=<hash>`, and manifests are always revalidated. A deploy can never pair new manifests with cached old pictures.

**3D only where it runs.** `lantern-main.js` imports the 3D scene and asset loader with dynamic `import()`, so the light stage never downloads Three.js, the GLB models or the Draco decoder.

## Living details (1.4)

Small creatures, each tied to the place or the hour it belongs to. They are built the way the `lightweight-game-objects` skill describes: tiny, flat-coloured and moved by a few lines of maths.

- **Koi in the pond** (`src/lantern-life.js`), in both stages. There are five on desktops and three on phones: two koi palettes and a goldfish, in saturated orange, gold and red, because cream koi vanish against the teal water at phone size. They wander inside the water with a turn limit, keep a little room from each other, and now and then rise to kiss the surface with a ring. Tap the water and they dart away in a quick, continuous turn. Their tails beat on an accumulated phase with an eased swing, so going from calm to fleeing never jumps.
- **Butterflies** visit the real flower scatter by day, perch and fan their wings, fly higher between flowers, and leave as the light goes: fewer at sunset, none at dusk.
- **The life of each hour** (`src/lantern-life-hours.js`, light stage), by session d7:
  - afternoon: swallows and dandelion seeds;
  - golden hour: dragonflies at the pond rim and tumbling petals;
  - sunset: a V of birds going home;
  - dusk and night: moths around the lit lanterns and fireflies that slowly fall into step. These replace the old blinking dots.

One simulation, two drawers:

- **On the light stage**, the bake exports the water as `m.pond` (centre, radii, water height) and a mask of exactly the visible water (`pond-L.webp`, a few KB). It renders the water white, with every other object as a depth-only holdout. The fish are drawn into a small layer the size of the pond, tinted toward the water (deeper as the light goes), and cut by that mask. Lily pads, reeds, the stone rim and a bush in front therefore stay on top with no re-stamping. Butterflies visit `m.meadow.flowers`, the flower instances the bake read from the scene.
- **In 3D**, `art/blender/build_critters.py` (`npm run assets:critters`, lightkit) builds `critters.glb`. That is 42 KB, about 1,100 triangles, vertex colour on one material, and every tail and wing hinged. `lantern-life3d.js` draws each species part as one `InstancedMesh`, nine draws in all. The 3D pond is a glaze lying on the turf, so the fish swim pressed flat at the surface, unlit and tinted by the hour, just after the water and under the lily pads. Both files load after the clearing is on screen.

Every creature uses its own seeded random numbers, so gameplay seeds and scripted tests are unaffected. Reduced motion slows or fades them, phones get about 60% of the counts, and the update allocates nothing per frame.

## Measured

These numbers come from production builds of 1.2 and 1.3 on the same machine, one after the other, with no other GPU work running (`perfprobe`: Chrome, CDP network accounting, long-task observer, 6 s of rAF sampling in play). "Phone" is 390×844 at DPR 3 with touch, so 1.3 plays it on the light stage.

| Phone | 1.2 (3D) | 1.3 (light stage) |
| --- | --- | --- |
| Downloaded before the title | 7.2 MB, 162 requests | 2.0 MB, 100 requests |
| Time to title (GPU) | 6.4 s | 1.5 s |
| Time to title (CPU slowed 6×) | 15.4 s | 2.1 s |
| Main-thread long tasks while booting | 5.9 s, worst stall 5.0 s | 0.2 s, worst 0.15 s |
| Frame rate in play (GPU) | 60 fps | 60 fps |
| Frame rate in play (CPU slowed 6×) | 31 fps, 24 janky frames in 6 s | 60 fps, 0 janky |
| Frame rate in play (software GPU) | 5 fps | 22 fps |
| JS heap in play | 35 MB | 4 MB |
| Draw calls per frame | 175, 450k triangles | 19, no WebGL |

On a desktop with an RTX 4080, Automatic picks 3D at High and plays as 1.2 did: 60 fps, with the full 7.25 MB downloaded and 5.1 s to the title. The light stage's frame script costs about 1.5 ms (median) at a 4× CPU slowdown (`tests/lantern-stage2d-browser.mjs`).

About 0.7 MB of what a phone downloads is the HUD's 256 px PNG icons, shared with the 3D game. Converting them to WebP is the next easy saving.

## Keeping it working

- `npm run test:lantern` plays the whole story on the light stage with mouse and touch at seven screen sizes. It also checks that no 3D file is requested, that the bake camera and picking agree, that rotations swap layouts without losing fruit, that hours and blankets swap, and that the frame budget holds.
- `npm run test:lantern:3d` plays the same story on 3D, and the regression suite keeps testing the 3D renderer's GPU memory.
- After changing art, the board, the camera or the friends in 3D, run `npm run assets:2d` and commit `assets/lantern-picnic/2d/`.
