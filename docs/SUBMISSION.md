# Devpost submission

Paste-ready text for the submission form. Items in **[brackets]** are for the team to fill in or confirm.

- **Track:** Gaming
- **Division:** New Experience **[confirm: built within the competition window]**
- **Build (WebXR, Immersive Web SDK, GitHub Pages):** https://adityavraikar14.github.io/Meta-VR-Winner/
- **Video:** **[YouTube or Vimeo link, public, under 3 minutes]**
- **Team:** Four Lanterns (Aditya Raikar, Yash Ammanavar, Sairohita Balam, Rajeshwari Patil)

---

## Submission name

Shadowplay: Escape the Lantern

## Tagline (≤ 140 characters)

> Your hand's shadow is solid. Bend light to build bridges, fight with shadow and drawings, seated at your own table, hands only.

(126 characters.)

## Description

**Inspiration.** Everyone has made a shadow puppet; nobody has ever stood on one. We asked what a game would feel like if the shadow of your hand were a real, solid thing, and if the physics of light itself were the controls.

**What it does.** A small world grows on your real table, with your room still around it. Morwen the Ink Witch has shattered the Great Lantern, bewitched its guardian dragon and spilled her ink over the land. Ink cannot stain a shadow, and your hands cast the only shadows left. A narrated shadow-theatre film tells the story; a second one plays when the dragon is freed, and a third, with the credits, when Morwen falls.

Hold your hand flat and its shadow is a bridge for a spark of the Lantern. Tilt it and it is a ramp. Flick it and the moving shadow kicks the spark onto a ledge. Your shadow is your hand magnified by D ÷ d: bring it towards the lantern and it grows long enough to span a gap wider than your arm; move it towards the screen and it shrinks thin enough to slip under a low roof. Then you build: pinch a glass shard, set its shadow over a gap, and push Drop.

Make the right shadow and it comes alive: a fox, a horse or a stag steps out of the screen onto your table, and in Shadow Pets you feed it berries from your fingers, throw its ball, and teach it tricks by hand signals. Make a V and a slingshot comes alive in your hand, to knock Captain Rook's ink jars off his fence.

Five chapters run on real science: truss bridges that buckle by Euler's law, steel forged by its glow colour, a brew balanced between two reactions, a hot-air lantern, a pin-tumbler lock picked by feel. Every level fills a page of the Inventor's Journal with the formula and your own numbers.

The fights use your hands the same way. A fist's shadow becomes a Shadow Ball, one finger a Spear, an open palm a Shield; punch to throw. Pinch and draw in the air: a circle, triangle or box becomes that weapon, and anything else you draw comes alive and fights beside you. Three ink captains, the Shadow Dragon and Morwen herself; a Training Arena with ghost hands that show every move; and the Arsenal, a life-size Arena of eight bosses fought with hand-sign weapons.

**How we built it.** WebXR on the Immersive Web SDK and three.js, hand tracking only, seated. Each tracked hand is projected through the lantern onto the screen, and the shadow's shape and size come from the same projection you see, P′ = L + (P − L)·D/d. The spark is sub-stepped so it cannot tunnel through a thin shadow. Automated tests prove every course can be finished, and cannot be finished without you; a generator makes each day's Daily Light course and proves it in simulation first.

**Challenges.** Making shadow feel solid within a Quest 2's frame budget, making pinches and signs reliable with real hands, and turning a children's pastime into a game of skill.

**What we learned.** The best controller is a law of physics people already understand.

**What's next.** Sharing Workshop courses, a co-op mode where two people's shadows build one bridge, and a version for lightweight glasses with pinch-first input.

## How hand interactions are implemented

- **Shadows as the controller.** Each hand is projected through the lantern every frame; its shadow is what the spark stands on, what a level judges, and what a fight reads. A sign counts only when its shadow is on the screen.
- **Shapes.** Finger straightness is read from the joints. A creature's shape (fox, horse, stag) is scored finger by finger, and a ghost hand on the screen shows how to make it.
- **Pinch.** Grabbing closes at a few centimetres between thumb and index and releases with hysteresis, so tracking jitter can't make it chatter. A held object stays still while the fingers open, so letting go never flicks or twists it.
- **Drawing.** A pinch draws in the air. A closed shape's roundness (4πA/P²), aspect and corners decide what it is: a circle, triangle or box becomes a weapon; any other stroke comes alive as an ink creature.
- **Throws.** Release velocity is a least-squares fit over the last tenth of a second, skipping the newest frames (tracking lags a fast hand).
- **Fingertips.** You poke 3D push-buttons; the lock's lever and pins are pressed with two fingertips.
- **Comfort.** Everything works seated within arm's reach. An Adjust button moves the screen to suit how you sit (pinch and drag), and the buttons keep a comfortable distance whatever you choose. Exit is on the title screen; a tap on the wrist opens a quick menu. If the headset loses a hand for an instant, its shadow holds still rather than blinking.

## What excites us about the future of VR

Hands that act on the world through physics people already know (light, weight, heat), not through menus. On lightweight glasses with pinch-first input, a game whose controller is your shadow needs nothing else.

## Team: Four Lanterns

- **Aditya Raikar** **[email, role]**
- **Yash Ammanavar** **[email]**: the Arsenal (hand-sign weapons, the Arena and its bosses)
- **Sairohita Balam** **[email, role]**
- **Rajeshwari Patil** **[email, role]**

## Credits

Every third-party model, texture, sound and music track is CC0, CC BY or CC BY-SA, listed with links in `CREDITS.md`, on the in-game Credits page, and in the end credits.

---

## Video shot list (under 3:00, best material first)

Record on a Quest, seated at a table, hands only.

| Time | Shot | Overlay text |
|---|---|---|
| 0:00–0:08 | A hand rises into the lantern light; its shadow appears; a spark drops onto it and rolls | *Your shadow is solid.* |
| 0:08–0:25 | First Light (hand as bridge), The Kick (flick up), Long Shadow (hand to the lantern, the shadow grows) | *shadow = hand × D ÷ d* |
| 0:25–0:45 | A fox shadow comes alive and steps onto the table; feeding it a berry; throwing its ball | *Shadows come alive* |
| 0:45–1:05 | Build: pinch the glass, set its shadow, Drop, the spark rides it | *Build in 3D. Play in shadow.* |
| 1:05–1:25 | Rook's Ink Jars: the V becomes a slingshot, the sight turns green, a jar bursts | — |
| 1:25–1:45 | Machines montage: horse whim, truss buckling, glowing steel, the sky lantern, the lock | *Real physics, real science* |
| 1:45–2:10 | Training's ghost hand; then Captain Rook: fist → Shadow Ball, punch, a drawing comes alive; he melts into ink | *Your hands are the weapons* |
| 2:10–2:35 | The Shadow Dragon: choose Shadow or the Arsenal; a fireball shielded; the dragon freed (film) | — |
| 2:35–2:50 | The Arena: a life-size boss, hand-sign sword and wall | — |
| 2:50–3:00 | End card | *Shadowplay · a Four Lanterns game · hands only · seated* |
