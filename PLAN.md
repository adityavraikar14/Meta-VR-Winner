# Shadowplay — final-week plan (v4)

**Deadline:** Nov 19, 2026, 1:30 am IST (Nov 18 in US time). We submit by **Nov 18 evening IST**.
**Rule for the week:** every step ends playable and pushed. Tick a box only when it is built, tested and committed.
Earlier plans: [docs/PLAN-v3.md](docs/PLAN-v3.md).

Priorities: **P0** = needed for a winning submission · **P1** = strongly wanted · **P2** = only if time is left.

---

## 1. What the competition actually wants (research, Nov 11)

Sources:
- the Devpost overview text pasted by Aditya
- Meta's 2026 announcement blog
- Meta's 2025 "Meet the winners" post
- UploadVR and Road to VR coverage

The Devpost rules and judging pages block automated reading. **Paste the judging criteria text here if you can see it.**

- **Why Meta runs it:** content for **Meta VR Glasses**, which ship spring 2027. They run the same OS as Quest and support the Immersive Web SDK. Their input is "gaze to target, pinch to select", controllers are not in the box, and they have colour passthrough. Meta wants **hands-first apps for the store**.
- **Gaming track:** "Puzzle, strategy, casual, social, narrative — genres that work well for seated play, without controllers."
- **Hard rule:** the whole experience is usable with hands, end to end.
- **Design tests:**
  - *Airplane seat*: everything within a two-foot radius, seated.
  - *One bus stop*: fast cold start, clean pause and resume, something satisfying in under 10 minutes.
  - *Take it away*: original, not a wrapper around another service.
- **Meta's own tip:** "Scope to one mechanic and finish it. A tight vertical slice is better than a broad prototype with gaps, because judges play what you submit."
- **Prizes we can aim at:**
  - Best New Gaming Experience ($100k, runner-up $50k)
  - Boldest Original Concept, Best First Five Minutes, Best Reason to Come Back, Best Accessibility Forward ($25k each)
  - Judge's Choice ($20k)
- **Last year's winners have a pattern:**
  - **Tiny Golf** (Best Casual): one gesture (pinch, pull, release) on a tiny tabletop course, plus *build your own course*. Bright toy colours; treated as a real product with brand, onboarding and trailer.
  - **Pocket Lands, Hand Survivor, Awesome Hand** (Best Hand Interactions): your hands act *directly and physically* on a small world. They build, swat, block, and guide balls.
  - **Saber Punks:** skill and combos. **DreamSpace and Inkphony:** your real room becomes the game.
  - **The Nanauts and Dun Jun:** IWSDK winners. A web build can win.

## 2. Honest review of our build

| Problem | Why it hurts |
|---|---|
| Reads as a children's game (cute rescue story, berries, glow caps, a hare walking on your hand) | Our players and judges are 15–35 |
| The core trick, "make a fox shape → a fox appears", has no skill once you know the shape | No mastery, no reason to replay |
| Very broad: 17 levels + duel + arena, each fairly shallow | Meta's tip: one mechanic, finished |
| Dim and brown: lantern-lit palette, dark wood UI; Quest 2 passthrough is greyscale | "Dark and boring vibes" |
| Slow first five minutes (table step → growing → menu → warm-up → hare) | The Best First Five Minutes award |
| No creation mode | Tiny Golf won with "create your own" |
| Synthesised animal voices sound alike; eating looks glitchy | Polish |
| Target outline nearly invisible (brown, 35–45% opacity on beige); ghost hand off to the side | New players can't see what to make |
| Hard to test on a laptop | Slows every fix |

## 3. The new direction: one mechanic, finished

> **Your shadow is a real object.**

A spark of light lives on the shadow screen. It falls, rolls and bounces off **anything that casts a shadow**:
- **your hands, live:** paddles, bridges, ramps, walls
- **light shards you place** between the lantern and the screen
- **lines you draw** with a pinch

Get the spark to the lantern gate and collect the three motes on the way.

