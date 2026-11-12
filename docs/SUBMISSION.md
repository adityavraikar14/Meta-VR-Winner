# Devpost submission: draft

Paste-ready text for the submission form. Items in **[brackets]** are for Aditya and Yash to fill in or confirm.

- **Track:** Gaming
- **Division:** New Experience **[confirm: built within the competition window, from Sept 24, 2026]**
- **Build:** WebXR with the Immersive Web SDK, hosted on GitHub Pages: **[https://adityavraikar14.github.io/Meta-VR-Winner/]** (live once Pages is switched on)
- **Video:** **[YouTube or Vimeo link, public, under 3 minutes]**

---

## Submission name

Shadowplay: Escape the Lantern

## Tagline (≤ 140 characters)

> Your hand's shadow is solid. Bend light to build bridges, launch sparks and design courses, seated at your own table, hands only.

(129 characters.)

## Description (about 500 words)

**Inspiration.** Every child has made a shadow puppet; nobody has ever stood on one. We asked what a game would feel like if the shadow of your hand were a real, solid object, and if the physics of light itself were the controls.

**What it does.** A small world grows on your real table, with your room still visible around it: a jungle, a river, a mine, a mountain, each with a white screen and a lantern just behind your eyes. The Great Lantern has shattered into sparks, and a spark can only stand on shadow. Your hands cast the only shadows left.

Hold your hand flat and its shadow is a bridge. Tilt it and it is a ramp. Flick it upward and the moving shadow bats the spark onto a ledge. Your shadow is your hand magnified by D ÷ d: bring it towards the lantern and the shadow grows long enough to span a gap wider than your arm; move it towards the screen and it shrinks thin enough to slip under a low roof. Every level trades power for precision.

Then you build: pinch a glass shard, bring it nearer the lantern to enlarge its shadow, roll your wrist to tilt it, and push Drop. In the Workshop you design whole courses: a star's shadow is the start, a ring's the gate, glass the ground. You build in 3D and play in shadow.

Five chapters (Light & Shadow, Structures, Fire & Iron, Hot Air, The Dragon) run on real science. You build truss bridges that buckle by Euler's law, forge steel by its glow colour, brew against two competing Arrhenius reactions, fly a hot-air lantern, and pick a pin-tumbler lock by feel. The finale is a life-size Shadow Dragon, fought with Light or with the Arsenal, seven weapons summoned by hand signs. Every level fills a page of the Inventor's Journal with the formula and your own numbers. A Daily Light course brings you back each day.

And for fun there is the Ink Duel. Pick one of six rivals, each with their own trick (a ward, a three-shot burst, a duck, a tumble, a thick hide, a parry). Draw a line in the air and it is ink to throw, hitting by its kinetic energy, ½mv². Close a shape and it comes alive: a creature with your exact outline and googly eyes, who hops over and head-butts your rival.

**How we built it.** The game is WebXR on the Immersive Web SDK and three.js, with hand tracking only. We don't read the shadow back from the screen, which would lag. Instead, all 25 tracked joints of each hand are projected through the lantern every frame, P′ = L + (P − L)·D/d, and each bone becomes a 2D capsule the same size as the shadow you see. The spark is sub-stepped so it cannot tunnel through a thin shadow, and it bounces with restitution against the velocity of the moving shadow. Automated tests prove every spark course can be finished, and cannot be finished without you. A generator makes each day's course and proves it in simulation before anyone plays it.

**Challenges.** Making shadow feel solid within a Quest 2's frame budget, making pinches precise, and turning a children's pastime into a game of skill.

**What we learned.** The best controller is a law of physics people already understand.

**What's next.** Sharing Workshop courses, a co-op mode where two people's shadows build one bridge, and a version for Meta VR Glasses' pinch-first input.

## How hand interactions are implemented

- **Shadows as colliders.** Joints are projected through the lantern each frame. Bones become capsules scaled by D/d. Shadow velocities are smoothed finite differences (about 30 ms), so a flick of the wrist is a fast paddle.
- **Pinch.** Grabbing starts at 3 cm between thumb and index and releases at 5 cm, so tracking jitter can't make it chatter. A cursor ring between your fingers closes as you pinch, turns cyan when a piece is in reach and gold while you hold it. The piece your pinch would take pulses.
- **Wrist roll.** The knuckle line's angle on the screen plane turns a held shard, which snaps to 15° when you let go.
- **Fingertips.** You poke 3D push-buttons, and press the lock's tension lever and lift its pins with two fingertips. Fingertip heights are low-passed over 50 ms.
- **Hand signs.** Finger straightness is smoothed over 50 ms. A sign counts only when it is the nearest of all signs to your hand. If you nearly have it for 2.5 s, the caption names the finger to fix. A ghost hand demonstrates each shape.
- **Drawing.** A pinch draws a stroke in the air, sampled every 7 mm. A stroke that ends where it began is a closed shape: it is extruded into a creature, and its roundness (4πA/P²), aspect ratio and corner count decide what kind. Its pupils are simulated as loose masses, so they float while it falls.
- **Throws.** A half-second position history is kept. The newest 40 ms are skipped (tracking lags a fast hand), and the release velocity is a least-squares fit over the 100 ms before.
- **Comfort.** Everything works seated within arm's reach. Turning your palm towards you opens a wrist menu. A prompt appears when tracking loses your hands, and a Relaxed mode slows the spark to 60%.

## What excites us about the future of VR

Hands that act on the world through physics people already know (light, weight, heat), not through menus. On lightweight glasses with pinch-first input, a game whose controller is your shadow needs nothing else.

## Team

- **[Aditya, email]:** game design, story levels, shadow physics, machines, Journal
- **[Yash, email]:** the Arsenal (seven hand-sign weapons), bosses, Arena, Story-mode integration

---

## Video shot list (under 3:00, best material first)

Record on a Quest with **[passthrough / sky]**, seated at a table, hands only.

| Time | Shot | Overlay text |
|---|---|---|
| 0:00–0:08 | A hand rises into the lantern light; its shadow appears; a spark drops onto it and rolls | *Your shadow is solid.* |
| 0:08–0:25 | First Light (hand as bridge), The Kick (flick up), stars on the card | — |
| 0:25–0:40 | Long Shadow: hand toward the lantern, the shadow grows, "×2.4" | *shadow = hand × D ÷ d* |
| 0:40–1:05 | Build: pinch the glass, bring it toward the lantern (×3.5 label), Drop, the spark rides it; the Launch wedge | *Build in 3D. Play in shadow.* |
| 1:05–1:30 | Workshop: place star, ring and glass; Drop; catch the spark with a hand | *Design your own course* |
| 1:30–1:55 | Machines montage: horse whim with a real neigh, a truss buckling, glowing steel, brewing, the sky lantern rising, the lock's pins setting | *Real physics, real science* |
| 1:55–2:15 | The dragon: choose Light or the Arsenal; sword, shield, slingshot; a fireball mirrored back | — |
| 2:15–2:30 | Ink Duel: the roster, draw a blob, it comes alive and head-butts Mako ("BONK!"), Kai parries, K.O. with confetti | *Whatever you draw comes alive* |
| 2:30–2:45 | Daily Light with its streak, a Journal page with your numbers, the Trophy Shelf | *A new course every day* |
| 2:45–3:00 | End card | *Shadowplay · hands only · seated · [URL]* |
