/**
 * How to play each level, in a few plain steps: shown on a big card when a
 * level begins (the first time) and whenever the Hint button is pushed.
 * Fights share one set of steps, plus the captain's own tip.
 */

const DUEL_STEPS = [
  'Pinch thumb and finger together and draw a shape in the air',
  'Open your fingers: the drawing hangs there, solid ink',
  'Pinch it again and throw it hard at them: faster hits harder',
  'Leave drawings hanging in front of you: they block ink thrown at you',
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
  ],
  'run-ramp': [
    'Hold your hand flat in the light',
    'Lift your fingertips higher than your wrist',
    'The tilted shadow is a ramp from the floor up to the ledge',
  ],
  'run-kick': [
    'Hold your hand low, where the spark will land',
    'When it touches your shadow, flick your hand up and to the right',
    'A quick flick kicks it up onto the high shelf',
  ],
  'run-long': [
    'Hold your hand flat in the light',
    'Bring it closer to your face: the shadow grows',
    'Stop when the shadow spans the whole gap',
  ],
  'run-tunnel': [
    'The roof is low: a big shadow will hit it',
    'Push your hand away from your face, toward the screen',
    'The smaller, thinner shadow fits under the roof',
  ],
  'run-twin': [
    'There are two gaps this time',
    'Hold both hands flat, one over each gap',
    'Keep both still until the spark reaches the ring',
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
    'Push Drop',
  ],
  'build-launch': [
    'Pinch the glass wedge',
    'Place its shadow as a ramp from the floor up to the ledge',
    'Its high corner should sit just above the ledge',
    'Let go, then push Drop',
  ],
  'build-slide': [
    'Pinch the plank and hold it in the light',
    'Roll your wrist to tilt it, about 20°',
    'High end under the spark, low end just above the ledge',
    'Let go, then push Drop',
  ],
  'build-pair': [
    'Two gaps, two planks',
    'Pinch one plank and set its shadow over the left gap, resting on the pillar',
    'Set the other over the right gap',
    'Push Drop',
  ],
  'shadow-slingshot': [
    'Make a V with your index and middle fingers, other fingers curled',
    'Hold it still: the V shadow becomes a real slingshot',
    'Pinch the pouch, pull it back toward you, and let go',
    'Knock down all three targets',
  ],
  'broken-bridge': [
    'Pinch an iron anchor on the riverbank',
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
    'Pinch the lantern shard and drop it into the hearth',
    'Pump the bellows: push the top board down, again and again',
    'Pinch the iron bar with the tongs, lay it in the coals until it glows orange',
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
    'Choose your powers: Light (hand shadows) or the Arsenal (hand-sign weapons)',
    'Watch its breath: when it rears back, block or move aside',
    'Strike its head or its glowing heart',
    'Hurt? Turn a palm to your face and push Drink',
  ],
  'fight-rook': DUEL_STEPS,
  'fight-vance': DUEL_STEPS,
  'fight-kai': DUEL_STEPS,
  'fight-morwen': DUEL_STEPS,
  duel: DUEL_STEPS,
  pets: [
    'Make an animal with your hand’s shadow (a fox, a horse, a bird, a rabbit…): it comes alive on the table',
    'Stroke its back slowly with your fingertips: it loves that, and trusts you more',
    'Hold your palm open and flat beside it: it climbs on. Pinch its back to pick it up',
    'Toss it gently and it plays; throw it hard and it is hurt and frightened. Poke it too much and it gets cross',
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
