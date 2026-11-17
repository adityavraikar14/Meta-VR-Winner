/**
 * How to play each level, in a few plain steps: shown on a big card when a
 * level begins (the first time) and whenever the Hint button is pushed.
 * Fights share one set of steps, plus the captain's own tip.
 */

const DUEL_STEPS = [
  'Three signs, held up in the light so their shadow is on the screen: ✊ fist = Shadow Ball · ☝ one finger = Shadow Spear · ✋ open palm towards them = Shield',
  'Hold the sign a moment and the weapon forms in your hand; punch towards them to throw it. One weapon at a time',
  'Or pinch and draw in the air: a circle = ball, a triangle = spear, a box = shield',
  'Draw anything else (a line, a squiggle, a star): it comes alive and fights beside you',
  'Hold the shield up to stop their ink. Hurt? Touch a herb',
];

export const HOW_TO: Record<string, string[]> = {
  lantern: [
    'Lift one hand up in front of your face',
    'Look at the screen: your hand casts a shadow there',
    'Hold it still a moment, and the shadow comes alive',
  ],
  'run-bridge': [
    'A spark drops from the star and rolls toward the ring',
    'Hold one hand flat, palm down, at chest height',
    'Keep it still over the gap: its shadow is the bridge',
    'Hold on until the spark rolls into the ring',
    'The ring opens once the spark has picked up a gold star 🔒',
  ],
  'run-ramp': [
    'Hold your hand flat in the light',
    'Lift your fingertips higher than your wrist',
    'The tilted shadow is a ramp from the floor up to the ledge',
    'A thorn lowers over the ledge on a vine: drop the spark when it rises',
    'The ring opens at 2 gold stars',
  ],
  'run-kick': [
    'Hold your hand low, where the spark will land',
    'When it touches your shadow, flick your hand up and to the right',
    'A quick flick kicks it up onto the high shelf',
    'The ring rides along the shelf, and opens at 2 gold stars',
  ],
  'run-long': [
    'Hold your hand flat in the light',
    'Bring it closer to your face: the shadow grows',
    'Stop when the shadow spans the whole gap',
    'A bramble pushes up through the gap: cross while it is down',
  ],
  'run-tunnel': [
    'The roof is low: a big shadow will hit it',
    'Push your hand away from your face, toward the screen',
    'The smaller, thinner shadow fits under the roof',
    'A thorn drips from the roof: time the spark to pass under it',
  ],
  'run-twin': [
    'There are two gaps this time',
    'Hold both hands flat, one over each gap',
    'Keep both still until the spark reaches the ring',
    'The ring wants all 3 gold stars',
  ],
  'build-plank': [
    'Pinch the glowing glass plank in front of your chest',
    'Lift it into the light and watch its shadow on the screen',
    'Line the shadow up with the gap, then open your fingers to let go',
    'Push Drop to send the spark',
  ],
  'build-projection': [
    'Pinch the small glass piece',
    'Bring it toward your face: its shadow grows (about ×3.5)',
    'When the shadow spans the gap, let go',
    'A bramble rises through the gap: push Drop just as it sinks',
  ],
  'build-launch': [
    'Pinch the glass wedge',
    'Place its shadow as a ramp from the floor up to the ledge',
    'Its high corner should sit just above the ledge',
    'Let go, then push Drop. The ring rides along the ledge',
  ],
  'build-slide': [
    'Pinch the plank and hold it in the light',
    'Roll your wrist to tilt it, about 20°',
    'High end under the spark, low end just above the ledge',
    'A thorn lowers onto the landing: push Drop as it rises',
  ],
  'build-pair': [
    'Two gaps, two planks',
    'Pinch one plank, set its shadow over the left gap, then open your fingers: it stays there in the air',
    'Now pinch the other and set it over the right gap. You never hold both at once',
    'Keep both shadows level and above the thorny brambles in the gaps, then push Drop',
  ],
  'shadow-slingshot': [
    'Goal: knock all 5 of Rook’s ink jars off his fence',
    'Make a V with your index and middle fingers, others folded: the slingshot appears in that hand',
    'With your OTHER hand, pinch the pouch between the fork and pull it back towards you',
    'Dots show the stone’s path; the round sight shows where it lands: GREEN means it will hit a jar',
    'Let go to shoot. Missed? Pull again: you have as many stones as you like'
  ],
  'broken-bridge': [
    'Pinch a glowing gold anchor ring on the riverbank',
    'Pull out a timber and let go: it joins where you drop it',
    'Join timbers into triangles all the way across',
    'Push Test to roll the cart over',
  ],
  'ore-train': [
    'This cart is twice as heavy',
    'Add braces: pinch an anchor and pull out more timbers',
    'Make triangles, or add a second truss above the road',
    'Push Test',
  ],
  smithy: [
    'Pinch the glowing orange lantern shard (on the little stone in front of you, under the yellow sign) and drop it into the hearth',
    'Pump the bellows: push the top board down, again and again',
    'Pinch the tongs’ brown handles (clamped on the iron bar, on the bench) and lay the bar in the coals until it glows orange',
    'Lay it on the anvil, pick up the hammer and strike the glowing marks, then cool it in the water',
  ],
  'healing-draught': [
    'Pinch each herb and drop it into the pot',
    'Lower the pot toward the fire to keep it simmering, not boiling',
    'When it is ready, dip the ladle in and pour into the vials',
  ],
  'strong-draught': [
    'The same as before, but brew it to 90 percent',
    'The coals rise and sink: move the pot up and down to keep the simmer',
    'Ladle it into the vials when it is ready',
  ],
  'sword-training': [
    'Hold your hand flat and edge-on, fingers straight, thumb tucked',
    'Hold the pose: your hand becomes a shadow sword',
    'Put the blade in the way of each ink strike to block it',
    'Swing hard into the heavy ones, then slash the ink knots',
  ],
  'sky-lantern': [
    'Pinch the little burner under the paper lantern to light it',
    'Cup your palm under the flame to shelter it: the air heats and it rises',
    'When it drifts toward the crags, sweep your other palm past it to fan it back',
  ],
  'gate-lock': [
    'Press the round lever pad down gently with your left fingertip, and keep it there',
    'With your right fingertip, lift each pin from below: find the stiff one',
    'Lift the stiff pin to the red line until it clicks',
    'Do all four. A spool pin needs an even lighter touch on the lever',
  ],
  'shadow-dragon': [
    'Choose your powers: Shadow (hand shadows and drawings) or the Arsenal (hand-sign weapons)',
    'Arsenal: one sign up in the light and its weapon comes: ✊ sword · 🫴 ball · ✋ shield · 🙌 two palms: wall · 👉 blaster · ✌️ sling',
    'Shadow: hold a fist (ball) or one finger (spear) up in the light, then punch towards the dragon. Or draw a circle or a triangle',
    'Its fire: raise an open palm to bounce it back',
    'Strike its head or its glowing heart',
    'Hurt? Turn a palm to your face and push Drink',
  ],
  'fight-rook': DUEL_STEPS,
  'fight-vance': DUEL_STEPS,
  'fight-kai': DUEL_STEPS,
  'fight-morwen': DUEL_STEPS,
  duel: DUEL_STEPS,
  training: [
    'Copy the ghost hand on your left: it shows each sign, the punch to throw, and each drawing; the card on your right shows your own hand',
    'Hold the sign up in the light (its shadow on the screen): the ring fills and the weapon forms in your hand',
    'Use it on Vance as the card says: punch to throw, or hold the shield up',
    'Seven lessons, each passes by itself; Back and Next pick any. Done? Push Skip. Vance cannot hurt you here',
  ],
  pets: [
    'Choose a pet on the board in front of you, then copy its hand shape in the light: it comes alive',
    'Push any of 28 tricks on the board: sit, roll over, play dead, dance, run laps, follow your finger…',
    'Or give hand signals: palm up = sit, palm down high above = lie down, palm facing it = stay, point at the table = go there, finger gun = play dead',
    'Throw the ball and it fetches. On PLAY · BUILD, build a log, a hoop and a house, then send it over, through and home',
    'Feed it berries from the bowl; rest your palm on its back to put it to sleep. New pet swaps it',
  ],
  workshop: [
    'Pinch a glass piece and hold it in the light: its shadow is ground for the spark',
    'Nearer your face makes it bigger; roll your wrist to tilt it',
    'Build a path from the star to the ring, then push Drop',
    'Push + to add more pieces (beams, pillars, discs, bumps), Undo to take the newest away; Slot keeps three designs',
  ],
};

/** Steps for a level, or null if it has none. */
export function howTo(id: string): string[] | null {
  if (id === 'daily') return HOW_TO['run-bridge'].map((step, i) => (i === 1 ? 'Use your hands as ground: flat for a bridge, tilted for a ramp, nearer your face for a bigger shadow' : step));
  return HOW_TO[id] ?? (id.startsWith('fight-') ? DUEL_STEPS : null);
}
