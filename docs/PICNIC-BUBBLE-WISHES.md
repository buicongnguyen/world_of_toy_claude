# Bubble wishes: references, design, and implementation

22 September 2026. The request was to generate small light bubbles that combine, and to research objects that belong in the picnic setting.

## Shape research

The web search included picnic photographs and actual picnic/play-food products. These informed recognizable silhouettes, rather than providing game assets:

| Reference | Useful objects and shape cues | Application |
| --- | --- | --- |
| [Hape Picnic Playset](https://toys.hape.com/products/e3179) | Basket, picnic cloth, drinks, bread, lettuce, tomato, and cheese | A layered sandwich and a drink with an obvious straw |
| [Melissa & Doug felt sandwich set](https://www.melissaanddoug.com/products/felt-play-food-sandwich-set) | Separate bread slices and stackable fillings | Thick, contrasting sandwich layers readable from the overhead camera |
| [KINTO outdoor dining collection](https://kinto-usa.com/collections/outdoor-dining) | Cups, plates, jugs, and other outdoor tableware | Simple cup and vessel silhouettes |
| [The Cornish Tea Party Company](https://www.thecornishteapartycompany.co.uk/) | Tea-picnic imagery with a hamper, cups, teapot, sandwiches, and checked fabric | Rounded teapot with a separate spout and handle; a basket with an arch handle and cloth lining |

The visual search also returned picnic blankets, flowers, jam jars, cakes, and fruit. Those are plausible future families. The current implementation uses a short sequence so players can learn it without a recipe menu. Models, icons, bubble shader, and colors are original procedural work; no reference photograph or commercial toy artwork is bundled into the game.

## Implemented sequence

**Tiny bubble → Glow bubble → Lemonade → Picnic sandwich → Dream teapot → Picnic hamper**

This is a fantasy progression: wishes gradually become the things needed for a picnic. It is not an ingredient recipe. The first two stages are small, translucent bubbles with rainbow rims, bright highlights, a little golden star, faces, and gentle floating motion. Later stages have distinct physical silhouettes:

- Lemonade: tapered yellow glass, striped straw, and lemon wheel.
- Sandwich: triangular bread with visible green, pink, and yellow filling layers.
- Teapot: lavender body, lid, golden knob, curved spout, and loop handle.
- Hamper: woven warm-gold body, arched handle, pink cloth, and toy fruit inside.

## Play rules

Two tiny bubbles are placed in available spaces the first time the feature is loaded. Existing fruit positions and score stay intact. A full mat is preserved; the jar can be used after the player makes room.

The purple bubble jar sits between the fruit basket and Pip's plate. Tap it to create a tiny bubble in available space, or drag a bubble directly from the jar. The jar always starts at the smallest stage. It is free and has no timer.

Matching items in the bubble family use the same direct-reach rule as fruit: two earn the usual reward, three earn 2×, and four earn 3×. The dropped item must reach every group member. A group creates one item at the next stage. The preview names that result and shows its exact reward. Fruit and picnic items never cross-merge, even when their stage numbers happen to match.

The existing gold coins fly from the new item to the score. The bottom growth illustration follows the family being handled. The optional Help panel shows all six stages.

Any bubble or picnic treasure can be shared on Pip's plate. The final hamper does not merge further; sharing it gives its usual 30 joys plus an 80-joy celebration bonus. The shared capacity is 24 toys across both families. Undo, save/load, touch, tap-to-place, and keyboard movement work for both. `J` makes a tiny bubble; `B` still supplies fruit.

## Save compatibility

The existing version-1 save gains `picnicItems`, `picnicDiscovered`, and `bubbleWelcome`. Old saves load with empty defaults and receive the introduction once if space permits. New identities are allocated from the same counter as fruit. Loading rejects duplicate identities, invalid stages, and malformed positions across both families. No existing fruit stage is repurposed.

## Validation

- Six new rule tests bring the total to 24 passing tests. They cover all five upgrades with pair/triple/quad groups on desktop, portrait, and landscape mats; cross-family protection; remote chains; jar previews; shared capacity; introduction/migration; final hamper payout; and malformed saves.
- The bubble browser suite creates 32 tiny bubbles through the jar control and performs all 31 pair merges to make a hamper. It verifies 880 merge joys, then 110 sharing joys, saving, and undo.
- Additional browser checks cover the starter bubbles, jar drag, keyboard supply, help illustration, three- and four-bubble center combos using emulated touch, and the rendered shapes of every stage.
- Existing fruit, combo, coin, and mobile checks continue to cover the original game.
- Mobile tests are browser emulation and desktop WebKit checks. Physical-phone performance and human playtesting remain unmeasured.

Screenshots: `artifacts/picnic-bubbles-desktop.png`, `artifacts/picnic-wish-family.png`, `artifacts/picnic-wish-family-mobile.png`, `artifacts/picnic-bubble-3-touch.png`, and `artifacts/picnic-bubble-4-touch.png`.
