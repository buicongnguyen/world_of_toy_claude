# The Lantern Picnic — evaluation and implemented redesign

Research and implementation: 23 September 2026.

## The central problem

The previous prototype had a tactile interaction, but almost every decision led to the same outcome: another merge and a larger score. The empty cloth, repeated fruit, generic reward loop, and largely unchanged surroundings made it feel like a mechanics demo. Hiding grid lines improved the surface without addressing that underlying problem. A long fruit ladder is not, by itself, a compelling goal or a reason to return.

The new design gives the activity an emotional destination: **turn an empty clearing into a picnic for three toy friends.** Fruit has competing uses, a visitor makes a specific request, and finishing that request changes the place. A small, cohesive experience is a more useful quality target here than adding many disconnected systems.

## What the references actually contribute

| Reference | Published design | Application to this game |
| --- | --- | --- |
| [Tiny Glade — developer/publisher Steam page](https://store.steampowered.com/app/2198150/Tiny_Glade/) | A small diorama builder with gridless construction, responsive scenery, and no management or combat. | Make the act of handling a miniature world pleasant. Keep the cloth freeform and let toys, foliage, light, and sound carry some of the experience. |
| [Dorfromantik — Toukana press kit](https://www.toukana.com/dorfromantik/presskit) | Landscape building with strategic tile placement, scoring, and unlockable content. | Give a small placement decision a visible purpose, then reward it with a more inviting scene. It does **not** imply that this picnic needs hexagonal tiles. |
| [Fruitbus — developer/publisher Steam page](https://store.steampowered.com/app/2484130/Fruitbus/) | Gathering ingredients, preparing food, and building relationships through a customizable food truck adventure. | Fruit becomes something to prepare and share with a named character, rather than only a score object. |
| [Triple Town — Spry Fox rules](https://support.spryfox.com/hc/en-us/articles/219104828-How-to-play-Triple-Town) | Adjacent matches upgrade objects; the new object may trigger another match. Limited space makes placement matter. | Add previewed chain reactions and useful space management while preserving the user's preference for a cloth without a grid. |

These are design interpretations, not evidence that copying a mechanic produces retention. No third-party models, screenshots, music, or game branding were copied into the game.

## Implemented experience

The default route is now **The Lantern Picnic**. The old watermelon challenge and bubble free-play remain at `classic.html`, with their original save keys. Explicit old `?mode=free` and `?mode=challenge` links redirect there. Lantern progress uses a separate save.

1. **Pip — a little light.** Serve two strawberries and a three-cherry skewer. Learn merging, serving, and threading. The first lantern lights.
2. **Momo — room for one more.** Serve two oranges and a pear, plus an apple skewer. Starting ingredients require more preparation; apples can become either a skewer or higher fruit. Pip remains in the scene. Complete it to light another lantern and reveal moonflower tea.
3. **Nori — the lanterns we share.** Grow and serve a watermelon, and prepare a peach skewer. Higher fruit and chains shorten the long ladder. Completion lights the third lantern and gathers all three friends.

Each invitation has authored dialogue, a visible plate wish, physical skewer progress, a named keepsake, and a preview of the next basket delivery. The phone layout prioritizes these functional goals; the desktop invitation also shows the story text.

## Exact rules

- Fruit moves continuously across the cloth. There are no hidden cells. Repositioning is free.
- Dropping a fruit within reach of identical fruit merges the highlighted group. The held fruit must directly reach every member. Two separated fruit can be joined by a third in the middle, and three can be joined by a fourth in their center.
- Pairs produce one upgrade. A group of three produces an upgrade and a spare original fruit. Four produce two upgrades. Larger groups use the same pairing rule. This preserves the value of extra fruit instead of consuming it for coins alone.
- Initial group coins are `(result tier + 1) × 10 × (group size − 1)`, with tiers starting at zero. Thus cherries give 20 / 40 / 60 coins for groups of two / three / four.
- The primary result can merge again with a nearby identical fruit. Each chain step adds its next-tier reward. Extra outputs from the same gesture cannot consume each other. The preview shows all affected fruit, the final outputs, and total coins before release.
- Requested fruit dropped on the plate counts toward that wish and awards 60 coins. Other fruit can be shared to clear space, for zero coins. Extra servings cannot repeatedly claim a completed wish.
- The wooden stick accepts exactly three of the invitation's specified fruit. It fills one slot at a time and awards 120 coins once. Wrong fruit return without consuming an action; Undo can recover threaded fruit.
- A merge, serving, or threading uses one action. Every three actions the basket releases up to three forecast fruit into available space. Rearrangement, cancellation, and invalid drops do not advance it.
- The basket can also be tapped for supplies. There is a 22-fruit cap; deliveries never overwrite fruit or skip unspawned supplies. An empty board refills. There is no timer or failure state.
- Completing both wishes awards 150 additional coins, lights that invitation's lantern, and pauses progression until the player continues. Undo restores the entire action, including deliveries, score, wish progress, and lantern state.
- Undo covers the last 100 successful actions in the current invitation and session. Opening a new invitation or reloading clears history. Save/reload preserves the actual game state, settings, and partial skewers.
- Coins are a score, not a currency to spend. The animated counter catches up as coins arrive; rewards are saved immediately. Interrupting a flight cannot lose or duplicate coins.

## Art and technical delivery

**Actual Blender 4.5.9 LTS was used**, obtained from the official Blender release server and verified against its published SHA-256 file. The portable executable is local to `.tools/`, excluded from source tracking. Runtime players only need the browser.

- `art/blender/build_lantern_picnic.py`: original mesh/material authoring and GLB export.
- `art/blender/lantern-picnic.blend`: editable asset library, with all asset roots at their runtime origins.
- `art/blender/build_asset_gallery.py`: arranges the models in a Blender studio for inspection.
- `art/blender/asset-gallery.blend` and `asset-gallery.png`: editable gallery and a real Cycles render.
- `art/blender/render_icons.py`: renders transparent portraits from those same models for the invitation and fruit guide.
- `assets/lantern-picnic/lantern-picnic.glb`: 25 named original assets, approximately 3.4 MB, including 12 fruit, three toy friends, basket, plate, skewer, lantern, teapot, cloth, and four forest props.

The scene uses these GLB meshes, warm directional lighting, real shadows, a miniature forest, fireflies, glowing completed lanterns, and bounded confetti/coin effects. Grapes are faceless. Faces are used selectively, not on every fruit. The cloth has modeled hem stitches and slight irregularity rather than a printed grid.

The runtime remains Three.js so the result can be tried immediately in a browser and on a phone. Blender creates the assets; it is not the game runtime. Models can be imported into Unity later without committing this prototype to a larger engine migration.

## Validation and limits

- 48 automated rule tests cover the original modes and the new journey, including exact group/chain results, value preservation, full-board delivery, invalid actions, partial saves, and completing all three invitations from their actual supply on desktop and phone-sized surfaces.
- Browser checks play the whole journey with mouse and touch, restore partial skewers, undo a completion, replay it exactly, and restore the finished story after reload.
- Touch drag, tap-to-place, cancellation, immediate Undo, help, reduced motion, and layout are checked at 320×568, 390×844, 412×915, 844×390, 667×375, and 768×1024. A separate WebKit mobile check verifies assets, tap merging, and Undo.
- The local and LAN previews serve the GLB and portrait assets. The LAN server keeps project source tooling, tests, Blender files, and `.tools` outside its public asset allowlist.

This is a cohesive playable vertical slice, **not a finished AAA production or validated retention result**. It has three short authored invitations, not a campaign or live service. Automated mobile browser emulation does not replace testing on physical low-end phones.

## Next quality gates

Before adding more content, observe 5–10 new players without coaching. Can they explain both wishes within 30 seconds, perform a center combo, anticipate a delivery, and understand why a fruit chained? Measure completion time, invalid drops, help usage, and voluntary replay. Use this evidence to decide whether free basket refills are too forgiving or the long fruit ladder is confusing.

If those basics work, the next production pass should add bespoke character animation, richer sound and music, authored surprise moments, a few optional mastery medals, and more invitations that create different preparation choices. Returning should reveal a new picnic or a personal decoration opportunity. Avoid daily-loss pressure, energy waits, or a longer grind presented as retention.
