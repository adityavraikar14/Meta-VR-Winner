# Shadowplay: Escape the Lantern (build plan v3)

Submission target: **Nov 17, 2026** (hard deadline Nov 19, 1:30am IST).
Rule: every step ends playable. A tight, polished slice beats a broad one with gaps
(Meta: "judges play what you submit"). Built brick by brick: one working piece at a time.

## The pitch
You wake up trapped inside an old shadow-theatre box. The only way out is the
**Shadow Dragon's gate**. Your hands are your only tool: their shadows come alive, and
every chapter teaches a new power. In the last chapter you combine every power, charge
an attack with hand signs, throw it at the dragon, and escape.

## Chapters (each unlocks a power)
| # | Chapter | What you do | Power |
|---|---|---|---|
| 1 | Wake Up | your hand's shadow is solid: be the bridge ✅ | Shadow Hands |
| 2 | Ink | pinch and draw a ramp in the air ✅ | Draw with Light |
| 3 | Friends | hand-shadow animals come alive: horse hauls the cart, bird carries the rope | Summon |
| 4 | Forge | gather wood, stone, herbs, ember; mix with real heat rules (charcoal, iron, axe, health potion) | Craft |
| 5 | Camp | build brick by brick or draw parts: tent, wall, bridge, catapult; weak builds fall | Build |
| 6 | The Dragon | hand-sign sequence charges a power, throw it with real throw physics; hide behind your wall, heal with potions | Escape |
| ∞ | Ink Fight | casual duel vs a computer shadow-puppet: draw objects, throw them, health bars | — |

No online multiplayer (decided Oct 31): the duel is against the computer.
Mounts never move the seated player; the world in front of you moves instead.

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

## Characters (adult style, decided Oct 31)
- Real animals: Quaternius CC0 rigged glTF (horse, stag; wolf available), realistic
  proportions, no cartoon faces. Restyled: matte, slightly desaturated, lantern-lit.
  Personality through body language: head follows your hand, flinches from a poke on
  the poked side, relaxes when stroked, kicks after repeated jabs, comes to sniff a still hand.
- Bird and dragon: no good adult CC0 models exist (all cute), so they are authored
  in-house as paper-cut shadow puppets (Lotte Reiniger style) and as a huge shadow
  dragon on the backdrop.
- The old plush pets (rabbit, snail, butterfly) are being phased out of the story.

## Already done
- [x] Hand shadows, shape rules, matcher, ghost-hand guide, hand menu
- [x] Start page, storybook cover with push button, intro shadow-puppet show
- [x] One friend on stage at a time; stage cleared each level
- [x] Chapter 1 Shadow Bridge, Chapter 2 drawn-ink ramp (2D shadow world)
- [x] Rigged glTF animals (Beast): emerge from the paper, idle life, head tracking,
      poke / stroke / temper reactions, synthesized snort, nicker and hooves
- [x] Photo-real environment (Poly Haven CC0): walnut theatre with velvet curtains and brass
      lip, walnut plinth with brass inlay, rolling forest-floor ground, swaying grass,
      scanned ferns / flowers / mossy rocks / stump, pond with rippling water and pebble
      bank, warm studio HDRI lighting. Credits in CREDITS.md
- [x] Jungle grows into your room (Oct 31 feedback: no round table): an organic slab of
      jungle earth with a ragged eroded edge, bamboo screen frame lashed with rope and ivy,
      life-size tropical plants on the floor around the player, hanging vines, fireflies.
      Scenery loads a few files at a time and retries failures.
- [ ] Next: "lay your hand on your table" so the jungle earth sits on the real table;
      more themes (river, mountain cave) re-skinning slab, frame and room plants

## Schedule
- [ ] **Nov 1 – 3** Chapter 3 Summon: horse hand shape, cart-hauling level, chapter map and saving
- [ ] **Nov 4 – 6** Chapter 4 Forge: resources, cauldron with heat rules, health, wrist inventory
- [ ] **Nov 7 – 9** Chapter 5 Camp: brick-by-brick build mode with physics
- [ ] **Nov 9 – 12** Chapter 6 Dragon: hand-sign detection, charge and throw, boss fight
- [ ] **Nov 12 – 14** On a Quest: tune hand feel; Ink Fight vs computer
- [ ] **Nov 15 – 17** Art, music, polish, trailer, submit

If behind, cut in this order: Ink Fight → catapult → bird chapter beat → extra recipes.
Never cut: shadow world, summoned friends, crafting core, dragon finale.

## Risks
- Real-hand feel needs a Quest by ~Nov 12.
- Quest GPU budget: shadow map + mask pass + physics + outlines.
