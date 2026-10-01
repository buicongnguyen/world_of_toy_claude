# Little Keepsakes — concept, research, and production plan

This is the earlier attic concept. The current interaction direction and implemented game are documented in [Pip's Fruit Picnic](PICNIC-DESIGN.md).

Design date: 22 September 2026. Audience selected by the project owner: teens and adults who enjoy cozy games.

## Recommendation

Make an intimate adventure about a small cloth doll restoring the objects that hold its owner's memories. Keep one-touch movement and automatic discovery. Replace undirected consumption with acts of repair: resources become a warmer room, character growth, and a story worth uncovering.

**Pitch:** When a handmade doll wakes in a room full of moving boxes, it fears it has been forgotten. By repairing the things its owner loved, it learns that growing up does not have to mean leaving love behind.

**Player promise:** Spend a few unhurried minutes in a beautiful miniature world. Find something small. Make something better. Leave feeling that your care mattered.

**Creative standard:** distinctive material detail, a recognizable protagonist, emotionally specific writing, precise controls, responsive sound, and visible consequences. Those qualities are achievable in a focused game. A literal AAA title also needs substantial staffing, funding, content production, QA, localization, platform work, and time; an engine choice cannot confer that status.

## Evaluation of the original idea

| Original element | Strength or weakness | Refined decision |
| --- | --- | --- |
| Tiny doll that acts like a person | A clear emotional and visual hook. Domestic objects become landscapes. | Keep it. Pip has button eyes, imperfect seams, soft steps, a shy wave, and a green scarf. The prototype includes the seams, eyes, walking, breathing, and scarf; more gestures need later animation work. |
| Start inside a room | A contained, legible space suits touch and limits production risk. | Keep it. Use a fixed dollhouse camera with zoom and a readable floor. |
| Touch to move | Easy to understand; direct collection reduces input burden. | Keep it. Tap a destination; pathfind around furniture; collect when nearby. Provide keyboard and guided movement too. |
| Consume items to grow | A clear reward loop, but unexplained consumption can feel arbitrary and makes every item disposable. | Ordinary trinkets yield repair thread and absorbed wonder. Growth is confidence and care, expressed through titles and later abilities. Memory objects remain in the world. |
| Earn money and frequent bonuses | Feedback is satisfying, but money without purpose becomes repetition. | Earn fictional buttons through discoveries and repairs. Spend them on visible decoration. Give one clear chapter gift; do not require return streaks. |
| Make it look nice in 2D, Blender, or Unity | Art direction matters more than raw polygon count. These tools serve different roles. | Build a stylized 3D room with a fixed camera. Test now in a browser; choose the native production engine after product validation. |
| “AAA-level story” | Ambition is useful; scope and emotion are separate problems. | Write intimate relationships and a meaningful reveal. Build one complete emotional arc before expanding to many rooms. |

## Research and implications

Primary sources were consulted on 22 September 2026. These are qualitative design comparisons, not evidence of market demand, retention, or likely revenue for this project.

| Reference and documented feature | What to learn | Application to this game |
| --- | --- | --- |
| [Chibi-Robo! — Nintendo](https://www.nintendo.com/en-gb/Games/Nintendo-GameCube/Chibi-Robo--267829.html): a tiny household robot helps a family with chores and earns happy points. | Small scale and useful actions can connect an ordinary home to human relationships. | Pip's repairs help the room remember its people. Avoid copying its characters, battery system, story, or visual identity. |
| [Unpacking — official game site](https://www.unpackinggame.com/): domestic objects reveal a life across multiple moves; play has no timers or scores. | Objects and changes in a space can communicate a story without extensive exposition. | The list inside the bear reframes the moving boxes. Later rooms will communicate through placement and recurring keepsakes. |
| [Spiritfarer — Thunder Lotus](https://thunderlotusgames.com/games/spiritfarer/): caring activities support relationships and farewells. | Routine mechanics gain emotional weight when tied to a particular relationship. | Each repair reveals a specific moment with Ada. Our story concerns change and belonging; it does not reproduce Spiritfarer's premise. |
| [Toca Boca World — Toca Boca](https://www.tocaboca.com/kids/toca-boca-world): character creation, world building, and player-authored stories. | Accessible manipulation and personalization give players agency. | Touch controls and earned decorations support ownership. Aim the writing and art at the selected older audience. |
| [Little Nightmares — Bandai Namco](https://www.bandainamcoent.com/games/little-nightmares): a character's journey is presented through a striking, threatening environment. | Scale, silhouette, and lighting make a room feel significant. | Use familiar objects at doll scale and deliberate light composition, with a reassuring tone. |

**Inference:** a combination of tactile discovery, restoration, and environmental storytelling is a promising direction for this idea. It is a hypothesis to test with players, not proof of commercial viability.

Research suggests three useful design questions: Can the player name what changed after a repair? Can they explain why Pip cares? Do they want to touch another object without being promised a currency payout? The vertical slice should answer these before adding more systems.

## Identity and tone

- Working title: **Little Keepsakes**. This is a development title; commercial naming and trademark clearance remain future production tasks.
- Tagline: **A small world of wonder.**
- Character: Pip, a palm-sized linen doll made from a green coat and a handful of saved buttons.
- Human relationship: Ada, now moving to her first flat. Her presence is felt through objects, handwriting, and small memories.
- Toy friend: Bear, old enough to have lost one eye and kind enough to pretend it does not matter.
- Mood: late-afternoon warmth, domestic quiet, gently funny observations, tenderness without constant sadness.
- Materials: washed linen, worn wood, stitched wool, folded paper, brushed brass.
- Palette: paper cream, faded sage, peach, dusty rose, muted gold.
- Sound: soft music-box notes, thread pulls, cloth steps, tiny wooden clicks, and a room with space to breathe.

Avoid making Pip into a generic mascot. Its unusual silhouette, little scarf, slightly off-center seam, and specific observations should recur across art and writing. Future animations should show a pause of curiosity before movement and a little pride after helping.

## Story

The emotional question is: **If someone outgrows their toys, does the love disappear?** The answer arrives through what the player does.

### Chapter 1 — The things we keep (implemented)

Pip wakes amid packing boxes. The room is familiar but quieter than it should be. Its lamp has gone dark, its music box has stopped, and Bear has a loose stitch. A short first-person observation introduces curiosity without a long cinematic.

1. **A light left on.** Repair the lamp. The light recalls Ada's parent making Pip late at night while Ada tries to stay awake. Pip learns it was made for someone, rather than merely manufactured. The restored lamp and fairy lights glow.
2. **The almost-right song.** Repair the music box. Ada used to conduct make-believe expeditions on the bedroom rug. The mechanism misses a note; Ada's laugh filled the gap. The music returns when sound is enabled, and the little figure turns.
3. **Room for one more.** Mend Bear. A note tucked behind him lists what Ada intends to bring to her new flat. Pip, Bear, and the music box are all on it. The packing boxes were a sign of inclusion, not abandonment. Bear receives a proper button eye.

The chapter ends with the idea that growing up can include taking treasured things along. Pip thanks the player with a finite gift. The player can stay, decorate, take a room photo, and reread the memories.

### Proposed full-game arc (not implemented)

| Chapter | Place and practical goal | Emotional movement | New action to prototype |
| --- | --- | --- | --- |
| 1. The things we keep | Childhood attic; restore three keepsakes. | Fear of being forgotten → belonging. | Walk, discover, mend. |
| 2. A room of our own | Ada's new flat; build a cozy corner from packing scraps. | Belonging is made through care, not tied to one address. | Push a light object and make a simple bridge. |
| 3. The other side of the wall | A shelf shared with a neighbor's neglected toy. | Pip can offer the care it once received. | Cooperate with one companion in a short, forgiving puzzle. |
| 4. A stitch apart | A storm disturbs the room and damages Pip's scarf. | Helping also means allowing others to help you. | Choose the order of meaningful repairs; never impose a timer. |
| 5. Room for one more | A repaired toy corner becomes a welcome for someone new. | A keepsake's story can continue through a new relationship. | Arrange a final tableau using the objects chosen along the journey. |

Do not undo the first chapter's ending with an arbitrary betrayal. The later challenge is how to keep caring through change. Choices should alter personal details, keepsake placement, and dialogue rather than threaten a hidden “bad ending.” Further chapters need writing review and playtests before production.

## Interaction and progression

**Moment-to-moment loop:** notice a glimmer → tap to walk → Pip examines and automatically collects it → gain thread, buttons, and wonder → restore a meaningful object → watch a change and read a memory → choose a decoration or explore again.

The guiding card always points to a next useful action. Tapping it is an alternative to precise world targeting, particularly on a small screen. Markers allow direct keepsake selection. Furniture blocks walking; the pathfinder finds a route through available floor space. Menus pause movement so Pip does not run off while the player reads.

The prototype expresses growth through four named stages: A little spark, Curious little soul, A helping hand, and Keeper of small things. Production should tie later growth to useful actions such as reaching a drawer or pulling a ribbon. These ability unlocks are not yet implemented; avoid adding grind just to lengthen the chapter.

### First-chapter economy

| Event | Count | Thread | Buttons | Wonder |
| --- | ---: | ---: | ---: | ---: |
| Discovery | 9 | +1 each | +5 each | +8 each |
| Restoration | 3 | −3 each | +20 each | +20 each |
| Completion gift | 1 | 0 | +40 | 0 |
| Daisies | 1 | 0 | −20 | 0 |
| Bunting | 1 | 0 | −30 | 0 |
| Cushion | 1 | 0 | −25 | 0 |

Totals: 9 thread found and spent; 145 buttons earned after the gift; 75 buttons for all decorations; 70 remain; 132 wonder. Growth thresholds are 0, 24, 64, and 110. A decoration purchase never competes with a required repair resource. Repeating a discovery, repair, gift claim, or purchase yields no duplicate reward. Progression can finish from a fresh save with the finite objects already in the room.

Frequent feedback comes from small observations, collection sounds, growing confidence, and changed objects. Avoid making all those events modal: only the three major memories interrupt play. There is no hunger penalty, decay, fail state, countdown, or requirement to return tomorrow.

## Technology and art decision

The tools named in the original idea are complementary:

- **2D or 3D** is an art and interaction choice. For this concept, a fixed-view 3D diorama gives understandable space, readable objects, and real light changes without a complex camera.
- **Blender** creates the production models, rigging, animation, and renders; its official [feature overview](https://www.blender.org/features/) describes that asset pipeline. It is not the runtime selected for this game.
- **Unity** is a game engine suitable for both 2D and 3D projects, as described in its [manual](https://docs.unity.com/en-us/engine/6000.5/manual/get-started/first-time-user/2dor3d). It is a reasonable future choice for native phone and desktop distribution, but would require a deliberate port and platform QA.
- **Three.js** provides the [WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html) used by this prototype. It permits immediate browser play and local iteration without an editor install. Assets are currently original procedural geometry and canvas textures.

Do not choose an engine based on the word “AAA.” Validate the core feeling now. If native mobile/PC release is confirmed, evaluate Unity alongside the team's experience, profiling results, tool requirements, accessibility, and current licensing terms. No license-cost assumption is included here.

For a production asset pass: build Pip as a rigged character in Blender, author a small material atlas, keep background silhouettes simple, bake environmental lighting where appropriate, and reserve dynamic effects for the few objects whose state changes. Preserve this prototype's chapter data and economy specification; replace its rendering implementation intentionally rather than expecting a one-click conversion.

## Refined execution plan

### Phase 1 — Prove one afternoon (implemented in this delivery)

Create a single explorable room; a recognizable moving doll; touch, pointer, keyboard, and guided input; nine discoveries; three repairs; three memory scenes; a coherent ending; growth; a gift; three persistent decorations; local save; sound controls; reduced decorative motion; room photo export. Separate pure game rules from rendering and test a complete playthrough.

### Phase 2 — Watch players (next gate)

Recruit 8–12 people matching the selected audience. Give only the premise, then observe 10–15 minutes. These sample sizes and thresholds are proposed working criteria, not a statistically validated study design.

- At least 80% collect their first item within 60 seconds without verbal instruction.
- At least 80% complete the first repair within five minutes.
- At least 70% finish the room without intervention.
- At least 70% can explain the final reveal in their own words.
- At least 70% say they would voluntarily try a second room, and can say what interests them.
- Observe physical-device frame pacing, touch misses, readability, accidental purchases, and camera occlusion. Compare behavior with stated enjoyment.

Ask: “What did you think Pip wanted?”, “Which object mattered to you?”, and “Where did you feel lost?” Do not ask only whether the game is cute. Revise navigation and writing before adding content if these gates fail. Store no analytics or recordings without a separate consent process; none are built into the prototype.

### Phase 3 — Production vertical slice

Plan approximately 4–8 weeks for a small experienced team to validate one production-quality room after playtest revisions. This is a rough planning assumption, not a commitment. Tasks: rig and animate Pip; add one physical interaction; final materials and light; authored sound; appropriate text sizing and contrast; remappable controls; accessibility review; robust save migration; real-device profiling. Set a target of stable 30 fps on the agreed minimum phone and 60 fps on the agreed desktop, then measure rather than infer compliance.

### Phase 4 — A focused commercial game

Only greenlight additional rooms after the vertical slice meets the player and device criteria. Start with a 2–4 hour premium game or a free first chapter with a single clearly priced full unlock, subject to later audience and store research. Avoid staking the design on advertisements, random paid rewards, or punitive return loops.

A possible staffing shape is a gameplay programmer, technical artist, environment artist, character animator, narrative/designer, and shared audio/QA support, with roles combined where practical. A 6–12 month production window after the validated slice is an initial scope discussion, not a reliable quote. Budget and schedule require a content breakdown, rates, platform targets, and staffing commitments. This is the scale of a polished small commercial game, not an estimate for a literal AAA production.

## Risks and mitigations

| Risk | What would reveal it | Response |
| --- | --- | --- |
| Collection feels like errands | Players optimize currency and ignore the room. | Improve object reactions, provide short interactions, and cut redundant pickups. |
| Doll has little agency | Players cannot describe Pip's personality. | Stronger idle/response animation and observations tied to particular memories. |
| Writing overwhelms play | Players skip all three memory cards. | Stage more of the story in the room; shorten cards; test optional narration. |
| Mobile scale is too small | Frequent touch misses or people zooming constantly. | Larger selection regions, stronger object silhouettes, guided navigation, and a closer adaptable camera. |
| Content becomes expensive | Each room requires many new custom mechanics. | Reuse interaction verbs and modular materials; distinguish rooms through relationships and composition. |
| “Cozy” becomes shallow | No emotional tension or lasting memory. | Keep the fear of change and the specific relationship with Ada; resolve gently without erasing the tension. |
| Performance varies | Frame drops on real midrange phones. | Merge static geometry, atlas materials, profile shadows, and add quality tiers. |

## Completion boundary

This delivery executes the first chapter and supplies the researched expansion plan. It does not claim market validation, production-grade accessibility, physical-device certification, commercial naming clearance, public deployment, a Unity port, authored Blender assets, or a completed multi-hour game. Those are concrete next production gates, not hidden features.