The skill comes from real optics. **Shadow size = hand × D ÷ d.** A hand close to the lantern casts a huge, fast shadow: power, but coarse. A hand far from it casts a small, slow one: fine control. Every level is a choice between the two.

Why this wins on the criteria:
- **Original:** nobody makes hand-shadow physics. "Build in 3D, play in shadow."
- **Skill for ages 15–35:** reflexes, aim, spatial reasoning, ranks and best times.
- **Hands-first, seated, pinch-first:** fits the Glasses' input model.
- **Build mode, like Tiny Golf's spirit:** the Workshop plus a daily challenge give a reason to come back.
- **Real science:** the projection law *is* the controls.
- **The story machines stay** as the campaign's later acts: the creature summon (now majestic, not cute), truss bridges, forge, brewing, sky lantern, lock, dragon.

## 4. Game structure after the change

| Mode | What it is |
|---|---|
| **Act I · Shadow** (new) | 6 spark levels with your hands only: bridge a gap, ramp, paddle-bounce, *big shadow* (D/d), *precise shadow*, two hands |
| **Act II · Build** (new) | 6 spark levels with light shards: place a plank, *projection* (make a shard's shadow 3× bigger), wedge launch, budget (fewest shards), hands-off runs, a grand course |
| **Act III · Machines** | The Old Well (horse whim, square–cube law), Broken Bridge, Ore Train, Smithy, Healing Draught, Strong Draught, Sky Lantern |
| **Act IV · The Gate** | Dragon's Gate (lock picking), Shadow Dragon (Light or Arsenal) |
| **Workshop** (new) | Sandbox: place shards, set start and gate, test, save 3 slots |
| **Daily Light** (new) | One generated course per day, best time kept |
| **Battles** | Ink Duel, Arena (Arsenal bosses) |
| **Journal & Trophies** | Science pages with your numbers; trophy shelf |

**Leave the main path:** Fallen Log, Tiny Tunnel, High Berries, Lost Star (the childish creature tasks) and the hare walks (Shadow Bridge, High Ledge). They stay in the code for free play, but are not in the story.

**First five minutes:**
1. Play.
2. Optional table step (skippable).
3. *Act I level 1 starts right away* (no menu on first run): within 60 s you are bouncing a spark with your hand.

## 5. Engineering notes

### 5.1 Projection (the core law)

**Coordinates.** We work in paper space: the paper is the plane z = 0, with x right and y up. The lantern sits at L = (Lx, Ly, Lz), with Lz > 0 on the player's side.

**Where a point's shadow lands.** A point P casts its shadow at

  P′ = L + (P − L)·t,  where t = Lz ÷ (Lz − Pz) = D ÷ d.

Here D is the lantern-to-screen distance and d is the lantern-to-point distance.

**How fast a shadow moves.** Differentiate P′ for a moving point:

  v′ = t·v + (P − L)·t²·vz ÷ Lz

So a hand moving across the light moves its shadow D/d times faster, and a hand moving toward the lantern makes the shadow grow outward. Both terms feed the physics: a shadow that moves faster hits the spark harder.

### 5.2 Hands as shadow colliders

- **No latency from the shadow image.** We do not collide with the 80×56 shadow image, which is read back about 20 times a second and lags. Instead, each tracked joint is projected through the lantern onto the paper every frame (5.1).
- **Capsules, not pixels.** Each bone becomes a 2D capsule: a segment plus a radius × t. That is the same joint radii the shadow rig draws, so physics matches what you see.
- **Coverage:** every finger chain, the palm (capsules between the knuckles) and the forearm, about 26 capsules per hand.
- **Velocities:** finite differences of the projected endpoints, low-passed over about 30 ms. A flick of the wrist becomes a fast-moving shadow paddle.

### 5.3 Spark physics

**The spark.**
- A ball of radius 1.2 cm on the paper.
- Toy-scale gravity of about 2.2 m/s², so the 1 m screen reads like a big wall and motion stays readable.
- Speed is capped.

**Integration.** Semi-implicit Euler with 8 substeps per frame, about 600 Hz. That is fine-grained enough that the spark cannot tunnel through a thin shadow.

**Contacts:** circle against capsules (hands, ink), convex polygons (shards, cliffs) and the screen edges.
- **Contact point and normal:** find the closest point q on the shape. If |c − q| < r, the normal is n = (c − q)/|c − q|.
- **Push out:** move the spark back along n by the penetration depth.
- **Moving surfaces:** compute the relative velocity against the surface's own velocity at q.
- **Bounce:** restitution e. Hands 0.55 for lively paddles, cliffs 0.25.
- **Grip:** Coulomb friction μ = 0.3, with the tangent impulse clamped to μ times the normal impulse.

**Fail and win.**
- *Fail:* leaving the screen or falling into an ink pit. Respawn at the start after 0.6 s; it counts as a retry.
- *Win:* the spark's centre inside the gate ring for 0.3 s.

**Cost:** about 60 shapes × 8 substeps × 72 fps, roughly 35 000 tests a second. That is trivial even on a Quest 2.

### 5.4 Light shards (build pieces)

**What they are.** Thin cut-glass shapes: plank, wedge, arch, disc, notch. Each is 4–10 cm across.

**How you place one.**
- **Grab:** pinch within 4 cm of a shard (pinch hysteresis 2.0 / 3.5 cm; release after 75 ms of no pinch).
- **Move:** the shard follows the pinch point in 3D. Its depth is clamped between 15% and 85% of the lantern-to-screen distance.
- **Rotate:** roll your wrist. The roll angle relative to the grab angle turns the shard; on release it snaps to 15°.
- **While held:** the shard shows its live scale, "×2.4", and its outline ghosts on the screen before you let go.
- Shards are on the shadow layer, so they cast real shadows, and their projected outline (5.1) is a collider.

**Budgets.** Each level gives you a set of shards. Using fewer earns a better rank.

### 5.5 Scoring, ranks, records

- **Stars:** ★ for reaching the gate, ★ for all three motes, ★ for beating par time (or for the shard budget in build levels).
- **Records:** best time per level, saved with the story in `play.runs`. Retries are counted, and ranks feed the trophies.

### 5.6 Daily Light

- **The course:** seed = YYYYMMDD → mulberry32 random numbers → 4–6 cliffs, with gaps no wider than the longest shadow a hand can cast, plus three motes on reachable arcs.
- **Solvable by construction:** every gap ≤ 80% of a hand's shadow at d = 0.35 m.
- **Best time** is kept per day.

### 5.7 Workshop saves

`localStorage['shadowplay.workshop.N']` = `{ v: 1, shards: [{ type, x, y, z, rot }], start: [x, y], gate: [x, y] }`. Three slots.

### 5.8 Performance budget (Quest 2)

- 72 fps target.
- The shadow map is already the costliest pass: one 1024² light.
- The spark is one sprite, a 24-point trail and pooled bounce particles.
- Physics is about 0.1 ms per frame.

## 6. Look and sound

- **Brighter look:**
  - The paper becomes warm white with crisp indigo shadows.
  - Higher exposure and fill light on the diorama.
  - UI panels: cream with teal, sunflower and coral accents instead of dark lacquered wood.
  - The spark is cyan-white with a gold trail.
- **Sky backdrop:** a bright gradient sky dome behind the scene. It hides greyscale passthrough on Quest 2 and the emulator's grey room. It is on by default on Quest 2 and can be switched in Settings (*Room / Sky*).
- **Real animal voices:** horse (whinny, snort), stag (red deer roar), fox (bark), and layers for the dragon. Recordings come from Wikimedia Commons or OpenGameArt with CC0 or CC BY licences; we trim and level them with ffmpeg and credit them in CREDITS.md.
- **Eating:**
  - The stag plays its real `Stand_Eating_01` clip at the berries, and the berries shrink bite by bite with crumbs and a chewing sound.
  - The fox has no eating clip, so it sniffs instead of pretending to eat.

## 7. Testing

- **Laptop mouse mode** (dev builds only):
  - The right hand follows the mouse.
  - The scroll wheel moves it nearer to or farther from the lantern.
  - Left click pinches; keys 1–9 set the hand shape.
  - Shift holds the left hand instead.
- **Emulator scripts** for each new level.
- A **spark physics test in Node**: a ball dropped on a capsule bounces to the expected height, and nothing tunnels at maximum speed.
- **Quest 2 alignment checklist:** see the guide page.

## 8. Submission package

- **Hosting:** GitHub Pages. We need HTTPS, a public build and a stable URL. Deploy a first build early, then redeploy.
- **Video (under 3 min), best material first:**
  1. A spark bouncing off a live hand shadow.
  2. Building with shards.
  3. D/d explained in 5 seconds.
  4. The machines.
  5. The dragon.
  6. The Workshop and Daily Light.
- **Form:**
  - tagline (≤ 140 characters)
  - description (≤ 500 words: inspiration, how we built it, what's next)
  - how hand interactions work
  - team names and roles
  - track: Gaming, division: New Experience

## 9. Checklist

### Day 1 — Wed Nov 11
- [x] Research the competition, rules and last year's winners (section 1)
- [x] Find why "I can't see what shadow to make": the outline is too faint and the ghost hand sits off to the side
- [x] P0 Make the target outline and ghost hand clearly visible (cream line on a dark glow; ghost hand larger with a "Copy this hand" label; Skip moved to the other side)
- [x] P0 Laptop mouse test mode (section 7): Shift+M; tested: the hand follows the pointer, the wheel moves it 2 cm per notch
- [x] P0 Spark physics engine with projected hand capsules (5.1–5.3) and a Node physics test (`npm run test:spark`: 6 checks pass)
- [x] P0 Act I levels 1–3 playable (First Light, The Climb, The Kick), proven finishable by `npm run test:levels`

### Day 2 — Thu Nov 12 (Quest 2 in hand)
- [ ] P0 Quest 2 alignment pass with the checklist; fix what's off
- [x] P0 Act I levels 4–6 (Long Shadow, The Low Tunnel, Twin Gaps), proven finishable
- [x] P0 Spark look and sound: glow, trail, bounce sparks, tink pitched by impact speed
- [x] P0 Stars (gate, all motes, par time) on the level card · [x] best times per level ("a new best (was …)")

### Day 3 — Fri Nov 13
- [x] P0 Light shards: pinch to grab, move in 3D, depth clamped, wrist roll turns them (snapped to 15°), live ×D/d label, Drop button · [ ] budget
- [x] P0 Act II build levels: The Plank, Projection, Launch, The Slide (wrist tilt), Two Pieces (two shards), all proven finishable
- [x] P0 GitHub Pages workflow (`.github/workflows/deploy.yml`, tests must pass first) · [ ] Aditya: Settings → Pages → Source: GitHub Actions

### Day 4 — Sat Nov 14
- [x] P0 New story order: Light & Shadow (spark), Structures (whim, bridges, build levels), Fire & Iron, Hot Air, The Dragon; creature errands retired · [x] first run: table → world grows → prologue → level 1, no menu
- [x] P0 New intro, start page, home card and chapter names for ages 15–35 · [x] remaining machine-level lines
- [x] P1 Workshop: build in 3D, play in shadow (the star's shadow is the start, the ring's the gate, glass is the ground); Drop saves the design, Reset restores; the demo course is proven by `npm run test:workshop` · [x] three save slots (Slot button)
- [x] P1 Daily Light (5.6): seeded, every course proven by simulation (`npm run test:daily`: 120 days, 0 fallbacks), best time per day, day streak, Regular trophy

### Day 5 — Sun Nov 15
- [x] P0 Sky backdrop (golden-hour dome, Settings → Sky / Room view; off by default since Nov 12 so your room stays visible) · [x] brighter UI palette
- [x] P1 Real animal voices with credits: the horse neighs and whinnies with real recordings (public domain; CC BY 4.0), credited in CREDITS.md and in game
- [x] P1 Eating: the berry-eating level left the story; the fox's "eating" (a sitting clip) is now a plain idle
- [x] P1 Journal pages for the spark and build levels (magnification, similar triangles, m g h = ½ m v², restitution, reaction time, inclined plane, beam sag), each with its own sketch

### Day 6 — Mon Nov 16 (feature freeze at night)
- [ ] P0 Full playthrough on Quest; frame rate check; fix everything found
- [x] P1 Accessibility: Relaxed spark (60% speed) in Settings · left-handed ghost already · Twin Gaps made easier for two hands (15 cm gaps)
- [ ] P0 Final deploy

### Day 7 — Tue Nov 17
- [ ] P0 Video: shot list, recording on Quest, edit
- [x] P0 Devpost text drafted in docs/SUBMISSION.md (tagline 129 chars, description ~500 words, hand interactions, video shot list) · [ ] Aditya & Yash: names, emails, confirm division
- [ ] P0 Submit (by Nov 18 evening IST)

### Nov 12, second half: the modern look (Aditya: "not childish, not vintage, like Tiny Golf")
- [x] ~~The Light Lab stage for every chapter~~: tried, then undone at Aditya's request (too plain); each chapter's own world (jungle, river, mine, mountain) is back, with your real room visible around it
- [x] Interface: bold sans type, navy caption pill, white cards with a yellow border, colour-coded 3D buttons, icon tokens for resources, a bright start page with an animated spark preview
- [x] The Journal as an engineer's notebook (graph paper, navy ink) and four new, accurate sketches for the spark pages; the Bag, the wrist menu, the gauges and labels restyled
- [x] ~~Ada, the Lantern's engineer on the table~~: removed at Aditya's request (confusing at the back); the code stays in creatures/mentor.ts
- [x] Confetti on every clear; a live physics readout (speed, height, shadow ×) in spark levels
- [x] The Old Well (the last shadow-animal level) leaves the story; with The Slide and Two Pieces added the story is 20 levels, 19 Journal pages
- [x] Resources as real objects (log bundle, scanned stone, iron ore, herb sprig, crystals, glowing coal) instead of icon coins
- [x] Fix: the Ink Duel crashed on Ada's headlamp sprite (ground raycast)

### Nov 12, evening: the duel grows up (Aditya: "more rivals, each with abilities; whatever we draw comes alive; more wow")
- [x] Twin Gaps made easier for two hands (gaps 22 cm → 15 cm, wider middle island); no one-hand mode
- [x] Audit: no creature-shape levels or baby animals left in the story; the bird chirp on pickups replaced by a clean collect sound
- [x] A roster of six duel rivals, picked on a "choose your rival" screen where each stands beside the card in 3D: Morwen (rune ward), Sgt. Vance (three-shot burst, rolls aside), Captain Rook (fan of three, ducks high throws), Vex (tumbles to a new spot, curveballs), Mako (thick hide: only real ½mv² gets through; ground slam), Kai (parries your ink back at you)
- [x] Drawings come alive: close a shape and it rises as an ink construct with your exact outline, a glowing core (a loose mass in its socket: it floats in free fall) and jointed limbs; it leaps in ballistic arcs and rams the rival; pinch it and throw it; the rival's ink can strike it down. A round loop is a Golem, a tall one a Strider, a wide one a Shellback, a jagged one a Thornback (Nov 13: googly eyes and joke names removed as childish)
- [x] Wow: impact words in the air (FIGHT!, SLAM, PARRY!, CLANG!, K.O.!), hit-stop and a ring of light on big hits, a glowing nib at your pinch, confetti on a win, each rival's ink in their own colour
- [x] Fair fights: after a hit you are safe for 0.9 s, so a volley costs one heart; wins per rival are remembered; "Undisputed" trophy for beating all six
- [ ] On Quest: play each rival once; tune pace and dodge chances by feel

### Nov 13: the happy pass (Aditya: "blurry, a little depressing, instructions not clear, characters should act and have powers; like Little Critters and Tiny Golf")
We compete in the **Gaming track** as a casual puzzle game (seated, hands only); the awards to aim at are Best New Gaming Experience, Best First Five Minutes and Boldest Original Concept.
- [x] ~~The spark as a character with eyes~~: removed the same day as childish (see below)
- [x] Four kinds of spark, picked at random (never the same twice running; the first two levels always get the plain one; the Daily Light's is the same for everyone that day): Ember core (plain), Lodestone (magnet: motes from 7.5 cm), Phoenix core (reignites once on the last ledge), Prism (a dotted line of its next 0.6 s, from the physics run ahead on a copy)
- [x] Nov 13 (Aditya: "a face is childish"): no faces anywhere. The spark is a shard of lantern light: a white-hot core, a ring of six facets turning at v ÷ r, a flare when it collects light, a flicker while it falls
- [x] Mood light: your room stays visible but is washed in the chapter's colours (green-gold, aqua, forge amber, dawn pink, ember red) with soft drifting lights; Settings → Around cycles mood / room / sky. Gives a Quest 2's grey passthrough colour
- [x] Courses in each chapter's bright colours with a lit top band; gold motes with a dark edge; a bolder gate
- [x] Clear instructions: a yellow "Your move" box on every level card; a dashed "your hand's shadow here" guide (always in the first two levels, after two misses elsewhere); the hint comes after two misses, not three; the course waits behind the card
- [x] Sharper: shadow map 2048 (crisp hand-shadow edges), headset render scale 1.2, a readout half as big again
- [x] Fix: the Test button on the bridge levels was half sunk into the bank; the river is a brighter blue
- [ ] On Quest: check frame rate with render scale 1.2 (drop to 1.1 if it stutters); check the mood light's strength over real passthrough

### Nov 13, second pass: real, HD, one Arena (Aditya: "themes don't match; HD and real; merge the bosses into the Arena; bosses should roam; keep my real room; not childish")
- [x] One style everywhere: the spark courses are cut from the world's own photographed ground (earth and grass in the jungle, pebbles and moss by the river, rock and embers at the forge, rock and snow on the mountain, iron and gold for the dragon), so the screen matches the 3D scenery in front of it
- [x] Your real room by default (passthrough, nothing added); Settings → Around also offers a tinted room or a sky. The photographed room tried today is removed; the emulator shows its own living-room passthrough again
- [x] One Arena: the duel's six rivals are Arena bosses too. Battles → Arena opens one roster of all 8 bosses (Sentinel, Dragon, Morwen, Vance, Rook, Vex, Mako, Kai); each stands beside the screen as you browse; **Arena** fights them life-size with the seven weapons, **Ink** (rivals only) is the tabletop drawing duel. The boss button in the Arena cycles all eight
- [x] Life-size rivals roam: they walk an arc in front of you between attacks (closer when enraged below half health), turn to face you to throw, and react to what you do: Vance rolls aside, Rook ducks, Vex tumbles, Kai's blade sends blows back, Mako's hide shrugs off the sword and blaster and he charges in to slam the ground
- [x] Arena records and the Journal count every boss; "Undisputed" counts a rival beaten in either mode
- [x] Name plates fit; spark drawn as a shaded ball
- [ ] On Quest: Arena fights against each rival (walk speed, shot speed, dodge rate by feel)
- [ ] Machine levels (forge, brewing, sky lantern, lock): same "Your move" box is there; their own look still to brighten
- [ ] Trailer and Devpost text: show the Arena roster and a roaming rival

### Nov 13, third pass: fights that are real fights (Aditya: "one draw and I won; boss walks like a robot; the duel hid the screen; more powerful bosses, random moves, superpowers, healing herbs; story tasks medium, not childish")
**Target award: Best New Gaming Experience** (Gaming track, played as a casual puzzle game). Everything is judged against it.
- [x] Ink Duel: rivals have 3× their old health, in **three phases**; no single hit can carry past a phase, so one lucky throw can never win. Each new phase: untouchable for 2 s, a burst of ink, "PHASE 2" / "FINAL PHASE", faster attacks
- [x] Ink Duel: no hit takes more than 22 (33 on the head); a living drawing's ram at most 7
- [x] Ink Duel: **Ink Storm** ultimate in phases 2 and 3 (6, then 9 shots raining from above, after a warning; hanging drawings are a roof)
- [x] Ink Duel: random moves: waits are never the same length; every rival walks to new spots (runs when hurt), on either side of the screen, never in front of its middle (the screen stays clear)
- [x] Ink Duel: **your super, Lantern Burst**: damage you deal and throws you block fill a gold meter; when full, pinch with both hands and pull them apart: eight bolts of light, 9 each, through any ward, parry or hide
- [x] Ink Duel: **healing herbs**: while you are hurt, a herb grows in the air within reach every 14–20 s; pinch it for a heart back
- [x] Walking: legs matched to ground speed (the clip plays at the rate the body moves), a steady pace with a short ease at each end, a run clip when fast: no more gliding
- [x] Menus: Battles → **Duel** (the six rivals) and **Arena** (all eight bosses), each with Prev / **Fight** / **Random** / Next; the boss on the card stands beside the screen
- [x] Arena: rivals have about twice the health (Vance 130, Mako 190, Kai 140…); enraged they run, and fire an **ultimate fan** of seven shots every 12–17 s
- [x] Arena: **you have 8 hearts**; at none you are knocked down and the round restarts; a volley costs one heart; **healing herbs** float within reach while you are hurt (touch one: two hearts)
- [ ] On Quest: tune duel and Arena difficulty by feel (target: a first win against a rival takes 2–4 minutes)
- [ ] Story levels: make the tasks more interactive, medium difficulty (not too easy), with a twist each; not childish
- [ ] Super move for the Arena too (the Arsenal already has seven weapons)

### Notes from building (Nov 12)
- Pinch precision: a pinch cursor (a ring between thumb and index that closes as you pinch; cyan when a shard is in reach, gold while holding) and a pulsing glow on the shard a pinch would take.
- Fixed: winning the Ink Duel saved the story as finished, so Continue restarted at level 1. Side games (duel, Daily Light) now keep the story's place.
- The emulator's grey room is off (iwsdk.config.json); the sky dome shows in the emulator.

### Notes from building (Nov 11)
- The bottom ~40% of the paper is hidden behind the diorama island, so spark courses live in the top half (floor at y = −0.15 m). A spark that drops below y = −0.24 m has fallen out of sight: a miss.
- A sliding-block friction model made the spark stick on gentle slopes; it is now a glassy ball (friction 0.02 on terrain, 0.06 on hands, rolling drag 8%/s).
- Sharp corners eat the spark's speed (each corner removes the normal component); chutes are built from many short segments (`ground()` in run-levels.ts).
- The Kick is forgiving by design: 67 of 88 flick strengths tested win; a cleaner flick collects all three motes.

## 10. Risks and fallbacks

- **The spark mode slips:** the existing campaign still stands. The spark levels go in as a new first act, and nothing old is deleted until the new act works.
- **Hand-shadow physics feels laggy on the device:** raise the hand low-pass cut-off, add 20 ms of prediction, and give more weight to the velocity term.
- **GitHub Pages is blocked by repo settings:** Vercel or Netlify from the `dist/` folder.
- **Running out of time:** cut P2, then P1, in that order. P0 alone is a complete submission.

## 11. Who does what

- **Aditya:**
  - Quest 2 tests and alignment notes
  - enabling GitHub Pages on the repo
  - recording the video on the headset
  - final Devpost form
- **Yash:**
  - Arena balance and polish
  - video editing
  - a first draft of the Devpost text
  - pull `shadowplay` before editing (Story mode copy is gone)
- **Claude:** spark engine, levels, shards, Workshop, visuals, audio, fixes, and keeping this checklist ticked.
