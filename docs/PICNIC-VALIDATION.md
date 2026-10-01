# Picnic validation

Updated locally on 23 September 2026. The default entry point is now the watermelon challenge; the original picnic is at `/?mode=free`.

## Watermelon challenge

`npm test` now passes 35 tests: eleven challenge tests plus the 24 previous rule tests. New checks cover the 5×5 grid, exact turn costs, cardinal center combos, invalid drops, third-turn refills, occupied-cell protection, queued overflow, automatic empty-mat recovery, deterministic undo/replay, all 25 saved cells, malformed saves, banked watermelons, and completion before a due refill.

`npm run test:challenge` verifies a full fresh round through actual mouse gestures. A simple planning player completes it in 23 turns with 1,520 joys. This proves a legal route exists; it does not establish player session length or balanced difficulty. The suite also covers undoing/repeating a delivery, save/reload, the win overlay, frozen completed state, undoing victory, replay, and independent challenge/free-play saves.

Touch checks cover 320×568, 360×640, 390×844, 412×915, 844×390, 667×375, and 768×1024. They verify dragging, tap-to-place, cancelled touches, immediate Undo, visible goal and turn controls, Help, and no document overflow. Dedicated checks cover a four-fruit center combo excluding a diagonal, keyboard cell movement and sharing, and victory/replay on the smallest phone viewport. Installed desktop WebKit checks cover the grid, goal, touch merge, Undo, and Help.

The mobile controls handle touch release directly and suppress the corresponding delayed compatibility click. This prevents an immediate Undo tap being swallowed after dragging and prevents WebKit from retargeting a delayed Help click onto the newly opened dialog's close button. Keyboard and ordinary mouse clicks keep their normal behavior.

Visual review covered desktop, portrait, landscape, and completion. Short landscape layouts put the goal and growth guide beside the mat to preserve its height. Screenshots include `challenge-desktop.png`, `challenge-phone.png`, `challenge-small.png`, `challenge-landscape.png`, `challenge-small-landscape.png`, `challenge-delivery.png`, `challenge-center-combo.png`, `challenge-complete.png`, `challenge-small-complete.png`, and `challenge-webkit.png` in `artifacts/`.

The existing browser, coin, combo, bubble-wish, and mobile suites have also been run against explicit free-play URLs. Physical phones and human playtests remain unverified.

## Rules

The previous 24 tests remain included: thirteen fruit-picnic tests, six bubble-wish tests, and five retained attic-rule tests. Fruit checks cover all eight merge transitions, one-time rewards, mismatched placement, proximity selection, sharing and the watermelon bonus, maximum-level fruit, free supply and capacity, invalid and out-of-bounds drops, portrait placement, and save recovery. Group checks cover three-, four-, and five-fruit formations on desktop and portrait surfaces, exact preview rewards, direct reach without remote chains, mixed types, the held fruit's previous position, and merging directly from the basket. Bubble checks cover every upgrade with pairs/triples/quads on desktop, portrait, and landscape, cross-family isolation, jar generation, the shared capacity, old-save introduction, hamper sharing, and malformed saves.

## Browser interaction

`npm run test:browser` uses Playwright with installed Google Chrome. Passed checks include:

- Actual mouse drag with a visible match preview, followed by merging and a reward.
- Undo restores both original fruit and their reward balance.
- Cancelling a held drag with Escape keeps the original board unchanged.
- A pear pair reveals a peach on the mat.
- Dragging fruit to the plate shares it and reaches a kindness milestone.
- Dragging a new fruit out of the basket.
- Mismatched fruit are not consumed; ordinary movement preserves the piece count.
- Pip can be picked up, moved, and saved at the new position.
- Fruit layout, rewards, and doll position persist after reloading.
- Keyboard pickup, movement, placement, supply, and undo.
- Optional help, reduced decorative motion, sound, and photo download.
- A Chromium touch sequence performs a real emulated touch drag and merge.
- Two taps perform the alternative pick-and-place merge.
- A portrait save preserves the fruit positions after reloading.
- An isolated late-game fixture verifies two pineapples becoming a watermelon, then direct sharing for the picnic celebration. The primary gesture checks begin on a normal fresh mat.
- Separate combo fixtures use scattered identical fruit. Real pointer gestures arrange two apart or three in a triangle without premature merges; releasing the final fruit in the center combines three or four respectively. Checks verify preview counts and rewards, one resulting fruit, undo, cancellation, and saved results after reload.
- Portrait combo fixtures verify both the third-in-the-gap and fourth-in-the-triangle gestures using emulated touch for the final drag.
- A basket drag completes a triple in one gesture. Undo restores the original fruit, score, and supply sequence.
- Optional Help contains visual placement diagrams for three- and four-fruit combinations.
- Gold coins appear at the merged fruit, rise, and travel to the header. The reward is saved before travel finishes, while the displayed balance increases in exact portions on arrival.
- Overlapping flights collect once. Undo during travel restores the balance and clears coins. Reload during travel preserves the full reward. Sharing, resize, quieter motion, and a fresh-picnic reset also reconcile the displayed balance correctly.
- Portrait coin flights reach the visible counter without horizontal overflow. A separate nine-fruit fixture covers the full fantasy palette and new faces.
- A compact 360×640 layout has no horizontal overflow.
- No uncaught JavaScript errors or failed HTTP responses in the suite.

