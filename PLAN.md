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
- [ ] P0 Make the target outline and ghost hand clearly visible
- [ ] P0 Laptop mouse test mode (section 7)
- [ ] P0 Spark physics engine with projected hand capsules (5.1–5.3) and a Node physics test
- [ ] P0 Act I levels 1–3 playable

### Day 2 — Thu Nov 12 (Quest 2 in hand)
- [ ] P0 Quest 2 alignment pass with the checklist; fix what's off
- [ ] P0 Act I levels 4–6
- [ ] P0 Spark look and sound: glow, trail, bounce sparks, tink pitched by impact speed
- [ ] P0 Stars, ranks and best times (5.5)

### Day 3 — Fri Nov 13
- [ ] P0 Light shards: grab, move, depth, rotate, budget (5.4)
- [ ] P0 Act II levels 7–12
- [ ] P0 First deploy to GitHub Pages

### Day 4 — Sat Nov 14
- [ ] P0 New story order (section 4); first run goes straight into Act I
- [ ] P0 Rewrite every story line for ages 15–35
- [ ] P1 Workshop sandbox with three save slots (5.7)
- [ ] P1 Daily Light (5.6)

### Day 5 — Sun Nov 15
- [ ] P0 Brighter look and sky backdrop (section 6)
- [ ] P1 Real animal voices with credits
- [ ] P1 Eating fixed
- [ ] P1 Journal pages for the spark levels: projection, collisions, restitution

### Day 6 — Mon Nov 16 (feature freeze at night)
- [ ] P0 Full playthrough on Quest; frame rate check; fix everything found
- [ ] P1 Accessibility: one-hand mode, assist speed (0.6×), left-handed, sound captions
- [ ] P0 Final deploy

### Day 7 — Tue Nov 17
- [ ] P0 Video: shot list, recording on Quest, edit
- [ ] P0 Devpost text: tagline, description, hand interactions, team
- [ ] P0 Submit (by Nov 18 evening IST)

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
