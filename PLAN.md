# Shadowplay: build plan v2 (two worlds, one light)

Submission target: **Nov 17, 2026** (hard deadline Nov 19, 1:30am IST).
Rule: every step ends playable. A tight, polished slice beats a broad one with gaps
(Meta: "judges play what you submit").

## The pitch
Your hands cast real shadows from a lantern behind you. On the paper lives a flat
**shadow world** where your hand shadows (and lines you draw) are solid ground. In
front of the paper sits a 3D **diorama** with real physics and a chemistry engine.
Friends born from your shadows travel between the two worlds, have personalities,
and react to everything you do.

## Four real systems (no faked science)
1. **Light / optics**: shadow size follows similar triangles (hand nearer the lantern =
   bigger). Shadow size sets the size of the creature that comes alive. Soft edges from
   the lantern's radius (penumbra). Later: coloured lanterns with additive mixing.
2. **Shadow world (2D)**: tiny shadow creatures walk, jump and fall on the hand-shadow
   mask and drawn lines, with real gravity and collision against the mask cells.
3. **Rigid-body physics (3D, Havok)**: fixed step; per-material mass, friction,
   restitution; "toy-scale" gravity so a 10 cm log falls like a real log looks.
   Mechanisms: lever and seesaw (torque = F × d), pulley and counterweight,
   spring (Hooke), pendulum, buoyancy (Archimedes), wind force.
4. **Chemistry engine**: every object has a material and a temperature; elements route
   through states. Fire heats → ice melts to water → water boils to steam (rises, lifts
   a balloon) → cold freezes water into a walkable ice bridge; fire spreads on grass,
   wind spreads fire, water + seed + light grows a plant. Same rule everywhere, no exceptions.

## Hands, engineered precisely (from Meta's hand-tracking research)
- Finger colliders are kinematic capsules moved by velocity, not teleported.
- Grab = pinch or fist plus collider overlap; separate grab / release thresholds (hysteresis).
- Release only after 75 ms of not grabbing, with good tracking confidence; wait 15 ms
  after tracking returns.
- Throw: keep a 1 s pose buffer, rewind ~40 ms for tracking latency, three confidence
  tiers, and score the last second's vectors so throws never "dead drop".
- Filtering: stillness freeze, small-change smoothing, extrapolate low-quality frames
  with damping, blend back over 0.1 s.

## Friends with personality
Look at your hands and face; per-spot touch reactions (pat, tickle, boop, tail pull);
pick up by the scruff (legs dangle on springs), throw → arc, bounce, dizzy, grumpy return;
squash and stretch (volume preserved); personality per friend; gibberish voices;
trust memory; react to your shadows (wolf = hide, bird = chase, giant = cower);
on device: hop onto the real table, hide behind real objects.

## Draw and build
- **Draw with light**: pinch and draw in the air; the line casts a shadow on the paper and
  is solid in the shadow world (bridge, ramp, wall). In the 3D world a drawn stroke becomes
  a physical plank or rope. Draw a closed outline and it comes alive as your own creature.
- **Workshop**: unlocked after the story. Place planks, springs, fans, seesaws, pulleys,
  lanterns and build contraptions; friends ride them. Save and replay your own levels.

## Ideas borrowed from winners (inspiration, not copies)
| From | We take |
|---|---|
| Little Critters | physical comedy: grab, slap, throw; white outline for readability in your room |
| Tiny Golf | one simple gesture (pinch, pull, release); tiny tabletop course; build your own |
| The Nanauts (IWSDK winner) | characters that notice your room and you |
| Pocket Lands | build miniature worlds in mixed reality |
| Breath of the Wild | the chemistry engine idea |

## Levels (few, each dense)
| # | Level | Systems |
|---|---|---|
| 1 | The Lantern | optics: shadow and size |
| 2 | Shadow Bridge | 2D shadow world, hand shadows and drawn lines as ground |
| 3 | Big & Small | shadow size → creature size, boulder, seesaw lever |
| 4 | The Pond | buoyancy, wind from the bird, a drawn sail |
| 5 | Sleeping Garden | coloured light, water, growth chain, pulley |
| 6 | Dragon's Mountain | fire → melt → steam → balloon lift → Great Lantern |
| ∞ | Workshop + free play | build, draw creatures, play with friends |

## Characters
Quaternius Ultimate Animated Animals (CC0, glTF, 12+ animations each) restyled: plush
shading, big eyes, white outline, squash and stretch. Hero characters may be upgraded
to AI-generated HD models (Meshy / Tripo) supplied by the user. Rights must be clear.

## Already done (v1)
- [x] Hand shadows, shape rules, matcher, ghost-hand guide, hand menu
- [x] 7 code-built creatures with pet brain, Forest levels 1–5 (to be reworked)
- [x] Start page, storybook cover with push button, intro shadow-puppet show
- [x] One friend on stage at a time, draw-call pass

## Schedule
- [ ] **Nov 1 – 3** Shadow world on the paper (walk on hand shadows ✅ Shadow Bridge level), size from optics, draw-with-light lines
- [ ] **Nov 4 – 6** Havok physics, precise grab / throw, new restyled characters
- [ ] **Nov 7 – 9** Character brain: reactions, personalities, voices, shadow language
- [ ] **Nov 10 – 12** Chemistry engine, mechanisms, levels 3 – 6
- [ ] **Nov 12 – 14** Workshop (build mode), on-device tuning, room features
- [ ] **Nov 15 – 17** Music, polish, trailer, submit

If behind, cut in this order: coloured lanterns → Workshop saving → draw-a-creature →
level 5. Never cut: shadow world, size optics, physical friends, chemistry finale.

## Risks
- Real-hand feel needs a Quest by ~Nov 12.
- Quest GPU budget: shadow map + mask pass + physics + outlines.
