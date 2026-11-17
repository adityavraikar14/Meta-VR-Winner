# Nov 15 plan: your list, ticked off as each is done

Legend: [x] done and checked · [ ] not done yet

## 1. Level-complete card cut off
- [x] The results card (title, stars, "the spark is home…") is drawn in front of the 3D ground blocks, never hidden behind them (checked in the emulator: First Light's card shows whole, 3 stars)

## 2. Star rating
- [x] Stars = the gold stars you actually collected (0, 1, 2 or 3). Finishing fast no longer gives a free star
- [x] Your best time is still saved and shown, but separately from the stars
- [x] Levels still count as cleared (Lantern pieces, unlocks) even with 0 stars

## 3. Too easy: "hit the ball straight into the ring"
- [x] The ring is **sealed** until you have collected enough stars (shown on the ring: "★ 2"). A ball batted straight at a sealed ring is turned back to the start ("SEALED!"); the stars you already have stay collected
- [x] New things in levels: **moving thorns** that patrol, and **moving rings** on some levels, so timing matters
- [x] Every level still proven finishable by the automatic level test

## 4. The ball blasts when you crush it against a wall with your shadow
- [x] Squeeze the spark hard between your shadow and the ground, a wall or the screen edge: it bursts (flash, pieces, sound) and comes back to the start
- [x] A gentle push or carry does not break it

## 5. Chapters 1 and 2: more interesting levels
| Level | What's new |
|---|---|
| First Light | ring needs 1 star |
| The Climb | ring needs 2 stars, a thorn lowers over the ledge on a vine |
| The Kick | ring needs 2 stars, the ring rides along the shelf |
| Long Shadow | ring needs 2 stars, a bramble pushes up through the gap |
| The Low Tunnel | ring needs 2 stars, a thorn drips from the tunnel roof |
| Twin Gaps | ring needs 3 stars |
| The Plank | ring needs 1 star |
| Projection | ring needs 2 stars, a bramble rises through the gap |
| Launch | ring needs 2 stars, the ring rides along the ledge |
| The Slide | ring needs 2 stars, a thorn lowers onto the landing |
| Two Pieces | ring needs 3 stars |
- [x] All of the above built and tested

## 6. New screen look (not childish, peaceful, no glitter)
- [x] No cartoon sun, sun rays, cartoon clouds, mushrooms or blossom trees on the screen
- [x] A calm painted landscape per chapter: soft sky, misty layered hills fading into the distance
  - Jungle: misty canopy and tall old trees
  - River: calm water and far cliffs
  - Mine: warm haze, rock mesas and the mine's timber frames
  - Mountain: cool layered peaks
  - Dragon: deep dusk and the far castle
- [x] The middle and top stay light, so your hand's dark shadow is always easy to see
- [x] The drifting cartoon clouds are replaced by slow, soft mist

## 7. Arsenal gets every story-mode fight move
- [x] Arena rivals (Thorne, Rook, Vex, Mako, Sable, Vance, Kai, Morwen) fight with their whole 20-move book from story mode: Fan, Curves, Weave, Lob, Sky rain, Wall, Snipe, Spiral, Pincer, Converge, Cross, Ring, Geyser, Slam, Blink, Dash, Leap, Feint, Burst, Stream…
- [x] Moves come from a shuffled deck, so each fight is different; big moves wait until they are hurt, with a warning
- [x] Each move's name is shown when they use it (e.g. "Fan of Knives!")
- [x] Their own special (Sable's parry, Mako's armour, Vex's tumble, Rook's duck) still works
- [x] The Arena shows a health bar for you, the same as the story boss fights

## 8. Check, ship
- [x] Typecheck clean, all tests pass (levels, spark, workshop, daily, arms, sketch)
- [x] Looked at it in the emulator: card (whole, 3 stars), sealed ring caption and lock tag, the lowering thorn on The Climb, the new painting, Arena (Vance used "Double Shot", health bar 100% → 88%). The crush blast is proven by the spark test (it needs a fast real hand)
- [x] Committed and pushed; live link updated

## 9. Nov 16: fights
- [x] Fix: boss fights froze on a blank screen after The Ore Train (a hidden Pet Park label broke the fight's ground check), a6128ef
- [x] Training Arena: bigger, sharper text; big Back / Next buttons on the card; the card now sits low on the table in front of you (clear of Home / Skip / Hint and of Vance)
- [x] Losing a fight shows **YOU LOSE**, who beat you, a tip, and a green **Play again** button: no stars, no "Level cleared". Story boss fights, the Ink Duel and the dragon fight (Light and Arsenal)
- [x] Medium difficulty for every boss:
  - Story fights: rivals take about 11–13 good hits (was 14–17); their hits cost 12 / 15 / 18 (was 15 / 20 / 25), so you survive 6–8 hits; herbs heal 25
  - Mako's toughness 170 → 140
  - Dragon (Light): its fire costs 20 (was 30), so five burns to lose and four reflected fireballs to win
  - Dragon (Arsenal): 6 hearts (was 5)
  - Arena rivals: about 15% less health, since they now use their whole move book
- [x] Checked in the emulator: training card, and the YOU LOSE card after losing to Captain Rook
- [x] Pushed and live

## 10. Nov 16: after the first Quest test
- [x] **Move the screen to suit how you sit:** wrist menu **Move** (or Settings → Move screen), then pinch anywhere in the air and drag. The screen and its whole world follow your hand (twice as far as the hand moves) and keep facing you; a gold frame shows while moving and the game pauses. Let go for a moment and it stays. Distance and height are remembered for next time, and Recenter keeps them
- [x] **Screen blinking fixed:** the painted backdrops (title, levels) sat under a millimetre in front of the white screen and fought it for the depth buffer in the headset; they now draw strictly in order with nothing to fight over. The film's flickering lamp is now a steady glow
- [x] **Quick Tour: Captain Rook is the real 3D character.** The flat shadow puppet only stood in because his model took over 20 s to download on the headset; now the fight waits for him (and the tour fetches him while the film plays). The puppet appears only if every download try fails
- [x] **Quick Tour never leaves a stop on a timer:** each stop moves on only when you finish it or push Skip. The badge says so (Pets and Training: "play as long as you like · push Skip for the next stop")
- [x] Checked in the emulator: move mode (frame, caption, 20 cm drag, settles and saves, game resumes), tour badge; typecheck and all tests pass

## 11. Nov 16: second Quest test
- [x] **The spark falls faster** (gravity 2.2 → 3.6): dropped onto a shard's shadow it now gathers enough speed to roll on to the ring. Every level, daily course and workshop build is still proven finishable
- [x] **Picking things up works like your fingers:** let go as soon as your fingers open a little (about 1.6 cm wider than your tightest pinch), not only at 5 cm; while the fingers open the thing holds still, so letting go never drags or twists it; it does not grab again until you pinch again. Applies to everything you pick up: shards, plants and stones, pets, berries, the ball, the slingshot, forge, brew and bridge pieces, drawings
- [x] **Shards:** follow your hand smoothly (tracking jitter eased out), and stay at exactly the angle you leave them (no more 15° snap on release). Checked in the emulator: pinch, carry 8 cm, open the fingers part way: released, stayed put, same angle
- [x] **Wrist menu no longer pops up during play:** it opens only when you look straight at your open palm, held close to your face, for a full second while playing (half a second elsewhere). Palms raised for shadows no longer open it
- [x] **Big leaves:** the giant leaf plants stand further out to the sides and lower, so they don't arch over the screen; a hand (fingers or palm) anywhere on a big plant pushes it; push firmly and it stays parted out of your way, like real foliage
- [x] Typecheck and all tests pass

## 12. Nov 16: fights made clear and smooth
- [x] **Story fights (captains, Morwen, Ink Duel, the dragon, Training): three signs only.** ✊ Fist = Shadow Ball · ☝ one finger = Shadow Spear · ✋ open palm towards them = Shield. Punch to throw. The other seven shapes (flat-hand sword, peace sign, claw, horns, boomerang, L, thumbs-up) are gone: a relaxed flat hand no longer makes swords
- [x] **A sign counts only on the page:** its shadow must fall on the screen (the hand up in the lantern's light). Hands resting low do nothing; a sign out of the light gets a gentle "lift your hand into the light" hint
- [x] **One weapon at a time:** two hands never fill with two weapons (the other hand can still raise a shield)
- [x] **Fist recognised reliably:** thumb tucked, wrapped across, sticking up or resting by the index all count
- [x] **Drawing always works:** a pinch is drawing, never a sign; pinching drops a half-made weapon from that hand at once; a line can start in the first moments of a pinch (not only the exact frame); for a moment after drawing that hand makes no sign
- [x] **Drawn weapons match the signs:** circle = ball, triangle = spear, box = shield (a hand-drawn circle is recognised more easily); any other closed shape comes alive; a line is ink to throw
- [x] **Arsenal (Arena and the Arsenal dragon): no more charging.** The "hold an invisible ball" step is gone: one sign and its weapon comes straight away. One-hand signs only: ✊ sword · 🫴 ball (palm up) · ✋ shield (palm forward) · 👉 blaster · ✌️ sling (spear and wall can still be drawn). A pinching hand makes no sign; a sign held on summons once; a different sign swaps what you hold; nothing new in the moment after a throw (so throwing the ball can't summon a shield)
- [x] **Arsenal signs count on the page** in the dragon fight, and **in front of you** in the Arena (it has no screen)
- [x] Training: 6 lessons (3 signs, then draw a circle, triangle, box); the Arena tutorial teaches sword, ball and shield with no charging step; How to play cards and the weapons chart updated
- [x] Tests: new sign tests for both systems (45 + 15 checks); all suites pass. Emulator: a fist low in the lap makes nothing, the same fist raised into the light forms the Shadow Ball; in the Arena a fist gives the sword straight away

## 13. Nov 16 evening: pets, blinking, intro voice (third Quest test)
- [x] **Screen blinking on the Quest (Quick Tour, story levels):** the camera's near plane was 1 mm, which leaves the headset's depth buffer almost no precision at screen distance, so layers a few millimetres apart fought and flickered. Near plane now 4 cm (iwsdk.config.json)
- [x] **Intro voice on the Quest:** the headset has no speech voice, so the nine prologue lines are now recorded files (public/audio/voice/intro-1..9.mp3, Windows voice slowed and lowered, a little room echo); scenes are paced to each recording; device speech is only the fallback
- [x] **Pets never sink into the table:** every frame the body's lowest point (hooves, back or flank) is kept on the table's top, so Roll over, Play dead, Lie down, Beg and Rear stay on the surface; tricks no longer push the body down
- [x] **Jump lands cleanly:** the jump clip is timed to the leap, so the legs come down as the body does; it settles into standing
- [x] **Pick up and drop:** lowered onto the table it stands on it, not in it; let go anywhere over the table (its real shape, not a small circle) it lands on the table; thrown at the edge it bumps back in; after a tumble it rights itself smoothly instead of snapping upright
- [x] **Trick board** no longer dips below the table's top (bottom edge always above it, whatever its tilt)
- [x] **Feeding:** hold a berry near its mouth: it looks at it, takes it with its mouth, chews (three crunches, the berry shrinking), then a contented sound, hearts and its call
- [x] **Fetch:** starts at once, runs fast, follows the ball while it still rolls, stops it under its nose, picks it up into its mouth (no teleport), runs back
- [x] **Wrist menu while playing:** never opens by looking at your palm (shadow poses for the stag or horse kept opening it). Tap your wrist with the other index finger instead; it stays until used, tapped again, or 4 s alone. Outside play, looking at the palm still works
- [x] **Stag pose easier:** the pinky may do what it likes (holding it down alone is hard); "fingers up" is more forgiving

## 14. Nov 16 night: exit, adjust, wall, fair bosses, slingshot (fourth Quest test)
- [x] **Exit button:** on the title screen, where Home stands in a level (two pushes: Exit, then Exit? ends the headset session). From any level: Home, then Exit
- [x] **Adjust button** beside the screen, under Home, on the title and in every level (not the Arena): a card on the screen shows the 3 steps (pinch, drag, Done); the button turns into Done while adjusting
- [x] **Wrist menu: never by looking at the palm,** anywhere. Only a tap on the wrist with the other index finger
- [x] **Arsenal defence wall back:** two open palms pushed forward side by side = wall; one palm = shield. No charging. Arena tutorial gains a wall step; signs texts updated
- [x] **Fair bosses (easy to normal):** health marks (a notch every tenth) on every boss bar. Hits by body part: head ×2, legs ×0.7 (story duels show "HEAD −28"). Story duels: health ×1.0 (was 1.35), dodges/parries about half as often, shorter phase shield. Arena bosses: health on the Arsenal's own scale (24–32, was 95–150: about nine body blows). Morwen (Arena) 30 (was 80), Arena dragon 32 (was 60), Arsenal story dragon 22 (was 30), Shadow Dragon body hits count 0.6 (was 0.4)
- [x] **Shadow Slingshot level remade** with the Arena's slingshot: make a V and it appears in that hand; pinch the pouch with the other hand, pull back; bold dark dots show the path and a ring shows where it lands (green = will hit a target, red = miss); let go. Clear steps and the next target named on the caption; how-to card rewritten (same in the Quick Tour). Arena slingshot aim dots made solid and dark too

## 15. Nov 16 late: Training that teaches, drawings that live, a clear dragon choice (fifth Quest test)
- [x] **Buttons no longer hide each other:** Adjust moved to the other side of the screen, level with Home. Pets: the trick board moved to the front right (it sat under Skip and Hint); food, water and ball moved clear
- [x] **Training card out of the way:** small, low and to your right; your sparring partner and your hands stay in view
- [x] **Ghost hands teach every lesson:** a see-through hand on your left makes each sign, holds it, then punches towards Vance (the throw); for drawings it pinches and traces the circle / triangle / box / squiggle with a glowing line, then lets go. A label says each step
- [x] **All lessons, everywhere:** 7 lessons (fist, finger, palm; draw circle, triangle, box; draw anything) in the Training Arena and on the Quick Tour. "Done? Push Skip"; finishing them all moves on by itself
- [x] **Drawing never makes a shield:** signs are off in the drawing lessons; a hand closing towards a pinch (thumb within 6 cm) or just after one (0.9 s) makes no sign
- [x] **Everything you draw comes alive:** circle / triangle / box are weapons; any other stroke (a line, a squiggle, an open shape) comes alive as an ink creature (lines are thickened into a body). A dot vanishes at once with a puff; with three alive, the oldest makes room
- [x] **Captain Rook relaxed:** attacks every 5.2 s (was 3.5), 3.8 s when hurt (was 2.5), health 75 (was 90)
- [x] **Dragon choice explained, and it waits:** a big card says what Shadow (your Training powers) and Arsenal (the Arena's signs) give you; touch and hold a stone; nothing starts until you choose (the Quick Tour no longer skips it)

## 16. Nov 17: the ending, credits, a studio name, tidy for submission
- [x] **Quick Tour: 3 more shadow levels** (10 stops): The Climb (tilt your hand into a ramp), The Kick (swing your hand to kick the spark), Long Shadow (hand towards the lantern stretches the shadow)
- [x] **Beaten fighters don't just vanish:** they fall (death clip), their body drains to black ink, they sink into a spreading ink puddle and dissolve with ink rising off them; "Rook is defeated!" then "melts back into the ink". Every captain, Morwen and every Arena rival (src/fight/ink-death.ts)
- [x] **Story films:** after the Shadow Dragon, 4 narrated scenes (the trance breaks, the dragon bows, Morwen screams, one fight left); after Morwen, 4 more (her ink drains into the storybooks, the captains sink into their pages, the dragon carries the Lantern home, THE END), then the rolling credits. On the Quick Tour, the dragon's film and the credits close the tour. Narration recorded like the prologue
- [x] **Team name: Four Lanterns.** A calm studio ident in the headset (four lanterns light one by one over the name, fade in and out once), and "A Four Lanterns game" on the start page
- [x] **Rolling credits** (end of the story, and Settings → Credits → Roll): the team (Aditya Raikar, Yash Ammanavar, Sairohita Balam, Rajeshwari Patil), the Arsenal by Yash, IWSDK and three.js, every model, the music and every sound with its licence
- [x] **Licences audited:** every third-party file credited in CREDITS.md and in the game (the fox and stag recordings' CC BY-SA, which were missing in the game, added). Unused files removed: an uncredited chime sound and two old animal models. Planning notes moved to docs/

## 17. Nov 17: dragon fight, drawing there, sharp text
- [x] **The Shadow Dragon attacks from the start and keeps at it:** first fire after about a second, then every 2.4–3.3 s (1.8–2.5 s when hurt; was 4–5 s), dives every 2.6–3.6 s
- [x] **Drawing in the dragon fight:** circle / triangle / box are weapons as before; any other drawing now comes alive as a shadow bolt and flies at the dragon (it used to fade away). Caption updated to the three signs
- [x] **Bug fixed:** a fireball hit that ended the fight cleared the fireballs mid-loop and threw an error every frame (both dragon fights)
- [x] **Sharper text in the headset:** fixed foveation lowered from three.js's maximum (1.0) to 0.35, so captions and buttons away from the centre of view are no longer rendered blurry; every texture uses 4× anisotropic filtering; one per-frame allocation removed from the Training ghost

## 18. Nov 17: smooth on the Quest, a clean Adjust, a new slingshot game (sixth Quest test)
- [x] **Lag and blinking while making shadows:** the hand-shadow pass drew the whole scene (every plant, creature and prop) from the lantern each time just to see the two hands; now it draws only the hands. The lantern's shadow map is 1024 (was 2048); the headset renders at its own resolution (was 1.2×, too much for a Quest 2; foveation 0.4 keeps text sharp). A hand the headset drops for a frame or two keeps its last pose for 0.2 s, so its shadow no longer blinks out
- [x] **Adjust, clean:** while adjusting, only the instruction card and Done show (menu row, Home, Skip, Hint, Exit step aside); Done stays where it was pushed (it no longer rides into your hand and toggles off by itself), with a short rest after each push; the drag is calmer (1.5×); the screen can't come closer than 65 cm. All buttons (Play/Skip/Hint/Home/Exit/Adjust, the menu row, the Workshop's) keep the same distance from your eyes wherever the screen is. Pets and creatures ride along with the land when it moves
- [x] **No overlaps:** Adjust sits across from Home, above the Workshop's Slot/Drop/Reset column; the intro film's Skip stands beside the film, clear of its frame; the Quick Tour badge moves above the film while it plays; the level's card no longer draws over things standing in front of it on the table
- [x] **New slingshot game: Rook's Ink Jars** (story and Quick Tour): five jars of Morwen's ink on Rook's fence and two crates, near and far, high and low. The slingshot still comes alive from your V shadow; a round sight that always faces you shows where the stone lands (green on a jar); a hit jar tumbles off and bursts into ink
