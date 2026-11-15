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
