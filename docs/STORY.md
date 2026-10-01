# The Lantern Picnic: story bible

All story text lives in [src/lantern-story.js](../src/lantern-story.js). The rules in `src/lantern-game.js` never read it, so the writing can be revised, localised or captioned without touching par, saves or solvability.

## Premise

Pip the bear lives in a small clearing on a floating island. Grandma Hazel, the Lantern Keeper, went away a year ago, and the clearing's lanterns have been dark ever since.

On Lantern Night, Pip finds a letter from Hazel tucked in the picnic basket. It asks Pip to light the five lanterns again: one for every friend who finds their way to the clearing. Five lanterns shine bright enough to be seen from anywhere in the sky.

The evening runs from afternoon to night. Each friend who arrives carries a piece of the mystery:

- why the lanterns went dark;
- where Hazel went;
- who has been watching from the edge of the clearing.

## Arc

| # | Guest, time | Their problem | What the picnic resolves | Story beat for the whole evening |
| --- | --- | --- | --- | --- |
| I | Pip, afternoon | Missing Hazel; unsure they can do it | The first lantern proves starting is enough | A traveller sees the light |
| II | Momo, golden hour | A lost traveller, too polite to ask for anything | Momo finds a seat and a home, and shares moonflower tea from home | "Amber eyes" have watched from the ferns all day |
| III | Nori, sunset | Guilt: Nori snapped the lantern string the night the lights went out | Confession and forgiveness; Nori's apology bunting is hung for everyone | The darkness was nobody's fault |
| IV | Juniper, dusk | Keeper of the storybook; loves riddles | The truth: Hazel is the Lantern Keeper of every island, gone to wake the far islands, which only answer a clearing that shines with five | One more friend is needed, "closer than you think" |
| V | Bramble, night | Too shy to come out; has kept Hazel's fallen lantern safe for a year | Bramble's courage lights the fifth lantern; the festival begins | The far islands answer, and a sky lantern brings Hazel's reply home |

**The ending.** Hazel's reply reads: "I saw them. Every one." She promises to come home for the next Lantern Night, bringing new friends. That line resolves the evening and opens a sequel.

## How the story is told

- **Letters.** The prologue (Hazel's request) and the finale (Hazel's reply) are handwritten letters over the scene.
- **Scenes.** Each invitation opens with an arrival conversation and closes with an outro after its lantern lights. Scenes use a visual-novel panel with portraits and typewriter text, and the camera frames the speaker. The other friends turn to listen. Lines advance with a click, Enter or Space; Escape or "Skip scene" skips.
  - Revisits and resumed picnics get a one-line greeting instead of the full scene.
  - `?play` skips all scenes, for tests.
- **Barks.** Short in-play remarks come from friends on stage: first merge, servings, chains, finishing the skewer, sharing. Nori also has a "halfway" line that foreshadows the confession.
- **Journal.** The Journey dialog records a memory for every lit lantern.
  - Three stars on an invitation reveals one of Hazel's recipe cards, which gives star-chasing a story reward.
- **World events.** Bramble's own lantern sits beside the guest seat during the last invitation and is the first to rise at the festival. During the finale, lights wake across the cloud sea (the far islands answering), and one sky lantern crosses the sky to land beside the plate.

## Mechanics that serve the story

All of these are presentation over unchanged rules. The rules always accept the real wish, so a lucky or clever guess delights the guest instead of being refused.

| Invitation | Mechanic | Why |
| --- | --- | --- |
| Pip | **Coaching.** Hints come after about 2.6 s instead of 14 s for the first actions. The first hint teaches Hazel's P.S.: "two little things make one bigger thing." | The tutorial is the story's first lesson |
| Momo | **Unspoken wish.** The pear stays secret until the first orange is served, then Momo asks for it. Serving a pear early gets a surprised "How did you know?" | Momo is too polite to ask |
| Juniper | **Riddle supper.** Both wishes are riddles. After a long pause, Juniper gives the answer. | Juniper is the storyteller |
| Bramble | **Whispered wish.** The dragon fruit is revealed only after the pineapple is served. | Bramble is shy |

Near the plate, a secret wish stays secret. The drop preview reads "Offer it to Momo? Maybe it's the wish…" for both a correct and an incorrect fruit.
