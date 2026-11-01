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
- [x] "Lay one hand flat on your table": a held flat palm finds the real table; the
      jungle grows out of it (earth spreads from the palm, poles rise, room plants unfurl)
- [x] Three themed worlds, each with its own earth, screen frame and room scenery:
      Jungle (bamboo, ivy, tropical plants, fireflies), River (driftwood and moss, pond,
      life-size reeds, river stones, moonlit fireflies), Dragon's Mountain (timber mine
      entrance with hanging lantern, gravel, crystal clusters, boulders, rising embers)
- [x] Menus: Home (Chapters / Play-Continue / Settings) on the screen with push buttons;
      Chapters page with stars and locks where the room becomes each chapter's world as
      you page through; Settings (mute, find table again, recenter); wrist menu gains Menu
- [x] Shadow size is real optics and it matters: a friend's body size comes from its
      shadow's size (hand nearer the lantern = bigger shadow = bigger friend, x0.7 to x1.45).
      Bigger animals walk faster with slower strides (speed ~ sqrt of leg length) and pull
      harder (strength ~ size squared, like muscle cross-section). A live readout shows the
      size while you hold the shape on levels that need a big friend
- [x] Chapter "Friends", level 1, The Old Well: a working horse whim. Crown wheel (36 cogs)
      drives a lantern pinion (9 staves) at right angles, 4:1 to a winding drum; rope coils
      on the drum in a helix, runs over a sheave at its tangent point and down a dark well;
      an iron ratchet clicks every tooth and the pawl catches the load when the horse rests;
      a brass gauge shows the horse's pull against what the bucket needs. A small horse digs
      in, scrabbles and gives up (the load clunks back onto the pawl); a big horse walks the
      circle and winds up the glowing Lantern Stone. Beasts are smooth-shaded now
- [x] Chapter "The Old Mine", The Smithy (hands-on): Lantern Stone lights the charcoal;
      bellows pump air (oxygen) and the fire climbs 650 → 1350 °C; iron heats by Newton's
      law, cools by radiation (T^4) and convection, glows its Planck black-body colour
      (CIE → sRGB) and matches the smith's colour chart; tongs (pinch), hammer (other hand)
      shape it only at forging heat; six blows draw an axe head; quench from above 780 °C
      to harden it in a burst of steam; bare fingers on hot iron hurt. Axe saved to items
- [x] River level 2, The Broken Bridge (hands-on build): pinch-drag timbers between joints
      across the river; Test runs a real pin-jointed truss (XPBD, EA/L springs, tension
      limit, Euler buckling π²EI/L²) with blue/red stress view; squares fold, triangles
      hold; the ore cart rides the deck and falls in the river if it fails
- [x] Final chapter, The Shadow Dragon: a jointed Reiniger-style shadow-puppet dragon fills
      the screen; three hand signs gather an orb of light; throws use a pose buffer with
      40 ms latency rewind and a least-squares release velocity; fireballs come out of the
      screen at you; an open palm reflects them (v' = v − 2(v·n)n) back at the dragon;
      hearts and a health bar; defeat dissolves the shadow; an ending banner
- [x] Jungle chapter rework: the fox (rigged CC0, classic fox hand shadow) replaces the
      plush rabbit and snail; "tiny" levels use shadow-size optics (a small fox fits under
      the roots and into the log); real props: bark log with end grain and moss, knotted
      roots, a leafy tree, glow caps, hollow trunk, ember shards
- [x] Ink Duel vs the computer (menu: Duel): draw in the air, the stroke becomes a solid with
      mass = ink used; grab and throw it under real gravity; damage = ½mv² shown on the
      screen; hanging drawings are shields; a Reiniger-style Rival with a giant quill draws
      and throws back (ballistic aim v = d/T + ½gT), raises ink shields, topples when beaten
- [x] Old Mine level 2, The Healing Draught: a copper cauldron on an iron trammel (notched
      bar, clicks per notch) over a fire pit; radiant heat falls off with height, water
      boils at 100 °C and evaporates; herbs (yarrow, comfrey, sage) steep at an Arrhenius
      rate (Ea/R 4000 K) while heat breaks the oils down faster (Ea/R 15000 K), so a gentle
      simmer is best and a hard boil weakens and boils dry; ladle it into two vials
- [x] Wrist inventory: the palm menu shows what you carry (the axe, draughts) and a Drink
      button that heals a heart in the dragon fight
- [ ] Next: polish pass on every chapter, on-Quest tuning (Nov 12), trailer

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
