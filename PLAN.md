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
  - ghost-hand guide for each shape
  - palm-up hand menu: recenter, restart level, skip
  - performance pass for Quest (72 fps), lost-tracking handling
  - deploy to Vercel for headset testing
- [ ] **3. Moonlit Pond + Draw Mode** (Nov 5 – 10)
- [ ] **4. Dragon's Mountain, ending, collection book, accessibility** (Nov 11 – 14)
  - one-hand alternatives for two-hand shapes, strictness setting, left-handed
- [ ] **5. Music, polish, video, submit** (Nov 15 – 17)

## Risks
- Real-hand tuning needs a Quest by ~Nov 5.
- Quest GPU budget: shadow map + mask pass + plush materials.
