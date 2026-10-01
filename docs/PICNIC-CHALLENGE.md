# The watermelon picnic

Implemented 23 September 2026. The default game has a round with a visible goal, turn counter, and scheduled supplies. Placement uses a hidden grid under a soft linen surface. Free play remains at `/?mode=free`, with its existing save and bubble wishes.

## Goal and rules

- Make **two watermelons**. Each completed watermelon is automatically stored on Pip's plate. The second finishes the round; the result shows turns, merges, and golden joys. Score is a secondary measure, not an alternative win condition.
- The mat has **5 columns and 5 rows**, with at most one fruit per cell. Drag or tap twice to move to any cell; pieces do not need a path through empty cells.
- Dropping onto an identical fruit merges it. Dropping into a new cell also includes identical fruit immediately above, below, left, and right of that destination. Diagonals and distant chains do not participate. An occupied cell with a different fruit rejects the move.
- The held fruit's original cell is excluded. Dropping back into that cell does nothing. Golden rings show the exact group before release.
- A group creates one next-stage fruit. Base rewards are ten times the result’s position in the twelve-fruit chain; three give 2 times the base reward, four give 3 times, and so on. Larger groups clear more space per turn but use more fruit for the upgrade.
- A successful fruit move, merge, or share costs **one turn**. Invalid drops, cancellation, selecting fruit, checking the basket, settings, and moving Pip cost none.
- Every **three turns**, the happy basket releases **three fruit** into empty cells. The next fruit types and countdown are visible above the mat. Arrival positions use a saved deterministic sequence, so undo and replay produce the same delivery.
- If only part of a delivery fits, leftovers wait in the basket. The countdown pauses while they wait. A subsequent move that frees cells admits them; the next countdown begins after the waiting delivery has finished. Nothing overwrites a fruit or causes an immediate loss.
- An empty mat receives the next delivery immediately and restarts the countdown. This prevents a dead end after sharing the last fruit or banking the first watermelon with no fruit remaining.
- Sharing fruit on the plate clears its cell and earns its usual sharing reward. Watermelons are banked automatically when made and cannot be accidentally shared away.
- Winning is resolved before any delivery due on the same turn. Finished rounds reject further fruit actions. The player can admire the picnic, view the result again, undo the last move during the session, or play again.
- Undo restores the complete action, arrivals, supply position, score, countdown, and watermelon progress. The existing 25-action session limit remains; undo history does not persist across reloads.

## Why these choices

The grid makes valid placements legible. The countdown makes empty space useful and gives the player a reason to plan. A fixed target creates a clear finish, while the two saved watermelons make progress concrete. Waiting overflow preserves the cozy tone; this is a completion challenge rather than a survival game.

The starting board retains the existing twelve fruit: two each of cherries, strawberries, grapes, oranges, lemons, and pears. The expanded chain adds ruby apples, twilight plums, and dragon fruit. Deliveries repeat `apple, apple, plum, plum, peach, peach, pineapple, pineapple, dragon fruit, dragon fruit, pear, pear`. Higher-stage deliveries support the longer chain. An automated planning player completed a fresh board in 17 turns; this is a solvability check, not an estimate of human session length or proof of balance.

The former freeform triangle gesture becomes a grid arrangement around the destination: place matching fruit on three touching sides, then place the fourth in the center. The matching rules use cells, so they stay identical on phones, landscape screens, and desktop.

## Presentation and controls

The goal, `0 / 2` counter, turn number, next three fruit, and refill countdown remain visible. The visible square patches and checkerboard pattern have been removed in favor of softly woven linen. While moving a fruit, a circular landing glow marks the snapped destination; it is gold for a valid move and rose for a mismatched occupied spot. Matching fruit have golden rings. These cues disappear on release or cancellation. New deliveries hop out of the basket; quieter motion places them immediately. The hidden 5×5 placement, adjacency, turn costs, saves, and goal rules remain unchanged.

Phone portrait uses a compact goal panel. Short portrait screens compress the header and fruit guide. Phone landscape puts the goal and fruit guide beside the mat to preserve play height.

Keyboard: `N` selects the next fruit; arrows move the held position by one cell; `Enter` places it; `T` shares it; `U` undoes; `Escape` cancels; `B` checks the basket. Mouse dragging and two-tap placement remain available. The Help panel explains adjacency, turn costs, waiting deliveries, and the win condition.

## Saves and implementation

- `src/picnic-challenge.js`: grid coordinates, rules, turn processing, queue, goal, deterministic arrivals, and validated loading.
- `src/picnic-scene.js`: linen surface and circular landing preview, basket arrivals, banked-watermelon art, adaptive scaling, and keyboard placement steps.
- `src/picnic-main.js`: mode selection, goal display, progress, result, replay, undo, and separate saves.
- Challenge save: `little-keepsakes-picnic-challenge-v1`.
- Free-play save: the unchanged `little-keepsakes-picnic-v1`. Switching modes preserves both independently. Existing saves are not reset or converted into a grid.

The default root and existing `?v=...` preview links now show the challenge. `?mode=free` explicitly opens the former picnic. The read-only `?debug` diagnostics are used by tests. The LAN preview serves the same game and assets.

## Validation

`npm test` includes 37 rule tests, including the expanded fruit chain and legacy-save compatibility. Challenge coverage includes unique cells; valid and invalid turn costs; direct and center merges; diagonal/remote exclusion; exact delivery cadence; crowded queues; empty-mat recovery; deterministic replay; maximum-size and malformed saves; both goal milestones; terminal locking; and a complete fresh round.

`npm run test:challenge` exercises the actual browser gestures, including a full round, turn/refill UI, undo and replay, reload, final result, restart, separate free-play saves, emulated touch, keyboard steps/sharing, center combos, mobile layouts, and optional installed WebKit.

Physical-phone performance and player understanding still need observation. There is no claim of a tuned difficulty curve, competitive scoring balance, or measured session duration.
