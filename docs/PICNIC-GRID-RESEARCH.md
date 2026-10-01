# Making the picnic grid matter

Research checked 23 September 2026 against developer/publisher sources. This is a design recommendation; no live game rules were changed for this research.

## What existing games do

| Game | Playing space | Established mechanic | Lesson for the picnic — design interpretation |
| --- | --- | --- | --- |
| Triple Town | A square grid, normally 6×6 | Place a supplied object into an empty square. Groups of three or more adjacent identical objects upgrade at the placement square. The new object can cause another merge. The board eventually fills. | The result's location should set up a later merge or a chain reaction. |
| Merge Dragons! | Tile-based land with playable and dead areas | Merge three for one upgrade, or five for two. Matching objects from dead land can heal that land. Camp has an optional overlap requirement to avoid unintended merges. | Larger groups can improve useful output; a merge can also change the board itself. Preserve intentional placement. |
| 2048 | A 4×4 grid | A directional move slides tiles; equal values merge. The target is a 2048 tile. | A very small board becomes strategic when one action affects several future positions. Whole-board sliding would substantially change this game's toy-handling experience. |
| Suika Game, original | A box with continuous positions, not discrete placement cells | Drop fruit from above. Identical fruit touching combine. Fruit roll, block each other, and can spill out of the box. | A grid is optional: physics can make position important instead. A falling-fruit mode would be a different interaction from arranging toys on a picnic surface. |

Primary sources:

- [Spry Fox: How to play Triple Town](https://support.spryfox.com/hc/en-us/articles/219104828-How-to-play-Triple-Town), including board dimensions, result placement, chain reactions, and storehouse.
- [Merge Dragons official tips](https://www.mergedragons.com/tips-and-tricks), including matching, land healing, and drag/tap controls.
- [Gram Games: three versus five merges](https://gramgames.helpshift.com/hc/en/9-merge-dragons-1497457953/faq/54-tip-merging-5-at-once-is-better-than-3/), including exact outputs and optional overlap behavior.
- [Original 2048](https://gabrielecirulli.github.io/2048/) and its [four-cell grid initialization](https://github.com/gabrielecirulli/2048/blob/master/js/application.js).
- [Nintendo's illustrated Suika explanation](https://www.nintendo.com/jp/topics/article/e9d2815a-23be-4dab-9264-1b959470e4fb), including falling, rolling, interference, merging, and overflow.

These sources establish mechanics. They do not establish that copying a mechanic will improve this game's retention.

## The current picnic

Reviewed `src/picnic-challenge.js` and the current twelve-fruit chain:

- The 5×5 mat gives precise, readable placement and supports the user's center-combo idea.
- Any fruit can move to any available destination. It need not travel through an empty path.
- A drop considers matching fruit at the destination and its four touching sides. Each action performs at most one upgrade.
- Every three successful turns, three fruit arrive in pseudo-random empty cells. Their types are previewed; their landing cells are not.
- Larger groups produce one upgraded fruit and larger coin rewards. They save turns and space, but consume more fruit for the same single upgrade. This can conflict with a goal of producing two watermelons.
- Sharing removes any fruit, and supplies continue indefinitely. This is a forgiving completion puzzle, not a survival board.

The grid already clarifies the rules. Its main opportunity is to make choosing a destination more rewarding. Increasing its size would add handling and smaller phone targets before addressing that opportunity.

## Recommended direction

Keep the 5×5 square mat, individual drag/tap movement, the two-watermelon goal, and undo. Test one new spatial rule at a time.

### First experiment: planned chain reactions

After the dropped group upgrades, allow its result to merge with touching fruit of its new type. Resolve around the same destination square. Only the active result advances the chain; unrelated groups elsewhere stay put. Show the entire chain, all consumed fruit, the final output, and the coin award before release. One gesture and its chain use one turn, and one undo restores everything.

Example using the actual fruit order: an apple sits to the left of an empty square and an orange to the right. Dropping another apple into the empty square makes an orange, which joins the right-hand orange to make a lemon. Dropping onto the left apple instead makes an orange two squares from the existing orange, so the chain stops. The choice of square now changes the outcome.

Prototype the first example with pairs only. Resolve multiple eligible neighbors and larger-group outputs before enabling cascades on arbitrary boards. An automatic chain must not unexpectedly consume fruit being saved for a future serving requirement.

### Second experiment: useful group rewards

Retain the user's two-, three-, and four-fruit center arrangements. Compare these outputs with the current all-to-one system:

- Two identical fruit: one upgraded fruit.
- Three: one upgraded fruit, with one original fruit returned to a clearly previewed freed cell, plus extra coins.
- Four: two upgraded fruit, with both result cells previewed, plus extra coins.

These are proposed starting rules, not tuned balance. Returning the spare makes a three-fruit arrangement less wasteful; four creates the same useful fruit as two pairs in one turn. Preview which outputs can participate in a further cascade. This should be a separate experiment from adding chains so its effect can be understood.

### Third experiment: uncover the picnic

Place two or three folded cloth patches on authored boards. A merge in a touching square unfolds a patch and opens that cell. This gives positions a visible local purpose and changes the board during play. Teach the unfold rule on its own; use fixed, reachable layouts with generous room. A decorative cup that merely removes a cell is a weaker first addition because it provides no positive interaction.

### Basket follow-up

Test previewing landing cells one turn before delivery. Use pale silhouettes tied to the already visible fruit types. Define a visible waiting rule when an intended square is occupied; do not silently change a promised landing. Compare this against letting the player place delivered fruit, which offers more control but adds up to three extra placement gestures per delivery.

### Fruit sticks, later

Use a short horizontal or vertical stick with three marked positions. Players intentionally drag fruit onto its slots; filling a request serves the skewer to Pip. This introduces a meaningful choice between serving existing fruit and merging them further. Ordinary fruit elsewhere should not automatically become a skewer simply because they form a row. Introduce this after the merge rules are settled.

## What to prototype next

Start with one small authored chain-reaction puzzle and full drop preview. Test whether a player can predict why the center square makes a lemon while another square only makes an orange. Then compare several short picnics with and without chains.

Observe prediction accuracy, accidental consumption, undo use, whether the player tries another arrangement, and whether extra setup feels enjoyable or tedious. Test on physical phones as well as desktop. These observations can guide the next rules; they are not yet evidence of long-term retention.

Earlier discussion proposed requiring paths through empty cells. Keep that as an optional later challenge experiment. Free dragging better preserves the currently requested experience of picking up and arranging toys, and the first experiment can make positions matter without imposing a new movement restriction.
