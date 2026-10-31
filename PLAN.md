# Shadowplay: build plan (0 → 100)

Submission target: **Nov 17, 2026** (hard deadline Nov 19, 1:30am IST).
Rule: every phase ends playable. Nothing half-done ships.

## Game structure
A storybook in three worlds. Each world unfolds as a paper-theatre diorama
on the table in front of you. Each level is a small problem in the scene;
you choose the friend who can solve it and make its shadow with your hands.
The shadow jumps out of the paper as a 3D creature and solves it.

| World | Friends | Levels |
|---|---|---|
| 1. Whispering Forest | Rabbit, Snail, Deer | Warm-up, Fallen Log, Tiny Tunnel, High Berries, Lost Star (choose) |
| 2. Moonlit Pond | Dog, Bird, Butterfly | Buried Lantern, Key Across the Pond, Sleeping Flowers, + choose |
| 3. Dragon's Mountain | Dragon | Combined puzzle using everyone, the Great Lantern, ending |

Teach levels introduce one new shape with a big glowing outline.
Choice levels show cards of every friend you have and let you pick;
the wrong friend tries and fails in a funny way and the paper hints.

Stars per level (max 3): cleared · no hints and no wrong friend · fast.

## Phases
- [x] **0. Core**: hand shadows, shape rules, 7 plush creatures, pet brain, interactions
- [x] **1. Level engine + Forest** (done Oct 30)
  - shared progress state + save (stars, unlocked friends, current level)
  - diorama builder: paper-cut trees, grass, flowers, props
  - creature task scripts (walk, leap, reach, eat, bonk, cheer)
  - story cards, hold-to-match ring, choice cards, stars
  - Forest: 5 levels end to end
  - Pond and Mountain have simple placeholder levels (find the star) until Phase 3/4
- [ ] **2. First five minutes + comfort** (Nov 3 – 4)
  - [x] ghost-hand guide for each shape (gold finger shows what to fix, mirrors for left-handers)
  - [x] hand menu: look at your palm, poke Recenter / Restart / Skip (palm-up stays for pets)
  - [x] draw calls cut ~35% by merging static meshes; real fps check needs a Quest
  - [ ] deploy to Vercel for headset testing
  - [x] start page in the browser (title, Play in VR / Continue, stars so far)
  - [x] storybook cover in VR with a real push button (cap follows the finger, clicks, springs back)
  - [x] one friend on the stage at a time; a new shadow sends the last friend home
- [ ] **2b. Feel like a winner** (from the user's review of past winners: Tiny Golf,
  Little Critters, the slime lab). Weave through phases 3 – 5:
  - hands touch things for real: friends squash when poked, can be picked up and
    carried, fall with gravity and bounce when dropped, react to where they are touched
  - real science in the puzzles: shadow optics (hand closer to the lantern = bigger
    shadow, so size is a puzzle tool), light and dark, a lantern you can move
  - pushable, grabbable props in the diorama (levers, buttons, a lantern) instead of
    only scripted animations
  - polished app feel: a menu screen, settings, transitions, sound on every touch
  - revisit character art so friends read as premium plush toys
- [ ] **3. Moonlit Pond + Draw Mode** (Nov 5 – 10)
- [ ] **4. Dragon's Mountain, ending, collection book, accessibility** (Nov 11 – 14)
  - one-hand alternatives for two-hand shapes, strictness setting, left-handed
- [ ] **5. Music, polish, video, submit** (Nov 15 – 17)

## Risks
- Real-hand tuning needs a Quest by ~Nov 5.
- Quest GPU budget: shadow map + mask pass + plush materials.
