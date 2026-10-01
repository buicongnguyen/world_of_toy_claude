# Goals, rules, and reasons to return

**Baseline note:** This review measured the earlier nine-fruit version. The subsequent twelve-fruit art expansion changes the merge chain and basket supplies; its automated completion check takes 17 turns. The historical 23-turn figures below are not measurements of the expanded version. The larger rule and retention proposals remain unimplemented.


Design review, 23 September 2026. This document evaluates the implemented watermelon challenge. All changes below are proposals; game behavior is unchanged by this review.

## Verdict

The game now has a clear finish and a readable turn rhythm. It does not yet have enough strategic variation or lasting progression to justify expecting strong retention. The next quality improvement should be a small set of well-tested decisions, followed by a short sequence of distinct picnics.

Treat the user's AAA ambition as a standard for coherence, feedback, fairness, polish, and validation. Production scale is not a useful target for this prototype. No rule set, reward schedule, or reference game can establish retention without observing this game's intended audience.

## Evidence from the actual rules

Reviewed `src/picnic-challenge.js`, the current design documentation, and the prior browser validation. Ran fresh simulations through `newChallenge`, `challengePlan`, and `dropChallenge`. These are rule diagnostics, not human playtests. They use the one current initial board and delivery seed; the policies are simple heuristics, not optimal solvers.

| Diagnostic | Result | Interpretation |
| --- | --- | --- |
| Prefer pair merges, then the highest upgrade | Finished with 2 watermelons in 23 turns, 1,520 joys; never exceeded 12 fruit | A winning route can ignore larger combos and use less than half of the 25 cells. |
| Prefer the largest available group, then highest upgrade | Finished in 24 turns, 1,620 joys; largest group was 3; never exceeded 12 fruit | This board does not meaningfully exercise four-fruit tactics. This comparison does not prove either policy is generally stronger. |
| Share the first fruit repeatedly | 1,450 joys after 60 turns; 3,000 after 120; zero merges and zero watermelons | Raw coins can grow without progress toward the objective. |

The important structural findings are:

1. **The grid constrains little.** Any fruit can be dropped directly onto any identical fruit, regardless of the intervening cells. Location mostly matters for optional groups.
2. **The refill rate cancels efficient clearing.** Three pair merges remove three pieces; a three-fruit delivery replaces them. Banking a watermelon frees an additional cell. The basket pressures setup moves more than routine merging.
3. **The signature combo can waste goal progress.** Four cherries together produce one strawberry and 60 joys. Two pairs followed by another merge produce grapes and 70 joys, using more turns. A larger group clears space quickly but sacrifices fruit value, while board pressure is often low.
4. **Coins measure persistence as well as performance.** Sharing repeatedly earns coins and receives replacement fruit. This is not a meaningful competitive scoring system, and it would be unsafe to attach an uncapped decoration economy to it.
5. **Replay repeats the same problem.** The initial board, delivery sequence, seed, and two-watermelon requirement repeat. There are no chapters, earned visitor relationships, alternative goals, or permanent decoration choices across rounds.

Keep the clear goal counter, banked progress, preview rings, deterministic undo, visible supply types, touch alternatives, and separate Free play. These are useful foundations.

## Research and what it supports