The visual review covered initial desktop and phone mats, a discovered fruit, the final watermelon, and the compact phone layout. It prompted brighter fruit contrast, more readable fruit faces, and adaptive mat depth to keep objects larger on short phone screens.

## Artifacts

- `artifacts/picnic-desktop.png`
- `artifacts/picnic-mobile.png`
- `artifacts/picnic-small-mobile.png`
- `artifacts/picnic-discovery.png`
- `artifacts/picnic-watermelon.png`
- `artifacts/picnic-photo.png`
- `artifacts/picnic-3-fruit-preview.png`
- `artifacts/picnic-4-fruit-preview.png`
- `artifacts/picnic-touch-3-combo.png`
- `artifacts/picnic-touch-4-combo.png`
- `artifacts/picnic-combo-guide.png`
- `artifacts/picnic-fantasy-fruit.png`
- `artifacts/picnic-golden-coins.png`
- `artifacts/picnic-golden-coins-mobile.png`
- `artifacts/picnic-mobile-compact.png`
- `artifacts/picnic-mobile-phone.png`
- `artifacts/picnic-mobile-landscape.png`
- `artifacts/picnic-mobile-tablet.png`
- `artifacts/picnic-mobile-webkit.png`
- `artifacts/picnic-mobile-photo.png`
- `artifacts/picnic-bubbles-desktop.png`
- `artifacts/picnic-wish-family.png`
- `artifacts/picnic-wish-family-mobile.png`
- `artifacts/picnic-bubble-3-touch.png`
- `artifacts/picnic-bubble-4-touch.png`

## Bubble wishes

`npm run test:wishes` exercises the new jar, keyboard generation, pair preview, undo, save/reload, and the optional growth illustration. Its full journey creates 32 tiny bubbles through the jar control, performs 31 pair merges, and reaches a hamper for 880 merge joys. Sharing produces a single 110-joy payout, and undo restores the hamper and prior balance. Separate portrait fixtures verify three- and four-bubble center combinations with emulated touch. A gallery fixture renders all six original shapes.

The optional WebKit check verifies the bubble shader, two-tap merging, and both jar and fruit-basket label taps. It exposed a release event that stayed on a source label despite canvas pointer capture; tracking the active pointer at window level fixed it.

## Mobile pass

`npm run test:mobile` passes on Chromium with touch emulation at 320×568, 360×640, 390×844, 412×915, 844×390, 667×375, and 768×1024. The same checks were run through the LAN preview on port 4174. The installed Playwright WebKit build 2359 also passed the optional 390×844 mobile render, two-tap merge, coin collection, undo, and Help checks.

- The full mat, supply/plate labels, score, and controls remain within the viewport in portrait and landscape. Main control targets measure at least 44×44 CSS pixels.
- Touch drag merges and awards coins at every size. Undo and the scrollable Help dialog remain usable.
- Touch cancellation and rotation during a drag preserve the fruit layout. A secondary pointer's cancellation cannot cancel the primary drag.
- Changing viewport height, as browser bars do, preserves state. Simulated safe-area padding keeps the interface visible. A seven-digit balance still fits the narrow header.
- Touch supply, sharing, two-tap merging, reload, and mobile PNG capture pass.
- The phone renderer caps pixel ratio at 1.25, uses 1024px shadows, caps bursts at 28 particles, and skips hidden-page rendering. Height changes scale the existing board rather than rebuilding it; discarded textured materials release their textures. These changes reduce rendering work but are not a measured device-performance guarantee.
- Network-preview requests returned 200 for game assets and 403 for project metadata and tests. Requests from this computer to its LAN address succeeded; a physical phone connection has not been observed.

## Limits of the evidence

Phone tests use touch emulation and desktop WebKit, not physical phones or iOS Safari itself. No human playtest, sustained frame-rate benchmark, comprehensive accessibility audit, or browser/device certification has been performed. The initial desktop renderer reported 156 draw calls and about 342,000 triangles; these diagnostics predate the visual revisions and are not a performance guarantee.

The prior attic implementation is preserved, but this revision's primary end-to-end suite targets the picnic. The earlier attic validation remains in `VALIDATION.md`.
