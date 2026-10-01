# The Lantern Picnic 1.2: game UI and Hazel's Trunk

This release covers entering the game, the menus, settings and a new shop, with a focus on phones. It also includes a code and logic review.

## What was wrong

A 390 px phone audit of 1.1 (c2c7a38) found these problems.

**Touch targets.** Most controls were smaller than the 44 px minimum:

| Control | Size |
| --- | --- |
| World labels | 36 px |
| Title buttons | 41 px |
| Close buttons | 36 px |
| Dialogue buttons | 35–37 px |
| Volume sliders | 16 px tall |
| Checkboxes | 20 px |

**Text.** A lot of it was 9.5–11 px.

**Controls looked like a web form.** Settings used default dropdowns, thin sliders and checkboxes. The HUD used text glyphs (↶ ♪ ☰ ⌄) that render as faint letters and differ between platforms.

**Broken states:**
- The loading card and the title were both on screen for several seconds. Shader warm-up blocked the fade, so the player saw two "The Lantern Picnic" titles.
- The celebration showed two "Welcome Nori" buttons.
- Wish names were cut off ("Waterm…"), and the chapter label wrapped onto two lines on phones.
- The hidden HUD stayed reachable by keyboard. Tab and Enter on the title screen could spend an action and skip the prologue.

**No shop.** Golden joys piled up with nothing to spend them on.

## Design system

- **Tap size.** One size everywhere: `--tap` is 44 px, or 48 px on touch screens (`pointer: coarse`).
- **Text.** 11.5 px minimum for labels and 12 px or more for body text.
- **Icons.** Blender-rendered toy icons from `art/blender/render_ui.py` (`npm run assets:ui`), in `assets/lantern-picnic/ui/`: settings, sound on and off, undo, journey, help, shop, close, chevron, coin, music, effects, forest, voices, motion, hints, language and restart.
  - They are 128 × 128 RGBA, shown at 22–44 CSS px.
  - The build strips PNG metadata, as it does for portraits.
- **Text stays HTML.** Labels are never baked into images, so both languages, sharp scaling and screen readers keep working.
- **Menu tiles.** The title screen and Settings shortcuts use tiles with a 3D icon above the label.
- **Sheets.** Every dialog shares one header (icon, eyebrow, title, close button). On phones, sheets dock to the bottom with a grab handle and slide up.
- **Settings** is grouped into Sound, Display and Play:
  - Toggle switches are the real checkboxes restyled with `appearance: none`, so keyboards, screen readers and tests still reach them.
  - Sliders have a honey fill (`--fill`), and dropdowns have a custom arrow.
  - Phones get a Sound switch in Settings in place of the HUD sound button.
- **HUD.**
  - The purse shows joys you can spend. The trunk and settings buttons sit beside it.
  - On phones, Undo stays in the thumb zone and the HUD fades rather than slides.
  - The whole HUD is `inert` whenever it is hidden.
- **Accessibility.**
  - One visually hidden live region announces each dialogue line and speech bubble in full. The typewriter text is `aria-hidden`.
  - Stars and counters have roles, and every Revisit button is named after its picnic.
  - Keyboard focus returns to the board after scenes.
  - The system reduced-motion setting is honoured live, not only on the first visit.

## Hazel's Trunk

A cosmetic shop that gives golden joys a purpose. The rules are in `src/lantern-shop.js`, and the art comes from `art/blender/render_shop.py` (`npm run assets:shop`).

| Kind | Items (price in joys) |
| --- | --- |
| Blankets | Cornflower gingham (free), Strawberry check 600, Meadow plaid 900, Honeycomb quilt 1300 |
| Lanterns | Cream paper (free), Peach blossom 400, Mint leaf 700, Starlight blue 1100 |

- **Blanket textures.** Tileable 512 px albedo textures on the gingham's tile layout. The game swaps the cloth's map and keeps the glTF texture transform and the woven normal.
- **Lantern colours.** They tint the paper and set the glow, the point light and the festival sky lanterns.
- **Previews.** Folded blanket swatches and lit lanterns, rendered in Cycles from the game's own `.blend`.
- **Economy.**
  - Buying records `spent`; it never lowers the story score, so chapter tallies, records and the ending are unaffected.
  - The purse shows `score - spent`.
  - A purchase clears Undo, so a later Undo can never take back joys that paid for a keepsake.
  - Restarting the story keeps everything in the trunk and starts a fresh purse.
  - One full story earns about 4,900 joys, and the whole catalogue costs 5,000.
- **Where to find it:** the title tiles, the HUD trunk button, the Settings shortcuts and the ending screen.

## Review fixes in this release

Two reviewers (a background agent and a peer session) found these.

**Story and flow:**
- A secret wish is no longer asked for after it has been served.
- A closing conversation interrupted by a reload plays again once (`journey.outro` checkpoint).
- Revisits clear the festival from the scene.
- Bramble's lantern really rises first at the festival.
- Tapping the scene skips cinematics on touch, including the reply lantern's arrival.

**Board:** fruit are re-seated (`settleFruits`) after the board changes shape (rotation, a taller card, a desktop save on a phone), and after Undo.

**Scoring and saves:**
- The pace stars count the finishing action.
- "New best" appears only when an earlier record is beaten.
- A reloaded celebration shows this run's stars.
- One `readableSave` test decides both whether a save loads and whether it is backed up.
- A save without a fruit list keeps its journey.

**Settings and state:**
- Undo restores revealed wishes.
- `?quality=` overrides are for one visit only.
- Ambience returns to night after a revisit.

**Input:** holding a key no longer repeats basket or undo actions.

**Wording and layout:**
- Plural fruit names are correct, keepsake names keep their capitals, and Vietnamese fruit names are lower-case mid-sentence.
- The toast fits narrow phones.
- The title and ending scroll on small or landscape phones.

## Verification

- **`npm test`.** 77 checks, including `tests/shop.test.mjs`.
- **`npm run test:lantern`.** Now includes `tests/lantern-ui-browser.mjs`. At 390×844, 320×568 and 1366×860 it checks:
  - every visible control is 44 px or larger on the title, shop, play and Settings screens;
  - the HUD is inert on the title;
  - buying and equipping reaches the 3D scene (texture and glow);
  - a purchase clears Undo;
  - the sound switch, slider fill and restart that keeps the trunk all work;
  - the live region hears whole lines;
  - a reload during a closing conversation replays it once.