| Source | Supported finding | Design application; not a promised outcome |
| --- | --- | --- |
| [Przybylski, Rigby, and Ryan: A Motivational Model of Video Game Engagement (2010)](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf) | The review connects experiences of competence, autonomy, and relatedness with enjoyment and motivation for future play. | Test whether players feel more capable, can make meaningful choices, and care about the picnic. An appealing NPC alone does not prove that a player's relatedness needs are met. |
| [Into the Breach — developer/publisher description](https://store.steampowered.com/app/590380/Into_the_Breach/) | Enemy attacks are telegraphed so players can plan a response. | Show the consequences of a drop and the next delivery clearly. Difficulty can come from choosing between known outcomes. |
| [Dorfromantik — developer press kit](https://www.toukana.com/dorfromantik/presskit) | Relaxing presentation coexists with strategic placement, and creative, quick, hard, custom, and monthly modes support different play styles. | Preserve Free play while developing a challenge with meaningful constraints. Begin with a small authored chapter before multiplying modes. |
| [A Little to the Left — official Steam description](https://store.steampowered.com/app/1629520/A_Little_to_the_Left/) | Object puzzles support multiple solutions, daily variations, hints, and an archive of seasonal puzzles. | Offer optional repeatable picnic puzzles, with past content remaining available and several valid solutions. |
| [Scott Rigby — GDC 2012 session abstract](https://www.gdcvault.com/play/1015568/Intrinsic-and-Extrinsic-Player-Motivation) | The abstract discusses how reward mechanisms can help or undermine a longer-term relationship with a game. | Make returns about satisfying play, personal choice, and new experiences. Do not treat more reward popups as evidence of stronger motivation. Only the abstract was reviewed, not the full talk. |

These sources explain mechanisms and design reasoning. None supplies a reliable retention forecast for this game or a universal target percentage.

## Recommended rule prototype

Evaluate one candidate against the current rules before committing to a campaign. Keep the visual theme, 5×5 board, turn-based pace, free undo, and center-based matching.

### Make placement meaningful

Prototype a **straight-line slide**: move horizontally or vertically through empty cells; stop in an empty cell or on a matching fruit. A fruit cannot pass through another fruit. Matching still includes the landing cell and its four touching neighbors. Diagonals do not merge.

Show all reachable landing cells when a fruit is picked up, and show blocked paths before release. Tap-to-place works on the same highlighted destinations. A two-segment journey requires two moves. Sharing remains a separate one-turn action at the plate.

This should create decisions about keeping lanes open, staging a center combo, and saving valuable pieces. It also risks making rearrangement tedious. Compare it with free dragging on matched boards and drop the change if the added actions do not produce understandable, enjoyable decisions. Position needs to matter, but this particular movement rule is a hypothesis.

### Make groups preserve fruit value

Prototype these outputs instead of consuming every member for one upgrade:

| Matching group | Proposed output |
| --- | --- |
| 2 | 1 next-stage fruit |
| 3 | 1 next-stage fruit and 1 unchanged spare |
| 4 | 2 next-stage fruit |
| 5 | 2 next-stage fruit and 1 unchanged spare |
| 6 | 3 next-stage fruit |

The principle is that pairs grow, and an odd spare stays. Larger groups resolve several pieces in one turn and retain the existing extra-coin spectacle. They no longer destroy fruit value merely because the player arranged a group.

Preview the output objects and their cells. Put the first upgraded fruit at the destination, additional upgrades into consumed participants' cells in a stable order, and an odd spare back at the held fruit's original cell. Bank requested maximum-tier outputs as needed. There is sufficient room among the freed cells, but every rule must still be checked for occupied destinations, undo, saves, and mobile readability.

This changes the economy substantially: a four-fruit merge becomes as productive as two pairs while using fewer merge turns. Test the setup cost before tuning extra coins or delivery pressure. Test comprehension of the spare; do not assume the mathematically consistent rule is automatically intuitive.

### Give each picnic a planned supply

Keep the three-turn basket rhythm initially. Give each authored picnic a finite, explicitly shown series of deliveries. Show the next three fruit and preview their landing cells when the next action will trigger a delivery. Recompute that preview if the proposed move changes which cells are free.

The number and contents of baskets must be set from solvability checks and human trials for that picnic, not an arbitrary global number. Higher-tier starting pieces can shorten later goals without requiring long chains from cherries.

If the player cannot finish with the supplied fruit, allow undo, a fresh attempt, or an extra basket from Pip. Extra help still allows the story and basic keepsake to progress; completing within the original supplies can earn an optional planning ribbon. No real-time deadline is necessary.

Preserve the current unlimited supplies in Free play. Do not add new exceptions to the live challenge until the finite-supply prototype has been tested.

### Align scoring with the actual goal

- Ordinary sharing clears space and earns Pip's reaction, but should not grant farmable coins.
- Preserve the gold coin animation for merges and genuine goal milestones.
- Evaluate mastery by completing the requirements with the original supply and, secondarily, using fewer turns. Coin total should not rank an unfinished picnic above a completed one.
- Award persistent keepsakes or decoration choices at fixed first-completion milestones. Do not convert every repeated action into unlimited permanent purchasing power.
- Track personal bests per level and rule version. Different boards, supplies, assisted runs, or goal requirements are not directly comparable.

This provides a clear distinction between an enjoyable round score and earned progression without introducing a second currency or a shop interface.

## Goals at three scales

The player's next action, next session, and next return should each have a different purpose:

| Scale | Player motivation | Example |
| --- | --- | --- |
| Next move | Solve a readable choice | Keep a lane open, serve a requested peach, or save it to grow a pineapple. |
| This picnic | Finish a small, distinct occasion | Prepare two peaches and an orange for a visiting toy. The illustrated invitation stays beside the mat. |
| Across picnics | Discover and personalize | Welcome the next guest, complete a keepsake page, choose a cushion, or improve a planning ribbon. |

For mixed fruit requirements, let players intentionally serve the requested fruit onto a goal plate so they can choose between serving it and growing it further. Bank delivered progress permanently within the round. Keep no more than two main requirements visible at once initially. The current two-watermelon objective can remain a chapter finale.

## First chapter: five authored picnics

These are proposed teaching goals, not validated level specifications. Starting boards and supplies need construction and testing.

| Picnic | Primary goal | New idea |
| --- | --- | --- |
| A seat for Pip | Grow and serve one peach | Learn a move, a pair, and a goal plate. |
| A little room | Serve one pineapple | Plan around basket arrivals and keep a lane open. |
| Moss arrives | Serve two peaches and one orange | Choose what to serve and what to keep growing. |
| Fruit for two | Serve two pineapples | An authored arrangement introduces a productive four-fruit combo. |
| The watermelon picnic | Serve two watermelons | Combine the learned rules; optional efficiency ribbon. |

After the chapter, Moss stays for a small celebration and leaves an embroidered star or lantern. Let the player place the keepsake around the mat. Give a visible glimpse of the next guest and a clean stopping point.

Future invitations can change a small number of things: supply mix, starting positions, a fixed cup blocking a lane, or one optional pattern request. Introduce one new rule at a time. A new background alone does not create a new decision.

## Reasons to return

1. **Mastery:** replay a familiar invitation with a different plan; improve a ribbon or personal best. The game needs more than one useful strategy.
2. **Curiosity:** the next visit changes the arrangement or objective, and reveals a small character moment.
3. **Ownership:** choose and place permanent keepsakes, cloth patterns, plants, and cushions. Decoration should express taste, not raise mandatory merge power.
4. **Low-friction variety:** after the authored chapter works, add an optional weekly postcard puzzle with an archive. Missing a week does not remove content or erase progress.

The fruit-stick feature is still a good later addition because it gives fruit another physical use. Introduce it after the goal and economy are coherent; adding it now would obscure which change improved the core game.

## Validation before expanding content

### First: rules and understanding

Use 6–8 formative playtests with teens/adults who enjoy cozy games, including physical phones. Counterbalance the order of current and proposed rules to reduce learning effects. This is a usability and preference exercise, not a statistically reliable retention estimate.

Observe whether players can explain the goal, turn cost, refill timing, and merge output; predict a four-fruit outcome; identify at least two plausible moves; recover from a crowded board; and choose to continue after the first win. Ask what made a decision interesting or irritating. Record false drops and unnecessary setup actions, rather than assuming longer sessions mean better engagement.

Example internal quality gates: at least 7 of 8 testers can state the goal and refill rule without prompting, and at least 6 can correctly predict the new four-fruit output after its introduction. These are proposed development gates, not industry benchmarks or measured results. Investigate individual failures instead of treating a small-sample pass rate as conclusive.

### Then: repeated play

Test the five-picnic chapter with a larger recruited cohort over a week. Specify the return windows before collecting results, distinguish voluntary returns from scheduled research appointments, and keep incentives independent of how much participants play.

Measure first-picnic completion, voluntary start of a second picnic, return for another session, chapter completion, abandoned goals, assistance use, and reasons for stopping. For D1 or D7 reporting, define whether it means return on that exact day or any return within a window and include the cohort denominator. Compare cohorts with the same content access and recruitment; choose sample size from a predeclared detectable improvement and baseline rather than inventing an AAA retention target.

Persistent logging or analytics collection is a separate implementation decision. No tracking was added for this review.

## Build order

1. Prototype movement and productive group outputs on a few matched boards; isolate their effects before combining them.
2. Build a goal schema, supply schedule, delivery preview, and progress banking for one authored picnic.
3. Validate scoring, win/assist behavior, save migration, and undo against that picnic.
4. Author the five-picnic chapter, one guest, and one persistent keepsake choice.
5. Run return-play testing, then decide whether the next investment should be more puzzles, fruit sticks, or character content.

The desired feeling is: **I understand what I can do, my plan made a difference, and I want to see the next picnic.**
