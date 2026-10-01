# Pip's Fruit Picnic — revised idea and execution

22 September 2026. This is the current direction, following the request for a surface where players directly pick up, move, and combine vivid objects. The intended audience remains teens and adults who enjoy cozy games.

## Evaluation

The clarified idea has a much stronger interaction promise: **put a toy in the player's hand immediately**. A player can understand a movable fruit before reading a story or opening an inventory. Distinct colors and silhouettes make pairs easy to recognize; a visible transformation supplies immediate feedback. The surface also supports free arrangement, which is valuable even when the player is not pursuing a goal.

The previous attic prototype put too much of the interaction in walking, guiding buttons, repair cards, and memory dialogs. It interpreted “playing with toys” as directing a character. The revised game treats the player as the person handling the toys.

The main risk is becoming an interchangeable fruit-merging game. Keep the doll, the handmade table, and the feeling of sharing a picnic. Also avoid overwhelming the surface with order lists, shops, navigation tabs, or reward popups. Color alone is insufficient: silhouettes, stems, leaves, clusters, and the preview must also identify each fruit.

## Research and interpretation

- [Suika Game — Nintendo's official description](https://www.nintendo.com/en-ca/store/products/suika-game-switch/) describes matching the same kind of fruit to make larger fruit and eventually watermelons. This provides a useful reference for a legible combination rule. The new prototype uses free pickup and placement across a mat, with no falling-fruit container or overflow loss condition.
- [Toca Boca World — official site](https://www.tocaboca.com/toca-boca-world) emphasizes player expression, creating stories, and discovering interactions. That supports using a small world of manipulable objects as the main experience. The art, characters, content, and implementation here are original.

These comparisons inform design judgment. They do not establish demand, retention, sales potential, or an ideal audience age for this prototype. Those require observing players.

## Recommended concept

**Pip's Fruit Picnic:** a cloth doll has set out a little picnic mat. The player makes colorful toy fruit grow by combining matching groups, arranges the table however they like, and shares fruit with Pip. The basket always has more. Kindness brings flowers and tea into the scene.

The emotional story is simple enough to live in reactions: Pip is delighted that someone is playing with them. They bring a flower, save a seat, and contribute a cup of tea. A big watermelon becomes a shared celebration. This supports the original doll premise without interrupting the tactile loop.

### The three actions

1. **Pick up:** fruit visibly lifts and follows the pointer. A click/tap can hold it until a second click/tap, providing an alternative to continuous dragging.
2. **Move:** the fruit follows the player freely. Golden rings identify every matching fruit within reach of the held fruit, and a preview shows the group size and reward. Pip can also be moved.
3. **Release:** a matching group becomes one next-stage fruit. An empty position keeps the fruit there. A mismatched fruit remains intact and gets a nearby clear position. The plate shares the fruit with Pip.

Merge is evaluated only on a deliberate release, so arranging fruit does not trigger an unwanted chain reaction. The whole loop happens on the mat. Help and settings are optional; no gameplay menu needs to be opened.

## What changed

| Earlier prototype | Revised game |
| --- | --- |
| Tap the floor to move Pip | Pick up and drag fruit or Pip directly |
| Automatically collect tiny trinkets | Arrange large, recognizable fruit toys |
| Click a repair action | Drop matching fruit near one another |
| Read modal memory cards | See brief comments and physical changes in the scene |
| Spend buttons in a decoration menu | Sharing automatically brings flowers, tea, and blooms |
| Complete a fixed first chapter | Continue playing freely after the watermelon celebration |
| Desktop-shaped room on a phone | Playmat proportions adapt to portrait screens |

## Implemented rules

The sequence is **cherries → strawberry → grapes → orange → lemon → pear → peach → pineapple → watermelon**. This is a magical toy rule, not a claim about fruit biology. Two or more identical fruit make one at the next stage. The initial mat contains two of each of the first six types, giving the player several immediate pairs and an early peach discovery.

- A pair grants `(new fruit index + 1) × 10` little joys, using zero-based fruit indices. A group multiplies that reward by `(fruit count − 1)`: three fruit earn 2×; four earn 3×; five earn 4×. Groups always create one next-stage fruit, with no stage skipping.
- Group matching is centered on the released fruit. Place two apart and bring a third into the gap, or arrange three in a loose triangle and bring a fourth into the middle. All participants must be the same type and within direct reach of the dropped fruit. A distant fruit touching another member does not extend the group.
- Matching reach is twice the fruit radius plus a small tolerance. Outer fruit can sit beyond one another's matching reach while remaining within reach of the center. A thin circle shows this range while holding fruit; individual rings and the reward preview confirm the actual group. Exact triangle geometry is not required.
- The same rule applies to a fruit dragged directly from the basket. Adding a fruit by clicking the basket places it in available space. Previewing a group never changes the save or rewards; release commits the whole merge as one undoable action.
- Sharing any fruit grants `(fruit index + 1) × 5` little joys and the same number of kindness points.
- Sharing a watermelon also grants 100 bonus joys and records a picnic celebration.
- Kindness thresholds of 3, 8, and 15 reveal a flower vase, a tea cup, and extra blooms. They do not open reward dialogs.
- Two watermelons stay separate; either can be shared. There is no destructive maximum-level merge.
- The basket cycles predictably through the first five types. Fruit is free, with no timer, advertisement, or purchase.
- The mat allows up to 24 pieces. A full mat asks the player to combine or share something; it does not discard fruit or end the session.
- Undo restores the previous complete board and rewards. It covers the most recent 25 successful actions in the current session. Undo history does not persist across reloads.
- Saves preserve fruit types, normalized positions, score, discoveries, supply sequence, kindness, celebrations, doll position, sound, and motion preference.

Growing a fruit and sharing it are different uses of the same object. This gives a gentle decision without forcing a resource grind. Rewards are fictional score; no money or payments are involved.

### Bubble wishes

The mat also has a purple bubble jar and a second merge family: **tiny bubble → glow bubble → lemonade → picnic sandwich → dream teapot → picnic hamper**. Two tiny bubbles are introduced once when space is available; the jar generates more smallest-stage bubbles by tap or drag. Matching picnic items use the same spatial combo rule and reward multipliers, with no cross-family merging. A completed hamper can be shared for its base 30 joys plus 80 bonus joys. Both families share the 24-piece capacity and complete undo/save behavior. The [bubble design and shape research](PICNIC-BUBBLE-WISHES.md) records the references and original visual implementation.

## Visual and interaction direction

The fruit is original, procedurally modeled 3D art with glossy toy surfaces, clear silhouettes, leaves, seeds, stems, and expressive faces. The fantasy palette includes candy-pink cherries and strawberries, violet and blue grapes, bright citrus, mint-green pears, coral-and-lilac peaches, golden pineapples with turquoise crowns, and a striped aqua watermelon. Larger eyes with highlights, rosy cheeks, tiny smiles, and cream star details give the fruit a collectible-toy character. The miniature icons use matching colors and faces. The mat stays quiet so the fruit stands out.

Use soft shadows to show contact with the surface. Lift and tilt the held fruit. Show a combination preview before release, then a brief squash-and-grow motion, small particles, and a short sound. Persist the result physically in the world. Avoid removing the player from the play space for a successful move.

Merging and sharing release a small handful of gilded gold coins with a star stamp, smiling face, and raised rim. Coins first rise from the fruit, then arc toward the matching coin in the header. The displayed balance increases as they arrive. The complete reward is saved immediately; animation never controls the actual reward. Overlapping flights add correctly, undo cancels their visual effects, and reload or resize reconciles the displayed total. Quieter motion skips the flight and updates the balance immediately.

The basket, bubble jar, and plate are objects on the same surface, with small labels. The bottom strip shows the growth sequence for whichever family the player is handling. It is an illustration, not a navigation menu. The header contains only score and secondary controls. The doll reacts to being lifted and to being offered fruit or picnic treasures.

Phone layouts fill the available viewport and account for safe-area insets. Controls have 44px touch targets; supply labels and merge previews stay within the play surface. Landscape uses a shallower mat and compact header/footer. Rotation cancels an active drag without changing the save. Coarse-pointer devices use a lower render resolution, smaller shadow map, and bounded particle bursts. A separate `dev:mobile` server makes game assets reachable over the local network.

## Implementation

The default entry point now loads the picnic. The earlier attic is preserved at `/attic.html`, and its browser save uses a different storage key. The current files are:

- `src/picnic-game.js`: pure merge, placement, sharing, supply, and save rules.
- `src/picnic-art.js`: original fruit, doll, basket, plate, and gift geometry.
- `src/picnic-wishes-art.js`: lightweight bubble rim shader, bubble jar, and original picnic-object geometry.
- `src/picnic-wishes-icons.js`: miniature bubbles and picnic items for the growth strip and previews.
- `src/picnic-scene.js`: Three.js scene, pointer capture, picking, drag previews, touch, keyboard control, and animation.
- `src/picnic-main.js`: action history, sound, saving, feedback, and optional help.
- `src/picnic-coins.js`: original gold coin illustration, reward flights, and displayed balance animation.
- `src/fruit-icons.js`: original miniature SVG fruit illustrations.
- `picnic.css` and `index.html`: minimal interface around the play surface.

No new package dependency was added. Models, icons, textures, effects, and synthesized sound are local. The prototype can run without a network connection after dependencies have been installed.

## Recommended next refinements

First observe the actual gestures. Proposed playtest gates, not measured results:

1. A new player picks something up within 10 seconds without instruction.
2. A new player makes a pair within 30 seconds and can predict the next combination.
3. A phone player can move a chosen fruit reliably without picking a neighboring one.
4. Most participants discover sharing through the plate label and Pip's presence, without opening help.
5. Players spend some time arranging the objects for pleasure, rather than only optimizing points.
6. Players can deliberately prepare a gap or triangle and predict a larger combo from the rings. Check whether the extra joys feel worth using more fruit for a single upgrade; the current multipliers are a starting balance, not a validated economy.

The user's proposed next object is a fruit skewer: slide fruit onto five slots, build a matching-fruit bonus, and serve the finished stick to Pip. The [fruit-stick proposal](PICNIC-FRUIT-STICKS.md) defines the gestures, initial scoring, and save/undo behavior. This remains a future feature. Test that one physical interaction before adding recipe menus or production timers.

After that, consider movable cups, a blanket that changes pattern, or a second doll joining the picnic. These extend the play space naturally. The previously proposed multi-room narrative is deferred until the tactile experience is validated.

## Current limits

This is a browser prototype of a freeform toy surface. It uses deterministic collision-aware placement rather than a full rigid-body physics simulation. Chromium touch emulation and an installed desktop WebKit mobile run have been tested. Physical mobile devices, iOS Safari itself, Firefox, long-session performance, and accessibility beyond the implemented keyboard alternatives still need dedicated testing. The application has not been publicly deployed; the phone preview is on the local network.
