# Fruit sticks — proposed next feature

This is a design for a later playable addition, following the fantasy fruit and gold coin polish. Skewers are not implemented in the current game.

## Why it fits

A fruit stick gives players something physical to compose. It extends the existing pick-up, move, and release gestures and gives a reason to keep several matching fruit. The finished arrangement becomes a small gift for Pip. Keep it on the mat so players can understand it without opening a recipe menu.

## Recommended interaction

1. Pick up a short, rounded wooden skewer from a little stand near the basket. Allow one active stick with five clearly marked slots.
2. Drop a fruit near an empty slot. The slot glows; the fruit slides onto it with a gentle pop. The fruit keeps its recognizable shape, fantasy color, and face.
3. Drag a threaded fruit to another slot to rearrange it, or off the stick to return it to the mat. Threaded fruit do not participate in nearby mat merges.
4. Show the projected coin reward beside the skewer while handling it. Matching fruit glow together. A mix of fruit still has value; matching types add a bonus regardless of slot order.
5. Drag a stick with two or more fruit onto Pip's plate to serve it. Award the previewed total once, send gold coins from the skewer to the counter, and return the empty stick to its stand. Filling all five slots is optional.

## Initial scoring proposal

Start with the sum of the fruit's existing individual sharing rewards. Add a bonus for each matching group on the stick:

| Number of the same fruit | Extra little joys |
| --- | ---: |
| 2 | 10 |
| 3 | 25 |
| 4 | 45 |
| 5 | 70 |

For example, three cherries and two strawberries would give 35 base joys plus 25 for the cherries and 10 for the strawberries: 70 joys total. This is a starting balance for playtesting. Compare it with merging and ordinary sharing so the skewer does not make either action feel pointless.

## Implementation boundaries

- Keep fruit identities stable when moving between mat and skewer; each fruit has exactly one location.
- Resolve an explicit slot drop before mat merging, and make that target visible before release.
- Preview rewards without granting them. Commit serving, removal, kindness, and the reward together. Repeated release events cannot serve the same stick twice.
- Undo restores the whole arrangement, supply state, and reward. Reuse the existing coin cancellation behavior.
- Save the stick position and occupied slots. Older saves should load with an empty stand.
- Keep the stick large enough to handle on a phone; touch, tap-to-place, and keyboard must reach individual slots.

## First playtest

Observe whether players can thread, remove, and serve fruit without an explanation. Check that they can predict the matching bonus and enjoy arranging a mixed stick too. Only then consider extra stick shapes, sparkle trails, or requests from a second doll.
